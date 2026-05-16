"""FastAPI app powering the manual-review UI.

Endpoints (all responses are JSON unless noted):

* ``GET  /api/songs``                — repo-root index.json (lazily refreshed).
* ``GET  /api/songs/{id}``           — meta + chordpro source + stave URLs.
* ``PUT  /api/songs/{id}``           — partial update of meta + chordpro; bumps
  reviewStatus and rewrites the index on success.
* ``GET  /api/songs/{id}/melody``    — body of ``melody.json`` (404 if absent).
* ``PUT  /api/songs/{id}/melody``    — write ``melody.json``; same
  auto→flagged promotion as the chordpro PUT.
* ``GET  /songs/...``                — static-serve the songs tree (PNGs + .cho).
* ``GET  /``                         — tiny HTML/JS reviewer UI from ``./static/``.
* ``GET  /health``                   — liveness ping.

All write paths reuse :func:`output.writer.write_song` (atomic +
approved-aware) with ``force=True``: in the review context the human is
the source of truth, so we don't honor the approved-sticky rule when
the human is making the edit.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from ..models import SongMeta
from ..output.writer import write_index, write_song


class SongDetail(BaseModel):
    """Full payload returned by ``GET /api/songs/{id}``."""

    model_config = ConfigDict(extra="forbid")

    meta: SongMeta
    chordpro: str
    staveUrls: list[str]


class SongUpdate(BaseModel):
    """Partial update accepted by ``PUT /api/songs/{id}``.

    Any field left ``None`` is preserved from the existing meta. The id /
    slug / sourcePdf / sourcePages fields are intentionally not editable
    via this endpoint — renaming a song needs a slug+folder rewrite.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    number: int | None = None
    key: str | None = None
    tempo: int | None = Field(default=None, ge=20, le=300)
    chordpro: str | None = None
    reviewStatus: Literal["auto", "flagged", "approved"] | None = None


def _find_song_dir(songs_dir: Path, song_id: str) -> Path | None:
    """Return the ``<id>-<slug>/`` directory for ``song_id``, if any."""
    for child in songs_dir.iterdir():
        if child.is_dir() and child.name.startswith(f"{song_id}-"):
            return child
    return None


def _read_song(songs_dir: Path, song_id: str) -> tuple[Path, SongMeta]:
    song_dir = _find_song_dir(songs_dir, song_id)
    if song_dir is None:
        raise HTTPException(status_code=404, detail=f"song {song_id!r} not found")
    meta = SongMeta.model_validate_json((song_dir / "meta.json").read_text(encoding="utf-8"))
    return song_dir, meta


def _refresh_index(songs_dir: Path) -> list[SongMeta]:
    """Re-read every meta.json under ``songs_dir`` and rewrite index.json."""
    metas: list[SongMeta] = []
    for child in sorted(songs_dir.iterdir()):
        meta_path = child / "meta.json"
        if not (child.is_dir() and meta_path.exists()):
            continue
        try:
            metas.append(SongMeta.model_validate_json(meta_path.read_text(encoding="utf-8")))
        except Exception:
            # Malformed metas are skipped; a fresh pipeline run will fix them.
            continue
    write_index(songs_dir, metas)
    return metas


def _stave_urls(song_dir: Path, count: int) -> list[str]:
    name = song_dir.name
    return [f"/songs/{name}/staves/{i + 1:02d}.png" for i in range(count)]


def create_app(songs_dir: Path) -> FastAPI:
    songs_dir = songs_dir.resolve()
    songs_dir.mkdir(parents=True, exist_ok=True)
    api = FastAPI(title="Zpěvník Review", version="0.1.0")

    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        api.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # Read-only static mount of the songs tree so the browser can <img>
    # the staves and (if needed) download the raw song.cho directly.
    api.mount("/songs", StaticFiles(directory=str(songs_dir)), name="songs")

    @api.get("/health")
    def health() -> dict[str, str | bool]:
        return {"ok": True, "songs": str(songs_dir)}

    @api.get("/api/songs")
    def list_songs() -> dict[str, object]:
        metas = _refresh_index(songs_dir)
        return {
            "version": 1,
            "songs": [m.model_dump(mode="json") for m in metas],
        }

    @api.get("/api/songs/{song_id}", response_model=SongDetail)
    def get_song(song_id: str) -> SongDetail:
        song_dir, meta = _read_song(songs_dir, song_id)
        chordpro = (song_dir / "song.cho").read_text(encoding="utf-8")
        return SongDetail(
            meta=meta,
            chordpro=chordpro,
            staveUrls=_stave_urls(song_dir, meta.staveCount),
        )

    @api.put("/api/songs/{song_id}", response_model=SongDetail)
    def update_song(song_id: str, update: SongUpdate) -> SongDetail:
        song_dir, meta = _read_song(songs_dir, song_id)

        # Merge: each None field falls through to the existing value.
        merged = meta.model_copy(
            update=update.model_dump(exclude={"chordpro"}, exclude_none=True)
        )
        # If the human touched anything but didn't pick a status, promote
        # "auto" → "flagged". auto means "pipeline output, untouched".
        if update.reviewStatus is None and meta.reviewStatus == "auto":
            merged = merged.model_copy(update={"reviewStatus": "flagged"})

        chordpro_text = (
            update.chordpro
            if update.chordpro is not None
            else (song_dir / "song.cho").read_text(encoding="utf-8")
        )

        # ``force=True`` because the human is explicitly editing — the
        # approved-sticky rule protects humans from the pipeline, not
        # from themselves.
        new_dir, _ = write_song(songs_dir, meta=merged, chordpro=chordpro_text, force=True)
        _refresh_index(songs_dir)

        return SongDetail(
            meta=merged,
            chordpro=chordpro_text,
            staveUrls=_stave_urls(new_dir, merged.staveCount),
        )

    @api.get("/api/songs/{song_id}/melody")
    def get_melody(song_id: str) -> JSONResponse:
        song_dir, _ = _read_song(songs_dir, song_id)
        melody_path = song_dir / "melody.json"
        if not melody_path.exists():
            raise HTTPException(
                status_code=404, detail=f"melody.json missing for {song_id!r}"
            )
        try:
            data = json.loads(melody_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"melody.json for {song_id!r} is not valid JSON: {exc}",
            ) from exc
        return JSONResponse(content=data)

    @api.put("/api/songs/{song_id}/melody")
    def put_melody(song_id: str, body: Annotated[Any, Body()]) -> JSONResponse:
        song_dir, meta = _read_song(songs_dir, song_id)
        _validate_melody(body)

        melody_path = song_dir / "melody.json"
        _atomic_write_json(melody_path, body)

        # Mirror the song.cho PUT: a human touch flips auto → flagged so
        # we never lose track of edits that left the meta otherwise unchanged.
        if meta.reviewStatus == "auto":
            promoted = meta.model_copy(update={"reviewStatus": "flagged"})
            chordpro_text = (song_dir / "song.cho").read_text(encoding="utf-8")
            write_song(songs_dir, meta=promoted, chordpro=chordpro_text, force=True)
            _refresh_index(songs_dir)

        return JSONResponse(content=body)

    @api.get("/", include_in_schema=False)
    def root() -> FileResponse:
        index_html = static_dir / "index.html"
        if not index_html.exists():
            raise HTTPException(status_code=404, detail="reviewer UI not built")
        return FileResponse(str(index_html))

    return api


def _validate_melody(body: object) -> None:
    """Validate a melody.json payload: header (str), verses (list[str]).

    The optional ``chorus`` field, if present, must be a string. Any other
    fields are accepted to leave room for future schema growth.
    """
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="melody must be a JSON object")
    header = body.get("header")
    if not isinstance(header, str):
        raise HTTPException(status_code=400, detail="melody.header must be a string")
    verses = body.get("verses")
    if not isinstance(verses, list) or not all(isinstance(v, str) for v in verses):
        raise HTTPException(
            status_code=400, detail="melody.verses must be a list of strings"
        )
    chorus = body.get("chorus")
    if chorus is not None and not isinstance(chorus, str):
        raise HTTPException(
            status_code=400, detail="melody.chorus, if present, must be a string"
        )


def _atomic_write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    tmp.replace(path)
