"""Standalone uvicorn entry for the reviewer service.

Usage:
    python -m zpevnik_pipeline.review --songs ./songs [--host 0.0.0.0] [--port 8765]

Mirrors the `zpevnik review` Typer subcommand but skips the heavy
pipeline imports (numpy, opencv, pytesseract, pdfplumber, pymupdf,
Pillow) that cli.py pulls in at module load. Used by
pipeline/Dockerfile to keep the reviewer image small — the reviewer
only touches `..models` + `..output.writer`, both pure-stdlib +
pydantic.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from .server import create_app


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="zpevnik_pipeline.review",
        description="Run the reviewer service.",
    )
    parser.add_argument("--songs", type=Path, default=Path("./songs"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    app = create_app(args.songs)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
