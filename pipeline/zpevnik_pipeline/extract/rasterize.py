"""Stage 0 — PDF rasterization.

Wraps PyMuPDF (``fitz``) to convert a PDF into per-page records ready for
stages 1+. PyMuPDF is chosen over pdfplumber + pdf2image because it bundles
its own renderer — no system poppler / ImageMagick required, so the pipeline
runs cleanly in a fresh venv and in CI.

Each yielded :class:`RasterizedPage` carries:

* ``image`` — numpy BGR uint8 ndarray at the requested DPI (the format the
  rest of the pipeline expects);
* ``raw_bytes`` — PNG-encoded render of the same page. Stable across runs and
  fed into :func:`extract.hashing.hash_page` for the incremental cache;
* ``text_extractable`` — True when PyMuPDF finds non-whitespace text on the
  page. The classifier consumes this to decide between ``text`` and
  ``scanned`` for non-notation pages;
* ``text`` — the page's extracted text (or ``""``). Cheap to compute alongside
  rasterization and useful for the later segmentation stage.

The function is a generator so very large songbooks don't have to fit every
rasterized page in memory at once.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt

ImageU8 = npt.NDArray[np.uint8]


@dataclass(frozen=True)
class RasterizedPage:
    page: int
    image: ImageU8
    raw_bytes: bytes
    text_extractable: bool
    text: str


def rasterize_pdf(
    pdf_path: str | Path,
    *,
    dpi: int = 300,
    page_range: tuple[int, int] | None = None,
) -> Iterator[RasterizedPage]:
    """Yield :class:`RasterizedPage` records for the pages in ``pdf_path``.

    ``page_range`` is a 1-based inclusive ``(first, last)`` pair (matching the
    profile YAML's ``pageRange``). ``None`` means the whole document.
    """
    import fitz  # PyMuPDF; imported lazily so unit tests not touching PDFs don't pay for it.

    pdf_path = Path(pdf_path)
    zoom = dpi / 72.0  # PDF user-space units are 72/inch
    matrix = fitz.Matrix(zoom, zoom)

    with fitz.open(pdf_path) as doc:
        n = doc.page_count
        first = 1 if page_range is None else max(1, page_range[0])
        last = n if page_range is None else min(n, page_range[1])
        for page_no in range(first, last + 1):
            page = doc.load_page(page_no - 1)
            pix = page.get_pixmap(matrix=matrix, alpha=False, colorspace=fitz.csRGB)
            # Pixmap samples are RGB row-major uint8; reshape to (H, W, 3) then BGR.
            rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
            bgr: ImageU8 = rgb[:, :, ::-1].copy()
            raw_bytes = pix.tobytes("png")
            text = page.get_text("text") or ""
            yield RasterizedPage(
                page=page_no,
                image=bgr,
                raw_bytes=raw_bytes,
                text_extractable=bool(text.strip()),
                text=text,
            )
