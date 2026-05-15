"""Stage 4 — per-page layout detection.

A "song line" in this songbook is a vertical sandwich:

    +----------------------------------+   ← chord row (Bold text)
    |                                  |
    +==================================+   ← staff (5 horizontal lines)
    +==================================+
    +==================================+
    +==================================+
    +==================================+
    |                                  |
    +----------------------------------+   ← lyric row (Roman text)

We detect the staves first (they're the only highly-structured feature on
the page), then carve fixed-height bands above and below for chord/lyric.
The band heights come from the profile, or — if absent — are derived from
the staff height itself so the detector works without per-songbook tuning.

The bands intentionally do NOT include the staff itself: the OCR stages
need clean chord/lyric crops free of staff-line pixels.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import numpy.typing as npt

from ..models import ProfileLayout

ImageU8 = npt.NDArray[np.uint8]


@dataclass(frozen=True)
class SongLine:
    """A single (chord row → staff → lyric row) triple on a page."""

    staff_lines_y: list[int]  # y of each detected staff line (5 in the ideal case)
    staff_y: tuple[int, int]  # (top, bottom) y of the staff itself
    chord_y: tuple[int, int]  # (top, bottom) y of the chord row above the staff
    lyric_y: tuple[int, int]  # (top, bottom) y of the lyric row below the staff


def _horizontal_line_ys(
    image: ImageU8, *, min_line_length_ratio: float = 0.5
) -> list[int]:
    """Detect near-horizontal long lines and return their y-coordinates."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    h, w = binary.shape
    min_len = int(w * min_line_length_ratio)
    lines = cv2.HoughLinesP(
        binary,
        rho=1,
        theta=np.pi / 360,
        threshold=120,
        minLineLength=min_len,
        maxLineGap=8,
    )
    if lines is None:
        return []
    ys: list[int] = []
    # Allow up to ~0.5° of residual skew (the threshold normalize.deskew uses
    # before bothering to rotate). Across a 2500-px-wide page that's ~22px of
    # vertical drift end-to-end, so accept |Δy| ≤ 25 here.
    max_dy = 25
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if abs(y2 - y1) <= max_dy and abs(x2 - x1) >= min_len:
            ys.append(int((y1 + y2) // 2))
    return sorted(ys)


def _merge_near_duplicates(ys: list[int], tol: int = 3) -> list[int]:
    """HoughLinesP often returns multiple lines per real staff line. Merge them."""
    if not ys:
        return []
    merged: list[int] = [ys[0]]
    for y in ys[1:]:
        if y - merged[-1] <= tol:
            merged[-1] = (merged[-1] + y) // 2
        else:
            merged.append(y)
    return merged


def _group_into_staves(
    ys: list[int],
    *,
    min_lines_per_staff: int = 4,
    max_lines_per_staff: int = 6,
    spacing_tolerance: float = 0.5,
) -> list[list[int]]:
    """Cluster `ys` into staves — groups of evenly-spaced consecutive lines.

    A staff is normally 5 lines with very regular spacing. We walk the sorted
    y-list and split into runs where adjacent gaps are within
    ``spacing_tolerance`` of the running median gap for that run. Once a run
    exceeds ``max_lines_per_staff`` or the next gap is way larger, we close
    the run. Runs shorter than ``min_lines_per_staff`` are dropped — they're
    probably page-frame rules, underlines, or ledger lines.
    """
    if len(ys) < min_lines_per_staff:
        return []

    runs: list[list[int]] = []
    current: list[int] = [ys[0]]
    gaps: list[int] = []

    for y in ys[1:]:
        prev = current[-1]
        gap = y - prev
        # Same staff if the gap looks like the running median, AND the run
        # hasn't already saturated at the max staff size.
        if gaps:
            median_gap = int(np.median(gaps))
            within_tol = abs(gap - median_gap) <= max(2, int(median_gap * spacing_tolerance))
        else:
            # Plausible single-staff line spacing in pixels — covers everything
            # from ~100 DPI (8 px) up to ~600 DPI dense staves (100 px).
            within_tol = 4 <= gap <= 100
        if within_tol and len(current) < max_lines_per_staff:
            current.append(y)
            gaps.append(gap)
        else:
            if len(current) >= min_lines_per_staff:
                runs.append(current)
            current = [y]
            gaps = []

    if len(current) >= min_lines_per_staff:
        runs.append(current)
    return runs


def _band(
    center_lo: int, center_hi: int, *, page_h: int, height: int, above: bool
) -> tuple[int, int]:
    if above:
        top = max(0, center_lo - height)
        bottom = center_lo
    else:
        top = center_hi
        bottom = min(page_h, center_hi + height)
    return top, bottom


def detect_song_lines(
    image: ImageU8,
    layout: ProfileLayout | None = None,
) -> list[SongLine]:
    """Return the (chord, staff, lyric) sandwiches found on a normalized page.

    ``image`` is a normalized grayscale or BGR page (post stage-1). If the
    profile supplies explicit band heights, they're used verbatim; otherwise
    each band is sized to the staff itself (a typical zpěvník looks like
    ``chord_h ≈ lyric_h ≈ staff_h``).
    """
    page_h = image.shape[0]
    ys = _merge_near_duplicates(_horizontal_line_ys(image))
    staves = _group_into_staves(ys)
    if not staves:
        return []

    out: list[SongLine] = []
    for staff_lines in staves:
        top, bottom = staff_lines[0], staff_lines[-1]
        staff_h = max(1, bottom - top)
        chord_h = (
            layout.chordRowHeightPx
            if layout and layout.chordRowHeightPx
            else staff_h
        )
        lyric_h = (
            layout.lyricRowHeightPx
            if layout and layout.lyricRowHeightPx
            else staff_h
        )
        chord_y = _band(top, bottom, page_h=page_h, height=chord_h, above=True)
        lyric_y = _band(top, bottom, page_h=page_h, height=lyric_h, above=False)
        out.append(
            SongLine(
                staff_lines_y=staff_lines,
                staff_y=(top, bottom),
                chord_y=chord_y,
                lyric_y=lyric_y,
            )
        )
    return out
