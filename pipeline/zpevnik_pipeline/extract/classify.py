"""Stage 2 — per-page classification.

We separate two questions:

  * **textExtractable** — does the PDF have a real text layer for this page?
    (pdfplumber returns non-empty character data.) If yes, we skip OCR for
    that row and use the embedded glyphs directly.

  * **notationDensity** — how much of the page is occupied by horizontal
    staff lines? Detected via HoughLinesP on a binarized copy of the page.
    Used downstream to decide where to slice off "song lines" (chord row +
    staff + lyric row).

The combination yields a coarse classification (`text` / `scanned` /
`notation_heavy`) which the next stage consumes to pick the right OCR /
layout strategy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np
import numpy.typing as npt

ImageU8 = npt.NDArray[np.uint8]

PageKind = Literal["text", "scanned", "notation_heavy"]


@dataclass(frozen=True)
class PageClassification:
    page: int
    kind: PageKind
    textExtractable: bool
    notationDensity: float  # 0..1; share of page rows containing staff lines
    detectedStaffLines: int


def detect_staff_lines(image: ImageU8, min_line_length_ratio: float = 0.5) -> int:
    """Count near-horizontal long lines — a proxy for staff lines.

    `min_line_length_ratio` is the fraction of page width a line must span to
    count. Staves are long; chord/lyric strokes are short.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    # Invert so lines are bright on dark — HoughLinesP wants edges.
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
        return 0
    count = 0
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if abs(y2 - y1) <= 2 and abs(x2 - x1) >= min_len:
            count += 1
    return count


def notation_density(staff_lines: int) -> float:
    """Map raw staff-line count to a 0..1 density.

    A typical page in this songbook fits roughly 6 musical systems × 5 staff
    lines = ~30 long horizontal lines. Saturate at 40.
    """
    return min(1.0, staff_lines / 40.0)


def classify_page(
    page_number: int,
    image: ImageU8,
    *,
    text_extractable: bool,
    notation_threshold: float = 0.3,
) -> PageClassification:
    """Combine text-layer + staff-line signals into a coarse page kind."""
    n_staves = detect_staff_lines(image)
    density = notation_density(n_staves)

    kind: PageKind
    if density >= notation_threshold:
        kind = "notation_heavy"
    elif text_extractable:
        kind = "text"
    else:
        kind = "scanned"

    return PageClassification(
        page=page_number,
        kind=kind,
        textExtractable=text_extractable,
        notationDensity=density,
        detectedStaffLines=n_staves,
    )
