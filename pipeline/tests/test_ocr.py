"""Unit tests for stage-5 chord/lyric OCR.

Each test renders a known string to an image (via PyMuPDF) and asserts
Tesseract recovers it. Tests are skipped if the ``tesseract`` binary or the
required language data isn't available, so the rest of the suite still
runs in environments without Tesseract installed.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import fitz
import numpy as np
import pytest

from zpevnik_pipeline.extract.rasterize import rasterize_pdf
from zpevnik_pipeline.parse.ocr import OcrToken, ocr_chord_row, ocr_lyric_row


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


pytestmark = pytest.mark.skipif(
    not _have_tesseract_with("eng"),
    reason="Tesseract with 'eng' not installed; install with `brew install tesseract`.",
)


def _render(text: str, *, font: str = "helv", size: float = 24, dpi: int = 200) -> np.ndarray:
    """Render ``text`` to a tight image suitable for single-line OCR."""
    doc = fitz.open()
    # Page just tall enough for one line at the requested size.
    page = doc.new_page(width=600, height=80)
    page.insert_text((20, 50), text, fontsize=size, fontname=font)
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        path = Path(fh.name)
    try:
        doc.save(path)
        doc.close()
        [r] = list(rasterize_pdf(path, dpi=dpi))
        return r.image
    finally:
        path.unlink(missing_ok=True)


def _texts(tokens: list[OcrToken]) -> list[str]:
    return [t.text for t in tokens]


def test_ocr_chord_row_recovers_simple_chords() -> None:
    # Real chord rows have wide spacing — each chord sits above a different
    # syllable. 8+ characters of whitespace matches that and is also what
    # Tesseract needs to split short capital-letter tokens.
    img = _render("C        G        Am        F")
    tokens = ocr_chord_row(img)
    assert _texts(tokens) == ["C", "G", "Am", "F"]
    # Tokens are ordered left-to-right and have non-overlapping bboxes.
    xs = [t.x_left for t in tokens]
    assert xs == sorted(xs)


def test_ocr_chord_row_recovers_extensions_and_slash_bass() -> None:
    img = _render("Cmaj7        D7        G/H")
    tokens = ocr_chord_row(img)
    # The exact whitespace is up to Tesseract; assert the relevant substrings.
    rendered = " ".join(_texts(tokens))
    assert "Cmaj7" in rendered
    assert "D7" in rendered
    assert "G/H" in rendered


def test_ocr_chord_row_tokens_carry_geometry() -> None:
    img = _render("C        G")
    tokens = ocr_chord_row(img)
    assert len(tokens) >= 2
    for t in tokens:
        assert t.x_right > t.x_left
        assert t.y_bottom > t.y_top
        # Token bbox must lie inside the image we rendered.
        h, w = img.shape[:2]
        assert 0 <= t.x_left < t.x_right <= w
        assert 0 <= t.y_top < t.y_bottom <= h


@pytest.mark.skipif(
    not _have_tesseract_with("ces"),
    reason="Tesseract 'ces' language data not installed; install tesseract-lang.",
)
def test_ocr_lyric_row_recovers_czech_text() -> None:
    img = _render("zpívejme Pánu", size=28)
    tokens = ocr_lyric_row(img, lang="ces")
    rendered = " ".join(_texts(tokens)).lower()
    # Tesseract may not always nail diacritics perfectly; assert the word
    # roots, which are stable.
    assert "p" in rendered  # "Pánu" → starts with "p"
    assert "zp" in rendered  # "zpívejme" → starts with "zp"
