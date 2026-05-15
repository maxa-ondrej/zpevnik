"""Unit tests for stage-4 layout detection."""

from __future__ import annotations

from pathlib import Path

import cv2
import fitz
import numpy as np

from zpevnik_pipeline.extract.normalize import normalize
from zpevnik_pipeline.extract.rasterize import rasterize_pdf
from zpevnik_pipeline.models import ProfileLayout
from zpevnik_pipeline.parse.layout import detect_song_lines


def _draw_staff(img: np.ndarray, top_y: int, line_gap: int = 12) -> list[int]:
    """Draw a 5-line staff starting at ``top_y`` and return the line ys."""
    h, w = img.shape[:2]
    ys = [top_y + i * line_gap for i in range(5)]
    for y in ys:
        cv2.line(img, (60, y), (w - 60, y), color=0, thickness=2)
    return ys


def _blank_page(rows: int = 1400, cols: int = 900) -> np.ndarray:
    return np.full((rows, cols), 255, dtype=np.uint8)


def test_detects_no_staves_on_blank_page() -> None:
    assert detect_song_lines(_blank_page()) == []


def test_detects_single_staff() -> None:
    page = _blank_page()
    drawn = _draw_staff(page, top_y=400)
    [line] = detect_song_lines(page)
    # All 5 staff lines should be recovered (allow ±2 px since detection rounds).
    assert len(line.staff_lines_y) == 5
    for got, want in zip(line.staff_lines_y, drawn, strict=True):
        assert abs(got - want) <= 2
    # Staff bounds wrap the staff lines.
    assert line.staff_y == (line.staff_lines_y[0], line.staff_lines_y[-1])


def test_detects_multiple_staves_in_order() -> None:
    page = _blank_page()
    drawn = [
        _draw_staff(page, top_y=200),
        _draw_staff(page, top_y=600),
        _draw_staff(page, top_y=1000),
    ]
    lines = detect_song_lines(page)
    assert len(lines) == 3
    for line, want_lines in zip(lines, drawn, strict=True):
        assert abs(line.staff_y[0] - want_lines[0]) <= 2
        assert abs(line.staff_y[1] - want_lines[-1]) <= 2
    # Staves are returned sorted top-to-bottom.
    tops = [line.staff_y[0] for line in lines]
    assert tops == sorted(tops)


def test_band_heights_default_to_staff_height() -> None:
    page = _blank_page()
    _draw_staff(page, top_y=500, line_gap=12)
    [line] = detect_song_lines(page)
    staff_h = line.staff_y[1] - line.staff_y[0]
    assert (line.chord_y[1] - line.chord_y[0]) == staff_h
    assert (line.lyric_y[1] - line.lyric_y[0]) == staff_h


def test_band_heights_honor_profile_layout() -> None:
    page = _blank_page()
    _draw_staff(page, top_y=500)
    layout = ProfileLayout(chordRowHeightPx=70, lyricRowHeightPx=40)
    [line] = detect_song_lines(page, layout=layout)
    assert (line.chord_y[1] - line.chord_y[0]) == 70
    assert (line.lyric_y[1] - line.lyric_y[0]) == 40


def test_chord_band_sits_directly_above_staff_lyric_directly_below() -> None:
    page = _blank_page()
    _draw_staff(page, top_y=500)
    [line] = detect_song_lines(page)
    # Chord band's bottom touches the top staff line. Lyric band's top
    # touches the bottom staff line. No overlap with the staff itself.
    assert line.chord_y[1] == line.staff_y[0]
    assert line.lyric_y[0] == line.staff_y[1]


def test_bands_clip_to_page_edges() -> None:
    # Staff drawn very close to the top — chord band would otherwise go negative.
    page = _blank_page(rows=400)
    _draw_staff(page, top_y=20)
    layout = ProfileLayout(chordRowHeightPx=200, lyricRowHeightPx=200)
    [line] = detect_song_lines(page, layout=layout)
    assert line.chord_y[0] == 0
    assert line.lyric_y[1] <= 400


def test_short_runs_are_dropped_as_noise() -> None:
    page = _blank_page()
    # A real staff + two stray horizontal rules near the bottom that mimic
    # ledger lines / page-frame rules. They form a run too short to be a staff.
    _draw_staff(page, top_y=300)
    cv2.line(page, (60, 1100), (840, 1100), 0, 2)
    cv2.line(page, (60, 1116), (840, 1116), 0, 2)
    lines = detect_song_lines(page)
    # Only the real staff (5 lines) is kept; the 2-line "frame" is dropped.
    assert len(lines) == 1
    assert len(lines[0].staff_lines_y) == 5


def test_layout_recovers_staves_on_a_rasterized_pdf(tmp_path: Path) -> None:
    """End-to-end: real PDF → rasterize → normalize → detect. Guards against
    DPI-dependent regressions in the staff-line spacing heuristic."""
    pdf = tmp_path / "song.pdf"
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    # Two staves at sheet-music spacing (~12pt between lines).
    for staff_idx in range(2):
        base = 200 + staff_idx * 200
        for i in range(5):
            y = base + i * 12
            page.draw_line((60, y), (535, y), color=(0, 0, 0), width=1.2)
    doc.save(pdf)
    doc.close()

    [rpage] = list(rasterize_pdf(pdf, dpi=300))
    clean, _ = normalize(rpage.image)
    lines = detect_song_lines(clean)
    assert len(lines) == 2
    for line in lines:
        # Each staff has 5 evenly spaced lines.
        assert len(line.staff_lines_y) == 5
