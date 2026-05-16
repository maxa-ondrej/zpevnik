"""Stage 10 — staff PNG export.

For each detected song-line we save a PNG that includes the chord row
above, the staff itself, and the lyric row below — i.e. exactly what a
musician would want to see when the OCR'd ChordPro is too thin a
representation of the original notation.

The crop preserves the page's native pixel resolution (no resampling) so
the saved PNG matches the printed bar-width exactly. Files are numbered
``01.png``, ``02.png`` … in page-major / left-to-right order across all
pages of the song, so an alphabetical sort gives the natural reading order.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import numpy.typing as npt

from ..parse.layout import SongLine

ImageU8 = npt.NDArray[np.uint8]


def crop_song_line(image: ImageU8, line: SongLine) -> ImageU8:
    """Crop the (chord-row + staff + lyric-row) band as a single image.

    Coordinates come from :class:`parse.layout.SongLine`; the chord band
    sits above the staff and the lyric band sits below, with no overlap on
    the staff itself.
    """
    top = max(0, line.chord_y[0])
    bottom = min(image.shape[0], line.lyric_y[1])
    return image[top:bottom, :].copy()


def write_stave_pngs(out_dir: Path, crops: list[ImageU8]) -> list[Path]:
    """Write each crop to ``out_dir`` as ``NN.png``. Returns paths written.

    The caller is responsible for ordering ``crops`` — page-major, then
    top-to-bottom on each page — so the natural sort of the filenames
    matches the reading order.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for i, crop in enumerate(crops, start=1):
        path = out_dir / f"{i:02d}.png"
        ok = cv2.imwrite(str(path), crop)
        if not ok:
            raise OSError(f"cv2.imwrite failed for {path}")
        written.append(path)
    return written


def export_song_staves(
    out_dir: Path,
    *,
    page_song_lines: dict[int, tuple[ImageU8, list[SongLine]]],
    page_order: list[int],
) -> list[Path]:
    """Crop chord-through-lyric bands on each page and write them as PNGs.

    Convenience wrapper around :func:`crop_song_line` + :func:`write_stave_pngs`
    for tests / direct callers that already have full normalized pages in
    memory. The pipeline CLI uses pre-computed crops via
    :func:`write_stave_pngs` directly to avoid holding full pages.
    """
    crops: list[ImageU8] = []
    for page_no in page_order:
        record = page_song_lines.get(page_no)
        if record is None:
            continue
        image, lines = record
        for line in lines:
            crops.append(crop_song_line(image, line))
    return write_stave_pngs(out_dir, crops)
