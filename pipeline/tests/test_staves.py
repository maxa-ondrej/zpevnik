"""Unit tests for stage-10 staff PNG export."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from zpevnik_pipeline.output.staves import crop_song_line, export_song_staves
from zpevnik_pipeline.parse.layout import SongLine


def _page(rows: int = 600, cols: int = 800) -> np.ndarray:
    return np.full((rows, cols), 255, dtype=np.uint8)


def _line(chord: tuple[int, int], staff: tuple[int, int], lyric: tuple[int, int]) -> SongLine:
    return SongLine(
        staff_lines_y=list(range(staff[0], staff[1] + 1, 12)),
        staff_y=staff,
        chord_y=chord,
        lyric_y=lyric,
    )


def test_crop_song_line_returns_chord_through_lyric_band() -> None:
    img = _page(rows=600)
    line = _line(chord=(100, 150), staff=(150, 200), lyric=(200, 250))
    crop = crop_song_line(img, line)
    # Height = lyric_bottom - chord_top
    assert crop.shape[0] == 150
    # Width = page width (we crop in y only)
    assert crop.shape[1] == img.shape[1]


def test_crop_song_line_clips_to_page_bounds() -> None:
    img = _page(rows=200)
    # Lyric band intentionally exceeds page height — should clip.
    line = _line(chord=(50, 100), staff=(100, 150), lyric=(150, 9999))
    crop = crop_song_line(img, line)
    assert crop.shape[0] == 150  # 200 - 50


def test_export_song_staves_writes_pngs_in_page_then_y_order(tmp_path: Path) -> None:
    img_a = _page()
    img_b = _page()
    # Two staves on page A (different y), one on page B.
    line_a1 = _line(chord=(40, 70), staff=(70, 100), lyric=(100, 130))
    line_a2 = _line(chord=(200, 230), staff=(230, 260), lyric=(260, 290))
    line_b1 = _line(chord=(60, 90), staff=(90, 120), lyric=(120, 150))

    paths = export_song_staves(
        tmp_path / "staves",
        page_song_lines={1: (img_a, [line_a1, line_a2]), 2: (img_b, [line_b1])},
        page_order=[1, 2],
    )
    assert [p.name for p in paths] == ["01.png", "02.png", "03.png"]
    # PNGs are readable and match the crop heights.
    for path, want_h in zip(paths, [90, 90, 90]):
        loaded = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        assert loaded is not None, f"{path} unreadable"
        assert loaded.shape[0] == want_h


def test_export_song_staves_skips_pages_without_lines(tmp_path: Path) -> None:
    img = _page()
    line = _line(chord=(50, 70), staff=(70, 100), lyric=(100, 130))
    paths = export_song_staves(
        tmp_path / "staves",
        page_song_lines={1: (img, []), 2: (img, [line])},
        page_order=[1, 2],
    )
    # Only page 2 contributed a stave; numbering starts at 01.
    assert [p.name for p in paths] == ["01.png"]


def test_export_song_staves_creates_output_directory(tmp_path: Path) -> None:
    target = tmp_path / "deep" / "nested" / "staves"
    assert not target.exists()
    img = _page()
    line = _line(chord=(50, 70), staff=(70, 100), lyric=(100, 130))
    export_song_staves(target, page_song_lines={1: (img, [line])}, page_order=[1])
    assert target.is_dir()
    assert (target / "01.png").exists()
