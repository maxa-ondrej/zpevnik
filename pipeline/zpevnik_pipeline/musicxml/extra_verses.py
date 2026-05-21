"""Pull additional verses (2+) from a proscholy.cz `kytara` PDF.

Background: the `/soubor/{N}.xml` exports only carry the first
verse's syllables under the notes (one `<lyric number="1">` line
per pitched note). Additional verses are typeset as bare prose
TEXT directly in the engraved PDF — not in the XML at all. The
kytara (guitar) PDFs at `/soubor/ez/pdf/kytara/{N}.pdf` carry
that prose text in a single paragraph block at the bottom of
the layout (after the staff system).

We extract that block with pdfplumber and parse it.

Format observed in /soubor/ez/pdf/kytara/299.pdf:
    2. Chválu, dík provolejme Pánu / v radosti i nečase. / Na
    cestu novou otevřel ti bránu, / vejdi, už je načase. Ref.
    3. Chválu, dík všichni vzdejme Pánu, / on je cestou života, /
    pro všechny má místo ve svém plánu / jeho láska, dobrota.
    T: Miroslav Gallus, Svítá, 1992

Conventions:
  - Lines starting with `^\\d+\\.\\s` mark the start of a verse.
  - PDF text-wrap inside a verse means continuation lines have
    no number prefix — join with a space to undo the wrap.
  - ` / ` is the lyricist's explicit line break.
  - Trailing `Ref.` means "play the chorus here."
  - Lines starting with `T:` / `M:` / `A:` are credits — stop.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_VERSE_START_RE = re.compile(r"^\s*(\d+)\.\s+(.*)$")
_CREDIT_LINE_RE = re.compile(r"^\s*[TMA]:")
_REF_TAIL_RE = re.compile(r"\s*Ref\.\s*$", re.IGNORECASE)


@dataclass
class ExtraVerse:
    number: int           # 2, 3, … (verse 1 is already in the XML)
    lines: list[str]      # one per lyric line, in display order
    chorus_after: bool    # True if the kytara text ended this verse with 'Ref.'


def extract_extra_verses(pdf_path: Path | str) -> list[ExtraVerse]:
    """Return verses 2+ extracted from a kytara PDF, in order.

    Returns `[]` if the PDF has no additional-verse block (single-
    verse songs, or organ-only scores without prose at the bottom).
    """
    try:
        import pdfplumber
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "extract_extra_verses needs pdfplumber — install pipeline core deps"
        ) from e

    text_lines: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            text_lines.extend(text.splitlines())

    # Walk lines, looking for the verse-prose block. Verses are number-
    # prefixed lines that may wrap; collect continuation lines until the
    # next number-prefix or a credit line.
    verses: list[ExtraVerse] = []
    pending: list[str] | None = None       # accumulating one verse's lines
    pending_number: int | None = None
    for raw in text_lines:
        line = raw.strip()
        if not line:
            continue

        m = _VERSE_START_RE.match(line)
        if m:
            # Flush whatever we'd been collecting before this new verse start.
            if pending is not None and pending_number is not None:
                verses.append(_finalize(pending_number, pending))
            pending_number = int(m.group(1))
            # Skip verse 1 — already in the XML lyric stream.
            if pending_number < 2:
                pending = None
                pending_number = None
                continue
            pending = [m.group(2)]
            continue

        if _CREDIT_LINE_RE.match(line):
            # End of the verse block.
            if pending is not None and pending_number is not None:
                verses.append(_finalize(pending_number, pending))
            pending = None
            pending_number = None
            continue

        # Continuation of the current verse (PDF text wrap).
        if pending is not None:
            pending.append(line)

    # End-of-text flush.
    if pending is not None and pending_number is not None:
        verses.append(_finalize(pending_number, pending))

    return verses


def _finalize(number: int, raw_lines: list[str]) -> ExtraVerse:
    """Turn collected PDF lines into an ExtraVerse with display-ready text."""
    # Join wraps with spaces — the lyrics' own line-break is ` / `.
    joined = " ".join(s.strip() for s in raw_lines).strip()
    chorus_after = bool(_REF_TAIL_RE.search(joined))
    if chorus_after:
        joined = _REF_TAIL_RE.sub("", joined).strip()
    # Split on the lyricist's explicit slash (with surrounding whitespace
    # absorbed) → one display line per slash-delimited chunk.
    raw_chunks = [chunk.strip() for chunk in re.split(r"\s+/\s+|\s+/$", joined)]
    lines = [c for c in raw_chunks if c]
    return ExtraVerse(number=number, lines=lines, chorus_after=chorus_after)
