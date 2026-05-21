"""Parse a MusicXML 3.x partwise score into a small IR.

The IR is the contract every emitter (ChordPro, ABC, meta) consumes.
Keep it minimal — anything XML-specific that isn't directly useful
to the emitters stays out.
"""

from __future__ import annotations

import contextlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

# Verse-number markers the engraver sometimes prefixes the first lyric
# with ("1.", "1)", "V1.", "R."). Two shapes appear in proscholy.cz
# exports — bare ("1.") and glued ("1. Kdo"). Strip at parse time so
# they don't leak into the ABC w: line (where a literal space inside
# a syllable token misaligns the next syllable with the wrong note).
_LYRIC_VERSE_MARKER_PREFIX_RE = re.compile(r"^[VR]?\d+[.)]\s*", re.IGNORECASE)
_LYRIC_BARE_VERSE_MARKER_RE = re.compile(r"^[VR]?\d+[.)]$", re.IGNORECASE)


def _strip_verse_marker(text: str) -> str:
    """Return the lyric text with any leading verse-number marker removed."""
    if _LYRIC_BARE_VERSE_MARKER_RE.match(text):
        return ""
    return _LYRIC_VERSE_MARKER_PREFIX_RE.sub("", text)


# fifths → tonic. -7..+7. Matches MusicXML <key><fifths> + <mode>major.
_FIFTHS_TO_MAJOR = {
    -7: "Cb", -6: "Gb", -5: "Db", -4: "Ab", -3: "Eb", -2: "Bb", -1: "F",
    0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
}
_FIFTHS_TO_MINOR = {
    -7: "Abm", -6: "Ebm", -5: "Bbm", -4: "Fm", -3: "Cm", -2: "Gm", -1: "Dm",
    0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m",
}

# Words sometimes used in <direction><words> to mark the chorus.
_CHORUS_WORDS = {"ref.", "refrén", "refren", "chorus", "r."}


@dataclass
class Note:
    """One note (or rest) with its lyric + chord-above context."""

    step: str | None          # 'C'..'B', or None for rest
    octave: int | None        # 0..9, or None for rest
    alter: int = 0            # -1 flat, 0 natural, +1 sharp
    duration: int = 0         # in <divisions> units
    rest: bool = False
    type_name: str | None = None  # 'whole', 'half', 'quarter', 'eighth', ...
    lyric: str | None = None  # syllable text on this note
    syllabic: str | None = None   # 'single' | 'begin' | 'middle' | 'end'
    chord_above: str | None = None  # chord symbol that lands on this note
    # NOTE: a `<chord/>` child means "play simultaneously with the prior
    # note" — we drop these (they're polyphony, not the melody line).
    is_chord_tone: bool = False


@dataclass
class Measure:
    number: int
    notes: list[Note] = field(default_factory=list)
    # Section boundary state for the emitter:
    starts_section: bool = False           # boundary lands *before* this measure
    section_type_hint: str | None = None   # 'verse' | 'chorus' set by <direction>
    starts_new_system: bool = False        # engraver's line-break marker
    # Repeat markers from <repeat direction=…> on the surrounding barlines.
    # `starts_repeat`: a forward repeat barline `|:` sits at this measure's
    # left edge. `ends_repeat`: a backward repeat barline `:|` sits at the
    # right. Lets the ABC emitter render the repeat structure faithfully
    # so abcjs draws the dots and TimingCallbacks plays the repeat through.
    starts_repeat: bool = False
    ends_repeat: bool = False


@dataclass
class Song:
    title: str | None
    key: str               # e.g. 'C', 'G', 'Am'
    time_num: int          # M: numerator
    time_den: int          # M: denominator
    divisions: int         # <divisions> per quarter
    tempo: int | None      # BPM (from <sound tempo=...>), or None
    measures: list[Measure]


def _chord_suffix(kind_text: str, kind_attr_text: str) -> str:
    """Map <kind>'s text + attr to a chord suffix ('', 'm', '7', 'dim', ...).

    The `text` attribute (when present) is what the score *displays*;
    prefer it. Fallback: map known kind names.
    """
    if kind_attr_text:
        return kind_attr_text
    kind = (kind_text or "").lower()
    return {
        "major": "",
        "minor": "m",
        "dominant": "7",
        "diminished": "dim",
        "augmented": "aug",
        "major-seventh": "maj7",
        "minor-seventh": "m7",
        "suspended-fourth": "sus4",
        "suspended-second": "sus2",
    }.get(kind, "")


def _harmony_to_chord(harmony: ET.Element) -> str | None:
    """Render a <harmony> element to a single chord token like 'Bb7' or 'F#m'."""
    root = harmony.find("root")
    if root is None:
        return None
    step_el = root.find("root-step")
    if step_el is None or not step_el.text:
        return None
    step = step_el.text
    alter_el = root.find("root-alter")
    alter = int(alter_el.text or 0) if alter_el is not None and alter_el.text else 0
    accidental = {1: "#", -1: "b", 2: "##", -2: "bb"}.get(alter, "")
    kind_el = harmony.find("kind")
    kind_text = (kind_el.text or "") if kind_el is not None else ""
    kind_attr = (kind_el.attrib.get("text") if kind_el is not None else "") or ""
    suffix = _chord_suffix(kind_text, kind_attr)

    # Optional bass note: render as "C/E".
    bass = harmony.find("bass")
    bass_str = ""
    if bass is not None:
        bs = bass.find("bass-step")
        ba = bass.find("bass-alter")
        if bs is not None and bs.text:
            ba_n = int(ba.text or 0) if ba is not None and ba.text else 0
            bass_str = "/" + bs.text + {1: "#", -1: "b"}.get(ba_n, "")

    return f"{step}{accidental}{suffix}{bass_str}"


def _section_hint_from_words(text: str) -> str | None:
    """Map a <words> text to a section type, or None if unrelated."""
    norm = text.strip().lower()
    if norm in _CHORUS_WORDS:
        return "chorus"
    return None


def parse_musicxml(xml_path: Path | str) -> Song:
    """Read a MusicXML file from disk into the IR."""
    tree = ET.parse(xml_path)
    return parse_musicxml_root(tree.getroot())


def parse_musicxml_root(root: ET.Element) -> Song:
    """Parse from an already-loaded XML root (useful in tests)."""
    title_el = root.find("work/work-title") or root.find("movement-title")
    title = title_el.text.strip() if title_el is not None and title_el.text else None

    parts = root.findall("part")
    if not parts:
        raise ValueError("MusicXML: no <part> elements found")
    part = parts[0]

    # Header values get filled by the first <attributes> block we see.
    key = "C"
    time_num, time_den = 4, 4
    divisions = 1
    tempo: int | None = None

    measures: list[Measure] = []
    current_section_type: str | None = None
    pending_section_boundary = True  # first measure always starts a section

    for m_el in part.findall("measure"):
        number = int(m_el.attrib.get("number", "0") or 0)
        m = Measure(number=number)

        # `<print new-system="yes"/>` is the engraver's line-break marker
        # and the most reliable signal for ChordPro line breaks within a
        # section. Only the first print element of the measure counts.
        print_el = m_el.find("print")
        if print_el is not None and print_el.attrib.get("new-system") == "yes":
            m.starts_new_system = True

        # Header attributes — usually only on measure 1, but allowed mid-piece.
        attrs = m_el.find("attributes")
        if attrs is not None:
            div_el = attrs.find("divisions")
            if div_el is not None and div_el.text:
                divisions = int(div_el.text)
            key_el = attrs.find("key")
            if key_el is not None:
                fifths_el = key_el.find("fifths")
                mode_el = key_el.find("mode")
                if fifths_el is not None and fifths_el.text:
                    fifths = int(fifths_el.text)
                    mode_text = mode_el.text if mode_el is not None and mode_el.text else "major"
                    mode = mode_text.lower()
                    table = _FIFTHS_TO_MINOR if mode == "minor" else _FIFTHS_TO_MAJOR
                    key = table.get(fifths, key)
            time_el = attrs.find("time")
            if time_el is not None:
                beats_el = time_el.find("beats")
                btype_el = time_el.find("beat-type")
                if beats_el is not None and beats_el.text:
                    time_num = int(beats_el.text)
                if btype_el is not None and btype_el.text:
                    time_den = int(btype_el.text)

        # Tempo: <sound tempo="N"/> wherever it sits.
        for snd in m_el.iter("sound"):
            t = snd.attrib.get("tempo")
            if t:
                with contextlib.suppress(ValueError):
                    tempo = int(float(t))

        # A chorus/bridge hint in this measure's directions forces a
        # section boundary on THIS measure (regardless of the prior
        # barline state), and sets the section type for what follows.
        chorus_hint: str | None = None
        for d in m_el.iter("direction"):
            for w in d.iter("words"):
                if w.text:
                    h = _section_hint_from_words(w.text)
                    if h:
                        chorus_hint = h
        if chorus_hint:
            pending_section_boundary = True
            current_section_type = chorus_hint

        # Apply pending boundary BEFORE looking at this measure's barlines
        # (which mark the END of this measure → the NEXT one's boundary).
        if pending_section_boundary:
            m.starts_section = True
            m.section_type_hint = current_section_type
            pending_section_boundary = False

        # Walk children in order so chord <harmony>s land on the correct note.
        pending_chord: str | None = None
        for child in m_el:
            if child.tag == "harmony":
                chord = _harmony_to_chord(child)
                if chord:
                    pending_chord = chord
            elif child.tag == "note":
                note = _parse_note(child)
                if pending_chord and not note.is_chord_tone:
                    note.chord_above = pending_chord
                    pending_chord = None
                m.notes.append(note)

        # Walk every barline to pick up section boundaries (right-side
        # only) AND repeat markers (forward on left, backward on right).
        # `light-light` is a phrase double-bar, NOT a section break.
        for b in m_el.iter("barline"):
            loc = b.attrib.get("location", "right")
            bs = b.find("bar-style")
            rep = b.find("repeat")
            rep_dir = rep.attrib.get("direction") if rep is not None else None

            if loc == "right":
                if bs is not None and bs.text == "light-heavy":
                    pending_section_boundary = True
                if rep_dir == "backward":
                    m.ends_repeat = True
            elif loc == "left" and rep_dir == "forward":
                m.starts_repeat = True

        measures.append(m)

    return Song(
        title=title,
        key=key,
        time_num=time_num,
        time_den=time_den,
        divisions=divisions,
        tempo=tempo,
        measures=measures,
    )


def _parse_note(note_el: ET.Element) -> Note:
    """Parse one <note> element. Rest/pitched/chord-tone all flow through here."""
    is_chord_tone = note_el.find("chord") is not None
    rest_el = note_el.find("rest")
    duration_el = note_el.find("duration")
    duration = int(duration_el.text) if duration_el is not None and duration_el.text else 0
    type_el = note_el.find("type")
    type_name = type_el.text if type_el is not None else None

    if rest_el is not None:
        return Note(
            step=None, octave=None, duration=duration,
            rest=True, type_name=type_name, is_chord_tone=is_chord_tone,
        )

    pitch = note_el.find("pitch")
    step: str | None = None
    octave: int | None = None
    alter = 0
    if pitch is not None:
        s_el = pitch.find("step")
        o_el = pitch.find("octave")
        a_el = pitch.find("alter")
        if s_el is not None and s_el.text:
            step = s_el.text
        if o_el is not None and o_el.text:
            octave = int(o_el.text)
        if a_el is not None and a_el.text:
            alter = int(a_el.text)

    lyric: str | None = None
    syllabic: str | None = None
    # Prefer the verse=1 lyric line. Multi-verse handling can come later.
    for lyr in note_el.iter("lyric"):
        if lyr.attrib.get("number", "1") != "1":
            continue
        syl_el = lyr.find("syllabic")
        txt_el = lyr.find("text")
        if txt_el is not None and txt_el.text:
            # Concatenate adjacent <text> siblings (some scores split words).
            parts = [t.text for t in lyr.findall("text") if t.text]
            lyric = "".join(parts)
            # Strip leading "1.", "2)", "V1." etc — verse-number markers
            # that the engraver glued onto (or wrote as) the first lyric.
            if lyric is not None:
                stripped = _strip_verse_marker(lyric)
                lyric = stripped or None
        if syl_el is not None and syl_el.text:
            syllabic = syl_el.text
        break

    return Note(
        step=step, octave=octave, alter=alter, duration=duration,
        rest=False, type_name=type_name, lyric=lyric, syllabic=syllabic,
        is_chord_tone=is_chord_tone,
    )
