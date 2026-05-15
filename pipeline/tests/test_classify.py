"""Unit tests for stage-2 page classification."""

from __future__ import annotations

import cv2
import numpy as np

from zpevnik_pipeline.extract.classify import (
    classify_page,
    detect_staff_lines,
    notation_density,
)


def _staff_page(num_systems: int = 6, lines_per_staff: int = 5) -> np.ndarray:
    """Synthetic page with N music systems of horizontal staff lines."""
    img = np.full((1200, 800, 3), 255, dtype=np.uint8)
    margin = 80
    y = 120
    for _ in range(num_systems):
        for i in range(lines_per_staff):
            cv2.line(img, (margin, y + i * 8), (800 - margin, y + i * 8), (0, 0, 0), 1)
        y += 160
    return img


def _blank_page() -> np.ndarray:
    return np.full((1200, 800, 3), 255, dtype=np.uint8)


def test_detect_staff_lines_counts_systems() -> None:
    img = _staff_page(num_systems=4, lines_per_staff=5)
    n = detect_staff_lines(img)
    # Hough is not exact — expect at least most of the 20 lines detected.
    assert n >= 15


def test_detect_staff_lines_blank_page_is_zero() -> None:
    assert detect_staff_lines(_blank_page()) == 0


def test_notation_density_saturates() -> None:
    assert notation_density(0) == 0.0
    assert notation_density(40) == 1.0
    assert notation_density(80) == 1.0


def test_classify_notation_heavy_overrides_text_layer() -> None:
    img = _staff_page(num_systems=6)
    pc = classify_page(12, img, text_extractable=True)
    assert pc.kind == "notation_heavy"
    assert pc.notationDensity > 0


def test_classify_text_when_no_staves_and_text_layer() -> None:
    pc = classify_page(1, _blank_page(), text_extractable=True)
    assert pc.kind == "text"


def test_classify_scanned_when_no_staves_and_no_text_layer() -> None:
    pc = classify_page(2, _blank_page(), text_extractable=False)
    assert pc.kind == "scanned"
