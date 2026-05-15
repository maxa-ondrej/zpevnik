"""Stage 1 — page normalization.

Operates on a single page rendered to a numpy BGR image (the rasterization
step itself lives in `extract.rasterize` and depends on pdfplumber/pdf2image).
Splitting the image-level ops from rasterization keeps them fast to unit-test
on synthetic inputs.

Pipeline:

    raw_image
        → maybe_invert       (white-on-black scans)
        → deskew             (rotate to align text with horizontal)
        → denoise            (gentle bilateral filter)
        → ensure_grayscale   (the downstream OCR + staff detection works in
                              single-channel space)
        = clean_image

`normalize` is idempotent: running it twice on the same input yields the
same output to within the configured `idempotence_atol`.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import numpy.typing as npt

ImageU8 = npt.NDArray[np.uint8]


@dataclass(frozen=True)
class NormalizeStats:
    """Diagnostics emitted for each normalized page — used by the review UI."""

    inverted: bool
    skew_deg: float
    mean_intensity_before: float
    mean_intensity_after: float


# ---- invert detection -----------------------------------------------------


def is_inverted(image: ImageU8, threshold: float = 0.5) -> bool:
    """True when the page is dominated by dark pixels (white-on-black scan).

    We sample the mean intensity in [0, 1]. Below `threshold` means most of
    the page is dark — i.e. it's an inverted scan.
    """
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    return float(gray.mean()) / 255.0 < threshold


def invert(image: ImageU8) -> ImageU8:
    return cv2.bitwise_not(image)


# ---- deskew ---------------------------------------------------------------


def estimate_skew(image: ImageU8) -> float:
    """Estimate the page's skew angle in degrees.

    Uses Hough lines on a Canny edge map. Returns 0.0 if no strong text-line
    structure is detected.
    """
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 720, threshold=200)
    if lines is None:
        return 0.0
    angles: list[float] = []
    for rho_theta in lines[:200]:
        theta = float(rho_theta[0][1])
        deg = np.degrees(theta) - 90.0
        # Only keep near-horizontal lines (text baselines, staff lines).
        if -15.0 < deg < 15.0:
            angles.append(deg)
    if not angles:
        return 0.0
    return float(np.median(angles))


def deskew(image: ImageU8, angle_deg: float | None = None) -> tuple[ImageU8, float]:
    """Rotate `image` so detected text lines run horizontally.

    Returns the rotated image and the angle actually applied (degrees).
    A noop within `±0.05°` of zero — rotating sub-pixel amounts only adds blur.
    """
    angle = estimate_skew(image) if angle_deg is None else angle_deg
    if abs(angle) < 0.05:
        return image, 0.0
    h, w = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(
        image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, angle


# ---- denoise --------------------------------------------------------------


def denoise(image: ImageU8) -> ImageU8:
    """Light bilateral filter — preserves edges (staff lines, glyphs)."""
    return cv2.bilateralFilter(image, d=5, sigmaColor=35, sigmaSpace=35)


# ---- orchestrate ----------------------------------------------------------


def ensure_grayscale(image: ImageU8) -> ImageU8:
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image


def normalize(
    image: ImageU8,
    *,
    auto_invert: bool = True,
    do_deskew: bool = True,
    do_denoise: bool = True,
) -> tuple[ImageU8, NormalizeStats]:
    """Run the full per-page normalization. Returns (clean_image, stats)."""
    gray = ensure_grayscale(image)
    mean_before = float(gray.mean())

    inverted = False
    if auto_invert and is_inverted(gray):
        gray = invert(gray)
        inverted = True

    skew = 0.0
    if do_deskew:
        gray, skew = deskew(gray)

    if do_denoise:
        gray = denoise(gray)

    stats = NormalizeStats(
        inverted=inverted,
        skew_deg=skew,
        mean_intensity_before=mean_before,
        mean_intensity_after=float(gray.mean()),
    )
    return gray, stats
