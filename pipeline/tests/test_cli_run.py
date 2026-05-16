"""Integration test for the ``zpevnik run`` command.

Generates a synthetic PDF + profile YAML, invokes the Typer CLI, and asserts
the manifest written to disk is a valid :class:`RunManifest`.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import fitz
import pytest
from typer.testing import CliRunner

from zpevnik_pipeline.cli import app
from zpevnik_pipeline.manifest import read_manifest


def _have_tesseract_with(lang: str) -> bool:
    if shutil.which("tesseract") is None:
        return False
    try:
        out = subprocess.run(
            ["tesseract", "--list-langs"], capture_output=True, text=True, check=True
        )
    except subprocess.CalledProcessError:
        return False
    return lang in out.stdout.splitlines()


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

    # OCR pass also ran; synthetic PDF has no staves so no per-line tokens
    # were produced, but the file shape mirrors layout.
    ocr_path = songs / "_ocr.json"
    assert ocr_path.exists()
    ocr_doc = json.loads(ocr_path.read_text())
    assert ocr_doc["profile"] == "test-profile"
    assert [s["number"] for s in ocr_doc["songs"]] == [1, 2, 3]
    for song in ocr_doc["songs"]:
        for page in song["pages"]:
            assert page["lines"] == []


@pytest.mark.skipif(
    not _have_tesseract_with("eng"),
    reason="Tesseract not installed; can't exercise the full pipeline.",
)
def test_cli_run_writes_song_files_and_index(tmp_path: Path) -> None:
    """End-to-end: PDF with one song that has staves + chord/lyric text →
    songs/001-test-song/{song.cho,meta.json,staves/*.png} + songs/index.json."""
    pdf = tmp_path / "music.pdf"
    profile = tmp_path / "p.yaml"
    songs = tmp_path / "songs"

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 40), "1. Test Song", fontsize=18)
    page.insert_text((72, 180), "C        G        Am        F", fontsize=14)
    for i in range(5):
        page.draw_line((60, 200 + i * 12), (535, 200 + i * 12), color=(0, 0, 0), width=1.2)
    page.insert_text((72, 290), "hello world today", fontsize=14)
    doc.save(pdf)
    doc.close()

    profile.write_text(
        """name: end-to-end
pdf: music.pdf
language: cs
dpi: 300
pageInverted: auto
segmentation:
  strategy: numbered-heading
  numberingRegex: '^(\\d{1,3})\\.\\s+(.*)$'
ocr:
  tesseractLang: eng
""",
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        app,
        ["run", str(pdf), "--profile", str(profile), "--songs", str(songs)],
    )
    assert result.exit_code == 0, result.output

    # Per-song dir present with the expected three artifacts.
    song_dir = songs / "001-test-song"
    assert song_dir.is_dir(), [p.name for p in songs.iterdir()]
    cho = (song_dir / "song.cho").read_text()
    assert "{title:" in cho and "Test Song" in cho
    assert "{number: 1}" in cho
    # At least one chord made it through alignment + emission.
    assert any(c in cho for c in ["[C]", "[G]", "[Am]", "[F]"])

    meta = json.loads((song_dir / "meta.json").read_text())
    assert meta["id"] == "001"
    assert meta["slug"] == "test-song"
    assert meta["language"] == "cs"
    assert meta["sourcePages"] == [1]
    assert meta["hasStaffImages"] is True
    assert meta["reviewStatus"] == "auto"

    # Stave PNGs written.
    staves = sorted((song_dir / "staves").iterdir())
    assert [p.name for p in staves] == ["01.png"]

    # Repo-root index updated.
    index = json.loads((songs / "index.json").read_text())
    assert index["version"] == 1
    assert [s["id"] for s in index["songs"]] == ["001"]


@pytest.mark.skipif(
    not _have_tesseract_with("eng"),
    reason="Tesseract not installed; can't exercise full OCR loop.",
)
def test_cli_run_writes_ocr_tokens_when_staves_present(tmp_path: Path) -> None:
    """End-to-end: a synthetic page with staves + chord text + lyric text must
    produce non-empty OCR tokens in _ocr.json. Guards against silent breakage
    in the crop → tesseract path."""
    pdf = tmp_path / "music.pdf"
    profile = tmp_path / "p.yaml"
    songs = tmp_path / "songs"

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 40), "1. Test Song", fontsize=18)
    # Chord row (above the staff)
    page.insert_text((72, 180), "C        G        Am        F", fontsize=14)
    # Five staff lines
    for i in range(5):
        page.draw_line((60, 200 + i * 12), (535, 200 + i * 12), color=(0, 0, 0), width=1.2)
    # Lyric row (below the staff)
    page.insert_text((72, 290), "hello world", fontsize=14)
    doc.save(pdf)
    doc.close()

    profile.write_text(
        """name: ocr-test
pdf: music.pdf
language: cs
dpi: 300
pageInverted: auto
segmentation:
  strategy: numbered-heading
  numberingRegex: '^(\\d{1,3})\\.\\s'
ocr:
  tesseractLang: eng
""",
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        app,
        ["run", str(pdf), "--profile", str(profile), "--songs", str(songs)],
    )
    assert result.exit_code == 0, result.output

    ocr_doc = json.loads((songs / "_ocr.json").read_text())
    # Walk to the first detected line and assert tokens came through.
    first_song = ocr_doc["songs"][0]
    first_page = first_song["pages"][0]
    assert first_page["lines"], "expected at least one OCR'd song-line"
    chord_tokens = first_page["lines"][0]["chord"]
    lyric_tokens = first_page["lines"][0]["lyric"]
    chord_texts = [t["text"] for t in chord_tokens]
    lyric_texts = " ".join(t["text"] for t in lyric_tokens).lower()
    assert any(t in {"C", "G", "Am", "F"} for t in chord_texts), chord_texts
    assert "hello" in lyric_texts or "world" in lyric_texts, lyric_texts


def test_cli_run_skip_ocr_omits_ocr_file(tmp_path: Path) -> None:
    pdf = tmp_path / "x.pdf"
    profile = tmp_path / "p.yaml"
    songs = tmp_path / "songs"
    _make_pdf(pdf, n_pages=1)
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
            "--skip-ocr",
        ],
    )
    assert result.exit_code == 0, result.output
    assert (songs / "_manifest.json").exists()
    assert (songs / "_segments.json").exists()
    assert (songs / "_layout.json").exists()
    assert not (songs / "_ocr.json").exists()


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
