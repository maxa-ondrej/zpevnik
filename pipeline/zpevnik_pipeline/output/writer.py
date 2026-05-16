"""Stages 11 + 12 — write per-song artifacts and the repo-root ``index.json``.

Each song lands in ``songs/<id>-<slug>/`` with:

* ``song.cho`` — the ChordPro text from :mod:`output.chordpro`;
* ``meta.json`` — a :class:`zpevnik_pipeline.models.SongMeta` document;
* ``staves/NN.png`` — written separately by :mod:`output.staves`.

``reviewStatus: approved`` is sticky: a manual review elevates a song into
the "human-trusted" pool, and the pipeline must not silently overwrite
that work on the next run. The ``force`` flag opts out.

A successful pipeline run finishes by rewriting the repo-root
``songs/index.json`` with the *current* set of songs (whether they were
written this run or skipped because they were already approved).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..models import SongIndex, SongMeta


def song_dir_name(meta: SongMeta) -> str:
    return f"{meta.id}-{meta.slug}"


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def _read_existing_meta(path: Path) -> SongMeta | None:
    if not path.exists():
        return None
    try:
        return SongMeta.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception:
        # A malformed meta.json shouldn't block a re-run — fall through to overwrite.
        return None


def write_song(
    songs_root: Path,
    *,
    meta: SongMeta,
    chordpro: str,
    force: bool = False,
) -> tuple[Path, bool]:
    """Write ``song.cho`` and ``meta.json`` for one song.

    Returns ``(song_dir, written)``. ``written`` is ``False`` when the
    existing on-disk meta is ``reviewStatus: approved`` and ``force`` is
    not set — in that case the on-disk files are left untouched and the
    caller should use them as-is for index assembly.
    """
    song_dir = songs_root / song_dir_name(meta)
    existing = _read_existing_meta(song_dir / "meta.json")
    if existing is not None and existing.reviewStatus == "approved" and not force:
        return song_dir, False

    _atomic_write_text(song_dir / "song.cho", chordpro)
    _atomic_write_text(
        song_dir / "meta.json",
        json.dumps(meta.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
    )
    return song_dir, True


def write_index(songs_root: Path, metas: list[SongMeta]) -> Path:
    """Rewrite ``songs/index.json`` with the given (validated) metas."""
    index = SongIndex(
        generatedAt=datetime.now(timezone.utc),
        songs=sorted(
            metas, key=lambda m: (m.number is None, m.number or 0, m.id)
        ),
    )
    path = songs_root / "index.json"
    _atomic_write_text(
        path,
        json.dumps(index.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
    )
    return path
