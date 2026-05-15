"""Unit tests for stage-0 PDF rasterization.

Synthetic PDFs are generated on the fly using PyMuPDF itself, so the tests
have zero external assets.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from zpevnik_pipeline.extract.hashing import hash_page
from zpevnik_pipeline.extract.rasterize import rasterize_pdf


def _make_pdf(path: Path, pages: list[str | None]) -> None:
    """Write a minimal PDF. Each entry: text to draw, or None for blank."""
    doc = fitz.open()
    for body in pages:
        page = doc.new_page(width=595, height=842)  # A4 in PDF units
        if body is not None:
            page.insert_text((72, 100), body, fontsize=18)
    doc.save(path)
    doc.close()


def test_rasterize_yields_one_record_per_page(tmp_path: Path) -> None:
    pdf = tmp_path / "two.pdf"
    _make_pdf(pdf, ["First page", "Second page"])
    pages = list(rasterize_pdf(pdf, dpi=150))
    assert [p.page for p in pages] == [1, 2]


def test_rasterize_image_is_bgr_at_expected_size(tmp_path: Path) -> None:
    pdf = tmp_path / "one.pdf"
    _make_pdf(pdf, ["Hello"])
    [r] = list(rasterize_pdf(pdf, dpi=150))
    h, w, c = r.image.shape
    # 150 dpi × A4 (8.27 × 11.69 in) → roughly 1240 × 1754; allow ±2px slack.
    assert c == 3
    assert abs(h - 1754) <= 3
    assert abs(w - 1240) <= 3
    assert r.image.dtype.name == "uint8"


def test_rasterize_detects_text_extractable(tmp_path: Path) -> None:
    pdf = tmp_path / "mixed.pdf"
    _make_pdf(pdf, ["Has text", None])
    [a, b] = list(rasterize_pdf(pdf, dpi=100))
    assert a.text_extractable is True
    assert "Has text" in a.text
    assert b.text_extractable is False
    assert b.text.strip() == ""


def test_rasterize_raw_bytes_are_stable_and_hashable(tmp_path: Path) -> None:
    pdf = tmp_path / "stable.pdf"
    _make_pdf(pdf, ["Stable"])
    [a] = list(rasterize_pdf(pdf, dpi=100))
    [b] = list(rasterize_pdf(pdf, dpi=100))
    # Same PDF + same DPI → identical raw bytes → identical hash.
    assert hash_page(a.raw_bytes) == hash_page(b.raw_bytes)


def test_rasterize_respects_page_range(tmp_path: Path) -> None:
    pdf = tmp_path / "four.pdf"
    _make_pdf(pdf, ["1", "2", "3", "4"])
    pages = list(rasterize_pdf(pdf, dpi=100, page_range=(2, 3)))
    assert [p.page for p in pages] == [2, 3]


def test_rasterize_clamps_page_range_to_document(tmp_path: Path) -> None:
    pdf = tmp_path / "two.pdf"
    _make_pdf(pdf, ["1", "2"])
    # Out-of-range upper bound is clamped, not an error.
    pages = list(rasterize_pdf(pdf, dpi=100, page_range=(1, 99)))
    assert [p.page for p in pages] == [1, 2]


def test_rasterize_missing_pdf_raises(tmp_path: Path) -> None:
    with pytest.raises(Exception):
        list(rasterize_pdf(tmp_path / "nope.pdf"))
