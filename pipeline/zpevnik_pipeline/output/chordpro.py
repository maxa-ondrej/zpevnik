"""Stage 7 — ChordPro emission for a whole song segment.

Given a :class:`parse.segment.SongSegment` and the per-page aligned lines
that stage 6 produced, this module assembles the ``.cho`` text body. Chord
tokens are normalized to canonical English notation (Czech ``H``→``B``,
``B``→``Bb``) before being written so storage is unambiguous; the reader
app translates back at render time.

The emitter is intentionally minimal: title directive, optional key, and
one ``aligned`` line per detected song-line, in page-then-line-on-page
order. Section markers (verse/chorus) are layered on by stage 8.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..parse.align import AlignedLine
from ..parse.chord_notation import czech_to_english
from .sections import apply_section_markers

# Matches a ChordPro ``[Chord]`` marker. We only normalize the contents.
_CHORD_RE = re.compile(r"\[([^\]]+)\]")


def normalize_chordpro_line(line: str, *, language: str) -> str:
    """Translate every ``[chord]`` marker in ``line`` to English notation.

    Lyrics outside the brackets are untouched. For non-Czech sources this
    is a no-op.
    """
    if language != "cs":
        return line
    return _CHORD_RE.sub(lambda m: f"[{czech_to_english(m.group(1))}]", line)


@dataclass(frozen=True)
class EmittedSong:
    """Emission result. ``chordpro`` is the full ``.cho`` text; ``title`` and
    ``number`` are surfaced so the writer (stage 11) doesn't have to re-parse."""

    number: int | None
    title: str
    chordpro: str


def emit_song(
    *,
    number: int | None,
    title: str | None,
    aligned_lines: list[AlignedLine],
    language: str,
) -> EmittedSong:
    """Assemble a single song's ``.cho`` text."""
    effective_title = title or (f"Song {number}" if number is not None else "Untitled")
    head = [f"{{title: {effective_title}}}"]
    if number is not None:
        head.append(f"{{number: {number}}}")

    body = [
        normalize_chordpro_line(line.chordpro, language=language)
        for line in aligned_lines
        if line.chordpro
    ]
    body = apply_section_markers(body)

    chordpro = "\n".join(head + [""] + body) + "\n"
    return EmittedSong(number=number, title=effective_title, chordpro=chordpro)
