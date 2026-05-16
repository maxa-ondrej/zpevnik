"""Stage 8 — verse and chorus section markers.

In a Czech songbook the body of a song looks like::

    1. Já mám jen jednu věc
       která mě hřeje
    2. Když ráno vstávám
       myslím na tebe
    R: Bože náš, Pane náš
       slyš naši píseň

Numeric prefixes ``N.`` mark verses; ``R:`` / ``Ref:`` / ``Ref.:`` mark
the refrain. Stage 8 walks the aligned ChordPro lines and rewrites those
prefixes into ChordPro directives::

    {start_of_verse: 1}
    Já mám jen jednu věc
    která mě hřeje
    {end_of_verse}
    {start_of_chorus}
    Bože náš, Pane náš
    slyš naši píseň
    {end_of_chorus}

The detector is intentionally robust to chord markers that landed before
the verse number during alignment (``[C]1. lyric``). The leading bracket
sequence is preserved on the following line so chords stay anchored to
the lyrics they apply to.
"""

from __future__ import annotations

import re
from typing import Literal

Section = Literal["verse", "chorus"]

# Group 1: any leading ``[chord]`` brackets (possibly none).
# Group 2 (verse only): the verse number.
# Final group: rest of the line.
_LEADING_CHORDS = r"(?P<chords>(?:\[[^\]]+\])*)"
_VERSE_RE = re.compile(
    rf"^{_LEADING_CHORDS}\s*(?P<num>\d+)\.\s*(?P<rest>.*)$"
)
_CHORUS_RE = re.compile(
    rf"^{_LEADING_CHORDS}\s*(?:R|Ref|Ref\.)\s*:\s*(?P<rest>.*)$",
    re.IGNORECASE,
)


def _emit_remainder(chords: str, rest: str) -> str | None:
    """Reconstruct the body line that should follow a section directive.

    Returns ``None`` when nothing meaningful remains (the marker was on its
    own line — no body to emit on this line).
    """
    body = (chords + rest).strip()
    return body if body else None


def apply_section_markers(lines: list[str]) -> list[str]:
    """Wrap verse/chorus runs with ChordPro section directives.

    ``lines`` is the body of a song — one ChordPro line per song-line. Any
    section that opens is automatically closed at the next section marker
    or at the end of the input.
    """
    out: list[str] = []
    current: Section | None = None

    def close() -> None:
        nonlocal current
        if current is not None:
            out.append(f"{{end_of_{current}}}")
            current = None

    for line in lines:
        m_chorus = _CHORUS_RE.match(line)
        if m_chorus:
            close()
            out.append("{start_of_chorus}")
            current = "chorus"
            remainder = _emit_remainder(m_chorus["chords"], m_chorus["rest"])
            if remainder is not None:
                out.append(remainder)
            continue

        m_verse = _VERSE_RE.match(line)
        if m_verse:
            close()
            out.append(f"{{start_of_verse: {int(m_verse['num'])}}}")
            current = "verse"
            remainder = _emit_remainder(m_verse["chords"], m_verse["rest"])
            if remainder is not None:
                out.append(remainder)
            continue

        out.append(line)

    close()
    return out
