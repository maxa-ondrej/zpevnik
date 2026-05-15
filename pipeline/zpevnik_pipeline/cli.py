"""Typer-based CLI entry point — `zpevnik …`."""

from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console

from .config import load_profile

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
) -> None:
    """Run the full PDF → ChordPro pipeline."""
    cfg = load_profile(profile)
    console.print(f"[bold cyan]Profile:[/bold cyan] {cfg.name} ({cfg.language})")
    console.print(f"[bold cyan]PDF:[/bold cyan] {pdf}")
    console.print(f"[bold cyan]Output:[/bold cyan] {songs_dir}")
    console.print(f"[bold cyan]Force overwrite approved:[/bold cyan] {force}")
    console.print("[yellow]Pipeline stages not yet implemented.[/yellow]")
    # TODO: wire stages 1–12 here as they land.


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
