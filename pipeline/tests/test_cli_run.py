"""Integration test for the ``zpevnik run`` command.

Generates a synthetic PDF + profile YAML, invokes the Typer CLI, and asserts
the manifest written to disk is a valid :class:`RunManifest`.
"""

from __future__ import annotations

import json
from pathlib import Path

import fitz
from typer.testing import CliRunner

from zpevnik_pipeline.cli import app
from zpevnik_pipeline.manifest import read_manifest


def _make_pdf(path: Path, n_pages: int = 3) -> None:
    doc = fitz.open()
    for i in range(n_pages):
        page = doc.new_page(width=595, height=842)
        # Leading "N. Title" matches the profile's numberingRegex.
        page.insert_text((72, 100), f"{i + 1}. Title {i + 1}", fontsize=18)
    doc.save(path)
    doc.close()


def _write_profile(path: Path) -> None:
    path.write_text(
        """name: test-profile
pdf: test.pdf
language: cs
dpi: 100
pageInverted: auto
segmentation:
  strategy: numbered-heading
  numberingRegex: '^(\\d{1,3})\\.\\s'
""",
        encoding="utf-8",
    )


def test_cli_run_writes_manifest(tmp_path: Path) -> None:
    pdf = tmp_path / "test.pdf"
    profile = tmp_path / "profile.yaml"
    songs = tmp_path / "songs"
    _make_pdf(pdf, n_pages=3)
    _write_profile(profile)

    result = CliRunner().invoke(
        app,
        [
            "run",
            str(pdf),
            "--profile",
            str(profile),
            "--songs",
            str(songs),
        ],
    )
    assert result.exit_code == 0, result.output
    manifest_path = songs / "_manifest.json"
    assert manifest_path.exists()
    manifest = read_manifest(manifest_path)
    assert manifest.profile == "test-profile"
    assert manifest.dpi == 100
    assert len(manifest.pages) == 3
    assert [p.page for p in manifest.pages] == [1, 2, 3]
    # Hashes are stable, non-empty, and unique-per-page (different content per page).
    hashes = [p.hash for p in manifest.pages]
    assert all(len(h) == 64 for h in hashes)
    assert len(set(hashes)) == 3
    # All pages have a text layer in this synthetic PDF, so none should be "scanned".
    assert all(p.textExtractable for p in manifest.pages)
    assert all(p.kind in {"text", "notation_heavy"} for p in manifest.pages)

    segments_path = songs / "_segments.json"
    assert segments_path.exists()
    segments = json.loads(segments_path.read_text())
    # Profile uses numbered-heading; each synthetic page starts "1. ", "2. ", ...
    assert segments["profile"] == "test-profile"
    assert [s["number"] for s in segments["segments"]] == [1, 2, 3]
    assert all(s["pages"] == [n] for n, s in enumerate(segments["segments"], start=1))

    layout_path = songs / "_layout.json"
    assert layout_path.exists()
    layout = json.loads(layout_path.read_text())
    assert layout["profile"] == "test-profile"
    # Layout output mirrors the song list, with `lines` arrays per page.
    assert [s["number"] for s in layout["songs"]] == [1, 2, 3]
    for song in layout["songs"]:
        for page in song["pages"]:
            # Synthetic PDF has no staves → empty `lines`; just assert the
            # field shape is right.
            assert isinstance(page["lines"], list)


def test_cli_run_respects_custom_manifest_path(tmp_path: Path) -> None:
    pdf = tmp_path / "x.pdf"
    profile = tmp_path / "p.yaml"
    _make_pdf(pdf, n_pages=1)
    _write_profile(profile)
    custom = tmp_path / "elsewhere" / "manifest.json"

    result = CliRunner().invoke(
        app,
        [
            "run",
            str(pdf),
            "--profile",
            str(profile),
            "--songs",
            str(tmp_path / "songs"),
            "--manifest",
            str(custom),
        ],
    )
    assert result.exit_code == 0, result.output
    assert custom.exists()
    assert not (tmp_path / "songs" / "_manifest.json").exists()
