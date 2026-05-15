"""Unit tests for stage-3 song segmentation."""

from __future__ import annotations

import pytest

from zpevnik_pipeline.models import ProfileSegmentation
from zpevnik_pipeline.parse.segment import DEFAULT_NUMBERING_REGEX, segment


def _seg(strategy: str, regex: str | None = None) -> ProfileSegmentation:
    return ProfileSegmentation(strategy=strategy, numberingRegex=regex)  # type: ignore[arg-type]


def test_one_per_page_creates_one_segment_per_page() -> None:
    pages = [(1, "anything"), (2, "anything"), (3, "anything")]
    out = segment(pages, profile=_seg("one-per-page"))
    assert [s.pages for s in out] == [[1], [2], [3]]
    assert all(s.number is None and s.title is None for s in out)


def test_numbered_heading_groups_consecutive_pages_per_song() -> None:
    pages = [
        (1, "1. First Song\nlyrics line\nmore lyrics"),
        (2, "more lyrics for song 1"),
        (3, "2. Second Song\nlyrics"),
        (4, "even more song 2"),
        (5, "3. Third Song"),
    ]
    out = segment(pages, profile=_seg("numbered-heading", DEFAULT_NUMBERING_REGEX))
    assert [(s.number, s.title, s.pages) for s in out] == [
        (1, "First Song", [1, 2]),
        (2, "Second Song", [3, 4]),
        (3, "Third Song", [5]),
    ]


def test_numbered_heading_discards_frontmatter() -> None:
    pages = [
        (1, "Table of Contents\n..."),
        (2, "More frontmatter"),
        (3, "1. Real Song\nlyrics"),
    ]
    out = segment(pages, profile=_seg("numbered-heading", DEFAULT_NUMBERING_REGEX))
    assert [s.pages for s in out] == [[3]]
    assert out[0].number == 1


def test_numbered_heading_uses_default_regex_when_profile_value_is_none() -> None:
    pages = [(1, "5. Hello\nbody")]
    out = segment(pages, profile=_seg("numbered-heading", None))
    assert out[0].number == 5
    assert out[0].title == "Hello"


def test_numbered_heading_works_with_number_only_regex() -> None:
    # A regex that captures only the number (no title group) must still segment.
    pages = [
        (1, "12. Hymn About Stars\nstars and skies"),
        (2, "13. Another"),
    ]
    out = segment(pages, profile=_seg("numbered-heading", r"^(\d{1,3})\.\s"))
    assert [s.number for s in out] == [12, 13]
    # Title is empty when the regex has no group 2.
    assert all(s.title is None for s in out)


def test_numbered_heading_each_match_starts_a_new_song_even_on_same_run() -> None:
    pages = [
        (1, "1. A\nlyrics"),
        (2, "lyrics continues"),
        (3, "2. B\nlyrics"),
    ]
    out = segment(pages, profile=_seg("numbered-heading", DEFAULT_NUMBERING_REGEX))
    assert [s.pages for s in out] == [[1, 2], [3]]


def test_separator_strategy_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        segment([(1, "x")], profile=_seg("separator"))
