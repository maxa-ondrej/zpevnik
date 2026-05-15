"""Typer-based CLI entry point — `zpevnik …`."""

from __future__ import annotations

from pathlib import Path

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
from .parse.layout import SongLine, detect_song_lines
from .parse.segment import SongSegment, segment as segment_pages

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
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Rasterize → normalize → classify → layout", total=None)
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
                page_song_lines[r.page] = detect_song_lines(clean, layout=cfg.layout)
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
    console.print("[yellow]Stages 5–12 not yet implemented.[/yellow]")


def _write_segments(path: Path, segments, *, profile_name: str) -> None:
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
        raise typer.Exit(
            f"Install with the [review] extra: pip install -e '.[review]'\n{e}"
        ) from e
    fastapi_app = create_app(songs_dir=songs_dir)
    uvicorn.run(fastapi_app, host=host, port=port)


if __name__ == "__main__":  # pragma: no cover
    app()
