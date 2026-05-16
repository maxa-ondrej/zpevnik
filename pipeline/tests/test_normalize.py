"""Unit tests for stage-1 normalization. Synthetic images only — no Tesseract."""

from __future__ import annotations

from typing import cast

import cv2
import numpy as np
import pytest

from zpevnik_pipeline.extract.normalize import (
    ImageU8,
    deskew,
    estimate_skew,
    is_inverted,
    normalize,
)


def _invert(img: ImageU8) -> ImageU8:
    return cast(ImageU8, cv2.bitwise_not(img))


def _warp(img: ImageU8, matrix: np.ndarray, w: int, h: int) -> ImageU8:
    return cast(ImageU8, cv2.warpAffine(img, matrix, (w, h), borderValue=255))


def _make_text_page(rows: int = 1200, cols: int = 800) -> ImageU8:
    """Make a synthetic white page with a few black horizontal text lines."""
    img: ImageU8 = np.full((rows, cols), 255, dtype=np.uint8)
    for y in range(120, rows - 120, 60):
        cv2.rectangle(img, (80, y), (cols - 80, y + 4), 0, thickness=-1)
    return img


def test_is_inverted_detects_dark_page() -> None:
    img = _make_text_page()
    assert is_inverted(img) is False
    assert is_inverted(_invert(img)) is True


def test_estimate_skew_recovers_small_angle() -> None:
    img = _make_text_page()
    # Rotate the page by a known angle
    h, w = img.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), 3.0, 1.0)
    rotated = _warp(img, matrix, w, h)
    skew = estimate_skew(rotated)
    # We should detect the rotation within ±0.5°. Sign convention can vary —
    # only the magnitude is asserted.
    assert pytest.approx(abs(skew), abs=0.5) == 3.0


def test_deskew_no_op_when_straight() -> None:
    img = _make_text_page()
    _, applied = deskew(img)
    assert abs(applied) < 0.5


def test_normalize_inverts_white_on_black() -> None:
    img = _make_text_page()
    inverted = _invert(img)
    cleaned, stats = normalize(inverted)
    assert stats.inverted is True
    # After invert, the page should be mostly bright again.
    assert cleaned.mean() > 200


def test_normalize_idempotent_intensity() -> None:
    img = _make_text_page()
    once, _ = normalize(img)
    twice, _ = normalize(once)
    # Mean intensity should be stable across re-runs.
    assert abs(float(once.mean()) - float(twice.mean())) < 1.0
