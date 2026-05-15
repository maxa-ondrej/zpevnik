"""Stage 3 — song segmentation.

Group pages into songs using the profile's segmentation strategy. Input is a
list of ``(page_number, text)`` pairs (text comes from rasterize for pages
with an embedded text layer, or from OCR later on once that stage lands).

The output is a list of :class:`SongSegment` records — each describes a
contiguous run of pages that make up a single song. Downstream stages
(layout, OCR alignment) operate on a single segment at a time.

Strategies
----------

``one-per-page``
    Every page is its own song. Trivial. Useful for sources where each
    song already fits on a page.

``numbered-heading``
    The profile supplies a ``numberingRegex`` (default
    ``r"^(\\d{1,3})\\.\\s"``). The first line on a page that matches the
    regex starts a new song; the number captured by the regex becomes the
    song's number and the rest of the matched line is the title. Pages that
    follow without a match belong to the previous song. Pages preceding the
    first match are discarded as front matter.

``separator``
    Not yet implemented — raises :class:`NotImplementedError` until we have
    a real source PDF to design the marker against.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import ProfileSegmentation

DEFAULT_NUMBERING_REGEX = r"^(\d{1,3})\.\s+(.*)$"


@dataclass(frozen=True)
class SongSegment:
    number: int | None
    title: str | None
    pages: list[int]


def _find_first_heading(text: str, pattern: re.Pattern[str]) -> tuple[int, str] | None:
    """Return ``(number, title)`` for the first heading match, or ``None``."""
    for line in text.splitlines():
        m = pattern.match(line)
        if m:
            number = int(m.group(1))
            title = m.group(2).strip() if m.lastindex and m.lastindex >= 2 else ""
            return number, title
    return None


def _segment_numbered(
    pages: list[tuple[int, str]], regex: str
) -> list[SongSegment]:
    # Anchor on the start of any line (MULTILINE). Wrap the user-provided
    # pattern so we tolerate both `^(\d+)\.\s` (only the number) and the
    # extended capture used by DEFAULT_NUMBERING_REGEX (number + title).
    user_re = re.compile(regex, re.MULTILINE)

    segments: list[SongSegment] = []
    current: SongSegment | None = None

    for page_no, text in pages:
        heading = _find_first_heading(text, user_re)
        if heading is not None:
            number, title = heading
            # Close the previous song before opening a new one.
            if current is not None:
                segments.append(current)
            current = SongSegment(number=number, title=title or None, pages=[page_no])
        elif current is not None:
            current.pages.append(page_no)
        # else: page comes before any heading — discarded as front matter.

    if current is not None:
        segments.append(current)
    return segments


def _segment_one_per_page(pages: list[tuple[int, str]]) -> list[SongSegment]:
    return [SongSegment(number=None, title=None, pages=[p]) for p, _ in pages]


def segment(
    pages: list[tuple[int, str]],
    *,
    profile: ProfileSegmentation,
) -> list[SongSegment]:
    """Apply the profile's strategy to ``pages`` and return per-song page ranges."""
    if profile.strategy == "one-per-page":
        return _segment_one_per_page(pages)
    if profile.strategy == "numbered-heading":
        regex = profile.numberingRegex or DEFAULT_NUMBERING_REGEX
        return _segment_numbered(pages, regex)
    if profile.strategy == "separator":
        raise NotImplementedError(
            "segmentation strategy 'separator' is not implemented yet"
        )
    raise ValueError(f"unknown segmentation strategy: {profile.strategy}")
