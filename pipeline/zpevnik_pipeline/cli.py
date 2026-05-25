"""Typer-based CLI entry point — `zpevnik …`."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import numpy.typing as npt
import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)

from .config import load_profile
from .extract.classify import classify_page
from .extract.hashing import hash_page
from .extract.normalize import normalize
from .extract.rasterize import rasterize_pdf
from .manifest import PageRecord, RunManifest, now_utc, write_manifest
from .models import SongMeta
from .output.chordpro import emit_song
from .output.slug import slugify
from .output.staves import write_stave_pngs
from .output.writer import write_index, write_song
from .parse.align import AlignedLine, align_line
from .parse.layout import SongLine, detect_song_lines
from .parse.ocr import OcrToken, ocr_chord_row, ocr_lyric_row
from .parse.segment import SongSegment
from .parse.segment import segment as segment_pages

ImageU8 = npt.NDArray[np.uint8]

app = typer.Typer(
    name="zpevnik",
    help="Convert a Christian songbook PDF into a structured ChordPro tree.",
    no_args_is_help=True,
)
profile_app = typer.Typer(help="Inspect and validate profile YAMLs.", no_args_is_help=True)
app.add_typer(profile_app, name="profile")
console = Console()


@app.command()
def run(
    pdf: Path = typer.Argument(..., exists=True, dir_okay=False, help="Input PDF."),
    profile: Path = typer.Option(..., "--profile", "-p", exists=True, dir_okay=False),
    songs_dir: Path = typer.Option(
        Path("../songs"), "--songs", help="Output songs/ directory."
    ),
    force: bool = typer.Option(False, "--force", help="Re-process approved songs."),
    manifest_path: Path | None = typer.Option(
        None,
        "--manifest",
        help="Write the run manifest here. Default: <songs>/_manifest.json.",
    ),
    skip_ocr: bool = typer.Option(
        False,
        "--skip-ocr",
        help="Skip stage 5 (Tesseract OCR). Useful during early-stage tuning.",
    ),
) -> None:
    """Run the full PDF → ChordPro pipeline."""
    cfg = load_profile(profile)
    console.print(f"[bold cyan]Profile:[/bold cyan] {cfg.name} ({cfg.language})")
    console.print(f"[bold cyan]PDF:[/bold cyan] {pdf}")
    console.print(f"[bold cyan]Output:[/bold cyan] {songs_dir}")
    console.print(f"[bold cyan]Force overwrite approved:[/bold cyan] {force}")

    page_range = cfg.segmentation.pageRange

    records: list[PageRecord] = []
    page_texts: list[tuple[int, str]] = []
    page_song_lines: dict[int, list[SongLine]] = {}
    # OCR results keyed by (page_no, line_index) → {"chord": [...], "lyric": [...]}
    page_line_ocr: dict[tuple[int, int], dict[str, list[OcrToken]]] = {}
    # Pre-cropped stave bands keyed by (page_no, line_index). Smaller than
    # full pages, so we can keep them across the segmentation pass without
    # the memory cost of normalized full-page images.
    page_line_stave: dict[tuple[int, int], ImageU8] = {}

    label = "Rasterize → normalize → classify → layout"
    if not skip_ocr:
        label += " → OCR"
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(label, total=None)
        for r in rasterize_pdf(pdf, dpi=cfg.dpi, page_range=page_range):
            clean, stats = normalize(r.image)
            cls = classify_page(r.page, r.image, text_extractable=r.text_extractable)
            records.append(
                PageRecord(
                    page=r.page,
                    hash=hash_page(r.raw_bytes),
                    kind=cls.kind,
                    textExtractable=cls.textExtractable,
                    notationDensity=cls.notationDensity,
                    detectedStaffLines=cls.detectedStaffLines,
                    inverted=stats.inverted,
                    skewDeg=stats.skew_deg,
                )
            )
            page_texts.append((r.page, r.text))
            # Only run layout on pages that actually carry music — skip pure
            # text frontmatter to save work and avoid spurious "staves" from
            # underlines on prose pages.
            if cls.kind != "text":
                lines = detect_song_lines(clean, layout=cfg.layout)
                page_song_lines[r.page] = lines
                page_h = clean.shape[0]
                for idx, line in enumerate(lines):
                    chord_crop = clean[line.chord_y[0]:line.chord_y[1], :]
                    lyric_crop = clean[line.lyric_y[0]:line.lyric_y[1], :]
                    stave_top = max(0, line.chord_y[0])
                    stave_bot = min(page_h, line.lyric_y[1])
                    page_line_stave[(r.page, idx)] = clean[stave_top:stave_bot, :].copy()
                    if not skip_ocr:
                        page_line_ocr[(r.page, idx)] = {
                            "chord": ocr_chord_row(chord_crop),
                            "lyric": ocr_lyric_row(lyric_crop, lang=cfg.ocr.tesseractLang),
                        }
            else:
                page_song_lines[r.page] = []
            progress.update(task, advance=1)

    manifest = RunManifest(
        generatedAt=now_utc(),
        profile=cfg.name,
        pdf=str(pdf),
        dpi=cfg.dpi,
        pages=records,
    )
    out = manifest_path or (songs_dir / "_manifest.json")
    write_manifest(out, manifest)

    by_kind: dict[str, int] = {}
    for rec in records:
        by_kind[rec.kind] = by_kind.get(rec.kind, 0) + 1
    console.print(f"[green]Wrote manifest:[/green] {out}  ({len(records)} pages)")
    for k, v in sorted(by_kind.items()):
        console.print(f"  [cyan]{k}:[/cyan] {v}")

    segments = segment_pages(page_texts, profile=cfg.segmentation)
    segments_path = out.parent / "_segments.json"
    _write_segments(segments_path, segments, profile_name=cfg.name)
    console.print(
        f"[green]Wrote segments:[/green] {segments_path}  ({len(segments)} songs)"
    )

    layout_path = out.parent / "_layout.json"
    _write_layout(
        layout_path,
        segments=segments,
        page_song_lines=page_song_lines,
        profile_name=cfg.name,
    )
    total_lines = sum(
        len(page_song_lines.get(p, [])) for s in segments for p in s.pages
    )
    console.print(
        f"[green]Wrote layout:[/green] {layout_path}  ({total_lines} song-lines)"
    )

    if skip_ocr:
        console.print("[yellow]Stage 5 (OCR) skipped via --skip-ocr.[/yellow]")
        console.print("[yellow]Stages 6–12 require OCR; nothing more to do.[/yellow]")
        return

    ocr_path = out.parent / "_ocr.json"
    _write_ocr(
        ocr_path,
        segments=segments,
        page_song_lines=page_song_lines,
        page_line_ocr=page_line_ocr,
        profile_name=cfg.name,
    )
    total_chord_tokens = sum(len(v["chord"]) for v in page_line_ocr.values())
    total_lyric_tokens = sum(len(v["lyric"]) for v in page_line_ocr.values())
    console.print(
        f"[green]Wrote OCR:[/green] {ocr_path}  "
        f"({total_chord_tokens} chord, {total_lyric_tokens} lyric tokens)"
    )

    # Stages 6–12: per-song assembly and write-out.
    written_songs = 0
    skipped_approved = 0
    metas: list[SongMeta] = []
    for fallback_idx, seg in enumerate(segments, start=1):
        aligned: list[AlignedLine] = []
        stave_crops: list[ImageU8] = []
        for page_no in seg.pages:
            for idx, _line in enumerate(page_song_lines.get(page_no, [])):
                tokens = page_line_ocr.get((page_no, idx), {"chord": [], "lyric": []})
                aligned.append(align_line(tokens["chord"], tokens["lyric"]))
                crop = page_line_stave.get((page_no, idx))
                if crop is not None:
                    stave_crops.append(crop)

        emitted = emit_song(
            number=seg.number,
            title=seg.title,
            aligned_lines=aligned,
            language=cfg.language,
        )

        # ID: zero-pad the song number when known, else the segment's
        # position in the document. 3+ digits to match the SongMeta schema.
        id_int = seg.number if seg.number is not None else fallback_idx
        song_id = f"{id_int:03d}"
        slug = slugify(emitted.title)

        has_staves = len(stave_crops) > 0
        meta = SongMeta(
            id=song_id,
            slug=slug,
            title=emitted.title,
            number=seg.number,
            language=cfg.language,
            sourcePdf=str(pdf.name),
            sourcePages=list(seg.pages),
            hasStaffImages=has_staves,
            staveCount=len(stave_crops),
            reviewStatus="auto",
        )

        song_dir, written = write_song(
            songs_dir, meta=meta, chordpro=emitted.chordpro, force=force
        )
        if written and has_staves:
            write_stave_pngs(song_dir / "staves", stave_crops)
        if written:
            written_songs += 1
            metas.append(meta)
        else:
            # Approved on disk; surface the existing meta into the index unchanged.
            skipped_approved += 1
            from .output.writer import _read_existing_meta  # local import; private helper

            existing = _read_existing_meta(song_dir / "meta.json")
            if existing is not None:
                metas.append(existing)

    index_path = write_index(songs_dir, metas)
    console.print(
        f"[green]Wrote {written_songs} songs[/green] under {songs_dir}"
        + (f" (skipped {skipped_approved} approved)" if skipped_approved else "")
    )
    console.print(f"[green]Wrote index:[/green] {index_path}")


def _write_segments(path: Path, segments: list[SongSegment], *, profile_name: str) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "profile": profile_name,
        "segments": [
            {"number": s.number, "title": s.title, "pages": s.pages} for s in segments
        ],
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    tmp.replace(path)


def _ocr_token_payload(token: OcrToken) -> dict[str, object]:
    return {
        "text": token.text,
        "x": [token.x_left, token.x_right],
        "y": [token.y_top, token.y_bottom],
        "confidence": token.confidence,
    }


def _write_ocr(
    path: Path,
    *,
    segments: list[SongSegment],
    page_song_lines: dict[int, list[SongLine]],
    page_line_ocr: dict[tuple[int, int], dict[str, list[OcrToken]]],
    profile_name: str,
) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    songs_payload = []
    for s in segments:
        pages_payload = []
        for page_no in s.pages:
            lines = page_song_lines.get(page_no, [])
            line_payload = []
            for idx, _line in enumerate(lines):
                tokens = page_line_ocr.get((page_no, idx), {"chord": [], "lyric": []})
                line_payload.append(
                    {
                        "chord": [_ocr_token_payload(t) for t in tokens["chord"]],
                        "lyric": [_ocr_token_payload(t) for t in tokens["lyric"]],
                    }
                )
            pages_payload.append({"page": page_no, "lines": line_payload})
        songs_payload.append(
            {"number": s.number, "title": s.title, "pages": pages_payload}
        )
    payload = {"version": 1, "profile": profile_name, "songs": songs_payload}
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    tmp.replace(path)


def _write_layout(
    path: Path,
    *,
    segments: list[SongSegment],
    page_song_lines: dict[int, list[SongLine]],
    profile_name: str,
) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    songs_payload = []
    for s in segments:
        pages_payload = []
        for page_no in s.pages:
            lines = page_song_lines.get(page_no, [])
            pages_payload.append(
                {
                    "page": page_no,
                    "lines": [
                        {
                            "staff_lines_y": line.staff_lines_y,
                            "staff_y": list(line.staff_y),
                            "chord_y": list(line.chord_y),
                            "lyric_y": list(line.lyric_y),
                        }
                        for line in lines
                    ],
                }
            )
        songs_payload.append(
            {"number": s.number, "title": s.title, "pages": pages_payload}
        )
    payload = {"version": 1, "profile": profile_name, "songs": songs_payload}
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    tmp.replace(path)


@profile_app.command("validate")
def profile_validate(path: Path = typer.Argument(..., exists=True, dir_okay=False)) -> None:
    """Validate a profile YAML against the schema."""
    cfg = load_profile(path)
    console.print(f"[green]OK[/green] — profile [bold]{cfg.name}[/bold] is valid.")


@app.command()
def review(
    songs_dir: Path = typer.Option(Path("../songs"), "--songs"),
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8765, "--port"),
) -> None:
    """Launch the local review UI (FastAPI)."""
    try:
        import uvicorn

        from .review.server import create_app
    except ImportError as e:  # pragma: no cover
        console.print(
            f"[red]Install with the [review] extra: pip install -e '.[review]'[/red]\n{e}"
        )
        raise typer.Exit(code=1) from e
    fastapi_app = create_app(songs_dir=songs_dir)
    uvicorn.run(fastapi_app, host=host, port=port)


@app.command()
def musicxml(
    input_path: Path = typer.Argument(..., exists=True, dir_okay=False),
    songs_dir: Path = typer.Option(Path("../songs"), "--songs"),
    title: str = typer.Option("", "--title", help="Override title (XML often omits it)."),
    id_: str = typer.Option("", "--id", help="3+ digit id; auto-numbered if omitted."),
    number: int | None = typer.Option(None, "--number", help="Songbook ordinal."),
    source: str = typer.Option(
        "", "--source",
        help="Provenance URL/path stored in meta.json sourcePdf.",
    ),
    force: bool = typer.Option(
        False, "--force",
        help="Overwrite even when the existing song is reviewStatus=approved.",
    ),
) -> None:
    """Convert one MusicXML file into a songs/<id>-<slug>/ directory.

    Writes song.cho, melody.json, and meta.json; rebuilds songs/index.json.
    """
    import json as _json
    import re as _re
    import urllib.request as _urllib

    from .musicxml import convert_musicxml
    from .musicxml.extra_verses import ExtraVerse, extract_extra_verses
    from .output.writer import _read_existing_meta, write_index, write_song

    # If --source is a proscholy.cz /soubor/{N}.xml URL, auto-fetch the
    # matching kytara PDF to pick up verses 2/3+ (which the XML lacks).
    extra_verses: list[ExtraVerse] = []
    m_src = _re.match(
        r"^https?://zpevnik\.proscholy\.cz/soubor/(\d+)\.xml$", source,
    )
    if m_src:
        rid = m_src.group(1)
        kytara_url = f"https://zpevnik.proscholy.cz/soubor/ez/pdf/kytara/{rid}.pdf"
        cache_path = Path("/tmp/zpevnik-musicxml-cache") / f"kytara-{rid}.pdf"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        if not cache_path.exists():
            try:
                req = _urllib.Request(
                    kytara_url, headers={"User-Agent": "zpevnik-pipeline/0.1"}
                )
                with _urllib.urlopen(req, timeout=30) as resp:
                    cache_path.write_bytes(resp.read())
            except Exception:
                cache_path = None  # type: ignore[assignment]
        if cache_path is not None and cache_path.exists():
            try:
                extra_verses = extract_extra_verses(cache_path)
            except Exception:
                extra_verses = []

    result = convert_musicxml(
        input_path, title=title or None, extra_verses=extra_verses,
    )

    # Resolve id: explicit > auto-incremented from existing songs/.
    if id_:
        if not _re.fullmatch(r"\d{3,}", id_):
            console.print(f"[red]--id must be 3+ digits, got {id_!r}[/red]")
            raise typer.Exit(code=1)
        new_id = id_
    else:
        existing_ids: list[int] = []
        if songs_dir.is_dir():
            for d in songs_dir.iterdir():
                m = _re.match(r"^(\d{3,})-", d.name)
                if m:
                    existing_ids.append(int(m.group(1)))
        new_id = f"{max(existing_ids, default=0) + 1:03d}"

    result.meta["id"] = new_id
    if number is not None:
        result.meta["number"] = number
    if source:
        result.meta["sourcePdf"] = source

    # Fill the schema-required fields that the converter can't infer.
    if not result.meta.get("sourcePdf"):
        result.meta["sourcePdf"] = f"musicxml:{input_path.name}"
    if not result.meta.get("sourcePages"):
        result.meta["sourcePages"] = [1]

    meta_model = SongMeta.model_validate(result.meta)

    songs_dir.mkdir(parents=True, exist_ok=True)
    song_dir, written = write_song(
        songs_dir, meta=meta_model, chordpro=result.song_cho, force=force,
    )
    if not written:
        console.print(
            f"[yellow]Skipped[/yellow] {song_dir} — reviewStatus=approved; "
            "pass --force to overwrite."
        )
        return

    # melody.json is the converter's contribution beyond what write_song does.
    melody_path = song_dir / "melody.json"
    melody_path.write_text(
        _json.dumps(result.melody, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # Rebuild the index from whatever's on disk so the new song shows up.
    metas: list[SongMeta] = []
    for d in sorted(songs_dir.iterdir()):
        meta_file = d / "meta.json"
        if meta_file.is_file():
            existing = _read_existing_meta(meta_file)
            if existing is not None:
                metas.append(existing)
    write_index(songs_dir, metas)

    console.print(f"[green]Wrote[/green] {song_dir}")
    console.print(f"  song.cho     ({len(result.song_cho)} bytes)")
    console.print(f"  melody.json  ({len(result.melody['blocks'])} blocks)")
    console.print(f"  meta.json    (id={new_id}, slug={meta_model.slug})")


@app.command("musicxml-batch")
def musicxml_batch(
    ids: str = typer.Option(
        ..., "--ids",
        help="Comma-separated list and/or ranges, e.g. '1,3,5-10,17'.",
    ),
    base_url: str = typer.Option(
        "https://zpevnik.proscholy.cz/soubor",
        "--base-url",
        help="Base URL — '{base}/{id}.xml' is fetched per id.",
    ),
    songs_dir: Path = typer.Option(Path("../songs"), "--songs"),
    cache_dir: Path = typer.Option(
        Path("/tmp/zpevnik-musicxml-cache"),
        "--cache",
        help="Local cache for downloaded XMLs (avoids re-fetching).",
    ),
    force: bool = typer.Option(
        False, "--force",
        help="Re-convert even when an existing song matches the source URL.",
    ),
) -> None:
    """Batch-convert MusicXML files from a remote source.

    Per-id flow: download `{base_url}/{id}.xml` (cached), convert,
    derive a placeholder title from the first lyric syllables, allocate
    the next available local id, write the song folder. Skips ids that
    were already converted from the same source URL (use --force to
    re-do them). Songs/index.json is rebuilt once at the end.
    """
    import json as _json
    import urllib.request as _urllib

    from .musicxml import convert_musicxml
    from .musicxml.convert import first_phrase_title
    from .musicxml.parser import parse_musicxml
    from .output.writer import _read_existing_meta, write_index, write_song

    remote_ids = _parse_id_spec(ids)
    if not remote_ids:
        console.print("[red]No ids parsed from --ids[/red]")
        raise typer.Exit(code=1)
    cache_dir.mkdir(parents=True, exist_ok=True)
    songs_dir.mkdir(parents=True, exist_ok=True)

    # Local id IS the proscholy soubor id (zero-padded). No pre-scan
    # needed: deterministic mapping, no allocation. The only reason
    # to consult existing folders is the early-skip path below.

    # Single GraphQL roundtrip for the {media_id → canonical title}
    # map. /soubor/N.xml and song_lyric.id use DIFFERENT id spaces
    # (file 4 ≠ song 4); the only reliable bridge is the externals
    # relation, which lists every MusicXML attachment's media_id and
    # the song_lyric it belongs to. Empty dict on failure → all songs
    # fall back to first_phrase_title.
    xml_titles = _fetch_proscholy_xml_titles(cache_dir)

    new_metas: list[SongMeta] = []
    skipped: list[tuple[int, str]] = []
    wrote: list[tuple[int, str, str]] = []  # (remote_id, local_id, title)

    for rid in remote_ids:
        source_url = f"{base_url}/{rid}.xml"
        cache_path = cache_dir / f"{rid}.xml"
        local_id_padded = f"{rid:03d}"
        # An existing `{rid:03d}-*` dir means this song has been
        # converted before (with the same deterministic id).
        existing_dir = next(
            (
                d
                for d in (songs_dir.iterdir() if songs_dir.is_dir() else [])
                if d.is_dir() and d.name.startswith(f"{local_id_padded}-")
            ),
            None,
        )

        # Skip if already on disk (unless --force).
        if not force and existing_dir is not None:
            skipped.append((rid, f"already converted → {existing_dir.name}"))
            continue

        # Download (cache hit avoids re-fetch).
        if not cache_path.exists():
            try:
                req = _urllib.Request(source_url, headers={"User-Agent": "zpevnik-pipeline/0.1"})
                with _urllib.urlopen(req, timeout=30) as resp:
                    body = resp.read()
                cache_path.write_bytes(body)
            except Exception as e:
                skipped.append((rid, f"download failed: {e}"))
                continue

        # Also pull the kytara (guitar) PDF — it carries verses 2/3+
        # as bare text under the staff. Best-effort: a missing or
        # non-parseable PDF just means no extra verses for this song.
        kytara_path = cache_dir / f"kytara-{rid}.pdf"
        kytara_url = f"https://zpevnik.proscholy.cz/soubor/ez/pdf/kytara/{rid}.pdf"
        if not kytara_path.exists():
            try:
                req = _urllib.Request(kytara_url, headers={"User-Agent": "zpevnik-pipeline/0.1"})
                with _urllib.urlopen(req, timeout=30) as resp:
                    kytara_path.write_bytes(resp.read())
            except Exception:
                # Many soubor ids don't have a kytara PDF — silent skip.
                kytara_path = None  # type: ignore[assignment]

        from .musicxml.extra_verses import ExtraVerse, extract_extra_verses

        extra_verses: list[ExtraVerse] = []
        if kytara_path is not None and kytara_path.exists():
            try:
                extra_verses = extract_extra_verses(kytara_path)
            except Exception:
                extra_verses = []

        # Parse + derive title.
        try:
            song = parse_musicxml(cache_path)
        except Exception as e:
            skipped.append((rid, f"parse failed: {e}"))
            continue
        # Look up the canonical name via the pre-built externals map.
        # /soubor/N.xml maps to a song_lyric only via the externals
        # relation, since file ids and song_lyric ids live in
        # different spaces (file 4 is a different entity from
        # song_lyric 4). Fall back to first_phrase_title when proscholy
        # has the file but no externals record for it.
        title = xml_titles.get(f"{rid}.xml") or first_phrase_title(song)

        # Convert (re-parses inside, but reuses our title via override).
        result = convert_musicxml(cache_path, title=title, extra_verses=extra_verses)
        # Local id IS the proscholy soubor id — gives a 1:1 mapping
        # so song-detail URLs (/song/004) line up with the source
        # (/soubor/004.xml, /pisen/4). Zero-padded to 3 digits since
        # the corpus only goes up to ~800.
        local_id = f"{rid:03d}"
        result.meta["id"] = local_id
        # For proscholy.cz, the soubor id IS the canonical songbook number;
        # surface it in the list as the visible number column.
        result.meta["number"] = rid
        result.meta["sourcePdf"] = source_url
        if not result.meta.get("sourcePages"):
            result.meta["sourcePages"] = [1]

        try:
            meta_model = SongMeta.model_validate(result.meta)
        except Exception as e:
            skipped.append((rid, f"meta validation failed: {e}"))
            continue

        # If --force changes the slug for an already-converted id,
        # blow away every OTHER `{local_id}-*` folder so we don't end
        # up with duplicates for the same logical song. Scan at write
        # time (not pre-scan) so we catch existing stale folders too,
        # not just the one we mapped first.
        if force:
            import shutil as _shutil

            target_name = f"{local_id}-{meta_model.slug}"
            for d in songs_dir.iterdir():
                if d.is_dir() and d.name.startswith(f"{local_id}-") and d.name != target_name:
                    _shutil.rmtree(d, ignore_errors=True)

        song_dir, written = write_song(
            songs_dir, meta=meta_model, chordpro=result.song_cho, force=force,
        )
        if not written:
            skipped.append((rid, f"skipped (existing approved): {song_dir.name}"))
            continue
        (song_dir / "melody.json").write_text(
            _json.dumps(result.melody, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        new_metas.append(meta_model)
        wrote.append((rid, local_id, title))

    # Rebuild index from all on-disk metas (new + pre-existing).
    all_metas: list[SongMeta] = []
    for d in sorted(songs_dir.iterdir()):
        meta_file = d / "meta.json"
        if meta_file.is_file():
            existing = _read_existing_meta(meta_file)
            if existing is not None:
                all_metas.append(existing)
    write_index(songs_dir, all_metas)

    console.print()
    console.print(f"[green]Converted[/green] {len(wrote)} song(s):")
    for rid, lid, title in wrote:
        console.print(f"  /soubor/{rid}.xml → {lid}  [bold]{title}[/bold]")
    if skipped:
        console.print(f"\n[yellow]Skipped[/yellow] {len(skipped)}:")
        for rid, reason in skipped:
            console.print(f"  /soubor/{rid}.xml — {reason}")


def _fetch_proscholy_xml_titles(cache_dir: Path) -> dict[str, str]:
    """Build a single `{ media_id → song_lyric.name }` map for every
    MusicXML external registered on proscholy.cz.

    On proscholy, the URL `/soubor/<N>.xml` is NOT keyed by song_lyric
    id — it's a file in a separate id space. The actual canonical
    title for that XML is reachable only through the song_lyric the
    file is attached to. The GraphQL `externals(media_type:"file/xml")`
    query returns every such attachment in one shot, so we fetch all
    ~700 entries once and look up by media_id (e.g. "4.xml" for the
    `/soubor/4.xml` URL).

    Result cached at <cache>/xml-externals.json — re-using on
    subsequent batch runs avoids re-hammering the GraphQL endpoint.
    """
    import json as _json
    import urllib.request as _urllib

    cache_path = cache_dir / "xml-externals.json"
    if not cache_path.exists():
        try:
            payload = _json.dumps(
                {
                    "query": (
                        '{ externals(media_type: "file/xml")'
                        " { media_id song_lyric { name } } }"
                    )
                }
            ).encode("utf-8")
            req = _urllib.Request(
                "https://zpevnik.proscholy.cz/graphql",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "zpevnik-pipeline/0.1",
                },
            )
            with _urllib.urlopen(req, timeout=60) as resp:
                cache_path.write_bytes(resp.read())
        except Exception:
            return {}
    try:
        body = _json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    externals = (body or {}).get("data", {}).get("externals") or []
    out: dict[str, str] = {}
    for e in externals:
        if not isinstance(e, dict):
            continue
        media_id = e.get("media_id")
        song_lyric = e.get("song_lyric") or {}
        name = song_lyric.get("name") if isinstance(song_lyric, dict) else None
        if isinstance(media_id, str) and isinstance(name, str) and name.strip():
            out[media_id] = name.strip()
    return out


def _parse_id_spec(spec: str) -> list[int]:
    """Expand a spec like '1,3,5-10,17' into a deduped sorted id list."""
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo_s, hi_s = part.split("-", 1)
            lo, hi = int(lo_s), int(hi_s)
            out.update(range(min(lo, hi), max(lo, hi) + 1))
        else:
            out.add(int(part))
    return sorted(out)


if __name__ == "__main__":  # pragma: no cover
    app()
