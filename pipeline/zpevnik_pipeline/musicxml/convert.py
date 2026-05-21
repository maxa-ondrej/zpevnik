"""IR → ChordPro + melody.json + meta.json.

The emitter walks the IR section by section (boundaries set by the
parser from <direction> markers + light-heavy/light-light barlines).
Each section becomes one ChordPro `{start_of_X}` block AND one
melody.json block — they line up by index.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .extra_verses import ExtraVerse
from .parser import Measure, Note, Song, parse_musicxml

__all__ = [
    "ConvertResult",
    "convert_musicxml",
    "convert_song",
    "first_phrase_title",
]


@dataclass
class ConvertResult:
    """Triple the app expects, ready to write to a song directory."""

    meta: dict[str, Any]
    song_cho: str
    melody: dict[str, Any]


def convert_musicxml(
    xml_path: Path | str,
    *,
    title: str | None = None,
    extra_verses: list[ExtraVerse] | None = None,
) -> ConvertResult:
    """Read a MusicXML file and produce {meta, song.cho, melody.json}.

    `title` overrides whatever the XML declared (often nothing —
    proscholy.cz exports lack <work-title>).

    `extra_verses` lets the caller append verses 2/3+ (typically
    extracted from the kytara PDF by `extract_extra_verses`) onto
    the ChordPro output. melody.json is unaffected — the additional
    verses ride the verse-1 melody at display time.
    """
    song = parse_musicxml(xml_path)
    if title:
        song.title = title
    return convert_song(song, extra_verses=extra_verses)


def convert_song(
    song: Song,
    *,
    extra_verses: list[ExtraVerse] | None = None,
) -> ConvertResult:
    sections = _split_into_sections(song.measures)
    section_types = _label_sections(sections)
    return ConvertResult(
        meta=_build_meta(song),
        song_cho=_build_chordpro(song, sections, section_types, extra_verses or []),
        melody=_build_melody(song, sections, section_types),
    )


# ── sectioning ────────────────────────────────────────────────────────────

def _split_into_sections(measures: list[Measure]) -> list[list[Measure]]:
    """Group consecutive measures into sections by `starts_section`."""
    sections: list[list[Measure]] = []
    current: list[Measure] = []
    for m in measures:
        if m.starts_section and current:
            sections.append(current)
            current = []
        current.append(m)
    if current:
        sections.append(current)
    return sections


def _label_sections(sections: list[list[Measure]]) -> list[str]:
    """Assign 'verse' / 'chorus' / 'bridge' to each section.

    Heuristic:
      - Any section whose first measure carries a 'chorus' hint → chorus.
      - First non-chorus section → 'verse'; if multiple verses precede
        the chorus we name them all 'verse'.
      - Bridges are not auto-detected in v1.
    """
    labels: list[str] = []
    for sec in sections:
        hint = sec[0].section_type_hint if sec else None
        labels.append(hint or "verse")
    return labels


# ── ChordPro ──────────────────────────────────────────────────────────────

def _build_chordpro(
    song: Song,
    sections: list[list[Measure]],
    types: list[str],
    extra_verses: list[ExtraVerse],
) -> str:
    lines: list[str] = []
    if song.title:
        lines.append(f"{{title: {song.title}}}")
    lines.append(f"{{key: {song.key}}}")
    lines.append("")

    # Track the most recent chorus's lyric lines so that `chorus_after`
    # on an extra verse can inline a full copy. (Our ChordPro parser
    # doesn't expand the `{chorus}` shorthand, so we expand it here.)
    last_chorus_lyrics: str | None = None

    verse_n = 0
    for sec, typ in zip(sections, types, strict=True):
        if typ == "verse":
            verse_n += 1
            lines.append(f"{{start_of_verse: {verse_n}}}")
        elif typ == "chorus":
            lines.append("{start_of_chorus}")
        elif typ == "bridge":
            lines.append("{start_of_bridge}")
        else:
            lines.append("{start_of_verse}")

        body = _section_to_chordpro_lines(sec)
        lines.append(body)
        if typ == "chorus":
            last_chorus_lyrics = body

        if typ == "chorus":
            lines.append("{end_of_chorus}")
        elif typ == "bridge":
            lines.append("{end_of_bridge}")
        else:
            lines.append("{end_of_verse}")
        lines.append("")

    # Append verses 2/3+ pulled from the kytara PDF. They render as
    # prose without chord markers — the PDF only carries lyric text.
    # `chorus_after` flags a "Ref." marker in the kytara text; expand
    # it into a literal copy of the chorus block so the renderer
    # doesn't need to support the `{chorus}` shorthand.
    for ev in extra_verses:
        lines.append(f"{{start_of_verse: {ev.number}}}")
        lines.extend(ev.lines)
        lines.append("{end_of_verse}")
        lines.append("")
        if ev.chorus_after and last_chorus_lyrics:
            lines.append("{start_of_chorus}")
            lines.append(last_chorus_lyrics)
            lines.append("{end_of_chorus}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _section_to_chordpro_lines(measures: list[Measure]) -> str:
    """Emit lyric lines for a section, breaking on `<print new-system>`.

    `starts_new_system` is the engraver's own line-break marker — it
    matches what a human typesetter would consider a phrase. Falls back
    to "no breaks" when a section has no new-system markers (rare).
    """
    out_lines: list[str] = []
    buf: list[str] = []
    # Whether the previous emitted token was a syllable that didn't end
    # its word (begin/middle) — controls whether a chord lands mid-word.
    word_in_progress = False

    def flush_line() -> None:
        if buf:
            line = "".join(buf).rstrip()
            if line:
                out_lines.append(line)
            buf.clear()

    for i, m in enumerate(measures):
        # Section's first measure is implicitly a new system — don't
        # cut twice (the buf is empty anyway).
        if m.starts_new_system and i > 0:
            flush_line()
            word_in_progress = False

        for note in m.notes:
            chord = note.chord_above
            lyric = note.lyric
            syl = note.syllabic

            if chord:
                if buf and not word_in_progress and not buf[-1].endswith(" "):
                    buf.append(" ")
                buf.append(f"[{chord}]")

            if lyric is None:
                continue

            buf.append(lyric)
            ends_word = syl in (None, "single", "end")
            word_in_progress = not ends_word
            if ends_word:
                buf.append(" ")

    flush_line()
    return "\n".join(out_lines)


# ── melody.json (ABC) ─────────────────────────────────────────────────────

def _build_melody(
    song: Song,
    sections: list[list[Measure]],
    types: list[str],
) -> dict[str, Any]:
    header_parts = ["X:1"]
    if song.title:
        header_parts.append(f"T:{song.title}")
    header_parts.append(f"M:{song.time_num}/{song.time_den}")
    header_parts.append("L:1/4")
    if song.tempo:
        header_parts.append(f"Q:1/4={song.tempo}")
    header_parts.append(f"K:{song.key}")
    header = "\n".join(header_parts)

    blocks: list[dict[str, str]] = []
    verse_n = 0
    chorus_n = 0
    for sec, typ in zip(sections, types, strict=True):
        if typ == "verse":
            verse_n += 1
            multi_verse = verse_n > 1 or any(t == "verse" for t in types[1:])
            label = f"Verse {verse_n}" if multi_verse else "Verse"
        elif typ == "chorus":
            chorus_n += 1
            label = "Chorus" if chorus_n == 1 else f"Chorus {chorus_n}"
        elif typ == "bridge":
            label = "Bridge"
        else:
            label = typ.capitalize()

        body = _section_to_abc(sec, song.divisions, label)
        blocks.append({"type": typ, "body": body})

    return {"header": header, "blocks": blocks}


def _section_to_abc(measures: list[Measure], divisions: int, label: str) -> str:
    """Emit an ABC body for one section.

    Layout: group consecutive measures into one music line per
    **engraved system** (boundaries from `<print new-system="yes"/>`),
    followed IMMEDIATELY by that line's `w:` syllable line when any
    measure in the group carries lyrics. Annotation `"^Label"` sits at
    the top.

    Two correctness anchors:
      - Per-line `w:` — abcjs aligns a w: directive only with the music
        line directly above; a single end-of-section w: leaves all but
        the last line without lyrics in the rendered staff.
      - Per-SYSTEM grouping — every `\\n` in an ABC body forces a
        staff-line break in abcjs. Emitting one music line per measure
        produces the ugly "one note, one staff" layout the user
        screenshotted on song 008 (single-note pickup measure rendered
        as a full-width empty staff). The engraver's new-system marker
        is the canonical "break here" signal.
    """
    # Group measures by system: each `starts_new_system=True` measure
    # opens a fresh group (the first measure is implicitly a group
    # start, so we don't need to special-case it).
    systems: list[list[Measure]] = []
    current: list[Measure] = []
    for m in measures:
        if m.starts_new_system and current:
            systems.append(current)
            current = []
        current.append(m)
    if current:
        systems.append(current)

    parts = [f'"^{label}"']
    for system in systems:
        tokens: list[str] = []
        syllables: list[str] = []
        any_lyric_in_line = False
        for m in system:
            for note in m.notes:
                if note.chord_above:
                    tokens.append(f'"{note.chord_above}"')
                tokens.append(_note_to_abc(note, divisions))
                if note.lyric:
                    syllables.append(_syllable_for_w_line(note.lyric, note.syllabic))
                    any_lyric_in_line = True
                elif not note.rest:
                    syllables.append("*")
            tokens.append("|")
        parts.append(" ".join(tokens))
        if any_lyric_in_line:
            parts.append("w: " + " ".join(syllables))
    return "\n".join(parts)


# Map MusicXML <type> to ABC duration relative to L:1/4. Multipliers are
# unit-lengths-per-note.
_TYPE_TO_UNITS: dict[str, float] = {
    "whole": 4.0,
    "half": 2.0,
    "quarter": 1.0,
    "eighth": 0.5,
    "16th": 0.25,
    "32nd": 0.125,
}


def _note_to_abc(note: Note, divisions: int) -> str:
    """Render one note (or rest) as an ABC token."""
    if note.rest or note.step is None or note.octave is None:
        units = _duration_to_units(note, divisions)
        return "z" + _abc_length_suffix(units)

    # ABC letter case + octave marks:
    #   octave 4 → 'C' (uppercase, no marks)
    #   octave 5 → 'c' (lowercase)
    #   octave 3 → 'C,' (uppercase + ',')
    #   octave 6 → "c'"
    step = note.step.upper()
    if note.octave >= 5:
        letter = step.lower()
        marks = "'" * (note.octave - 5)
    else:
        letter = step
        marks = "," * (4 - note.octave) if note.octave < 4 else ""
    accidental = {1: "^", -1: "_", 2: "^^", -2: "__"}.get(note.alter, "")
    units = _duration_to_units(note, divisions)
    return f"{accidental}{letter}{marks}{_abc_length_suffix(units)}"


def _duration_to_units(note: Note, divisions: int) -> float:
    """How many L:1/4 units this note occupies."""
    if note.type_name and note.type_name in _TYPE_TO_UNITS:
        return _TYPE_TO_UNITS[note.type_name]
    # Fallback: derive from <duration> / divisions.
    if divisions <= 0:
        return 1.0
    return note.duration / divisions


def _abc_length_suffix(units: float) -> str:
    """ABC suffix for a unit-multiplier: 1 → '', 2 → '2', 0.5 → '/2', ..."""
    if units == 1.0:
        return ""
    if units == int(units):
        return str(int(units))
    # Common fractions: 1/2 → '/2', 1/4 → '/4', 1/8 → '/8', 3/2 → '3/2'.
    denom = 1
    while units * denom != int(units * denom) and denom < 64:
        denom *= 2
    numer = int(units * denom)
    if numer == 1:
        return f"/{denom}"
    return f"{numer}/{denom}"


def _syllable_for_w_line(text: str, syllabic: str | None) -> str:
    """How a syllable appears on the ABC `w:` line.

    Conventions (matches the demo melody.json files in songs/):
      single | end → the syllable on its own (a following space delimits).
      begin | middle → suffix '-' to join to the next syllable.
    """
    if syllabic in ("begin", "middle"):
        return text + "-"
    return text


# ── meta.json ─────────────────────────────────────────────────────────────

def _build_meta(song: Song) -> dict[str, Any]:
    """A draft meta.json. Caller is expected to set id/number/slug/tags."""
    slug = _slugify(song.title or "untitled")
    return {
        "id": "",
        "slug": slug,
        "title": song.title or "Untitled",
        "number": None,
        "key": song.key,
        "tempo": song.tempo,
        "language": "cs",
        "tags": [],
        "sourcePdf": None,
        "sourcePages": [],
        "hasStaffImages": False,
        "staveCount": 0,
        "reviewStatus": "auto",
    }


# Verse-number prefixes the engraver sometimes shows on the first lyric:
#   '1. ', '1) ', 'V1.', and the bare-syllable variants of each.
_VERSE_MARKER_RE = re.compile(r"^[VR]?\d+[.)]\s*", re.IGNORECASE)
_BARE_VERSE_MARKER_RE = re.compile(r"^[VR]?\d+[.)]$", re.IGNORECASE)


def first_phrase_title(
    song: Song,
    max_words: int = 4,
    max_syllables: int = 16,
) -> str:
    """Build a placeholder title from the first lyric phrase.

    Used by the batch converter when the source XML carries no title
    (proscholy.cz exports are like this). Walks syllables forward,
    joining begin/middle/end into whole words, then stops at the FIRST
    word boundary that satisfies any of:
      - `max_words` complete words have been collected,
      - the just-completed word ended with sentence punctuation,
      - the hard `max_syllables` escape hatch tripped (runaway lyric
        with no word boundary in sight — emit the partial word).

    The earlier v0 capped on syllable count anywhere — including
    mid-word — and produced truncations like 'Bůh je mou skrýbezpeč'
    instead of 'Bůh je mou skrýbezpečnou'. Capping on word boundaries
    fixes that for the cost of one extra syllable's worth of length.

    Verse-number markers can appear in two shapes on the first lyric:
      - As their own syllable: <text>1.</text>  — skip the whole syllable.
      - Glued onto the first word: <text>1. Kdo</text> — strip the prefix.
    """
    words: list[str] = []
    current: list[str] = []
    syllable_count = 0
    stop = False
    first_word = True
    for m in song.measures:
        for n in m.notes:
            if not n.lyric:
                continue
            text = n.lyric
            if _BARE_VERSE_MARKER_RE.match(text):
                continue
            if first_word:
                text = _VERSE_MARKER_RE.sub("", text)
                if not text:
                    continue
                first_word = False
            current.append(text)
            syllable_count += 1
            at_word_boundary = n.syllabic in (None, "single", "end")
            if at_word_boundary:
                words.append("".join(current))
                current = []
                if len(words) >= max_words:
                    stop = True
                    break
                if re.search(r"[.,;!?]$", words[-1]):
                    stop = True
                    break
            elif syllable_count >= max_syllables:
                # Runaway lyric (e.g. melisma with no word ending) —
                # flush whatever partial word we have and stop.
                stop = True
                break
        if stop:
            break
    if current:
        words.append("".join(current))
    return " ".join(words).rstrip(".,;:!?") or "Untitled"


# Tiny slug helper — matches the existing pipeline.output.slug behaviour
# for ASCII output but doesn't depend on it (keeps the musicxml module
# self-contained for the slim review image).
_SLUG_KEEP = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    import unicodedata
    norm = unicodedata.normalize("NFKD", text)
    ascii_text = norm.encode("ascii", "ignore").decode("ascii").lower()
    return _SLUG_KEEP.sub("-", ascii_text).strip("-") or "untitled"
