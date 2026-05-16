"""Czech ↔ English chord-notation translation.

In Czech music notation the letter names B/H differ from English:

* Czech ``H``  = English ``B``  (the white key)
* Czech ``B``  = English ``Bb`` (the black key one semitone below)

Everywhere else the notation is identical. The pipeline stores chords in
canonical English (so transposition, search, and interchange with other
ChordPro tools stay simple); the reader app translates back to Czech at
render time via the matching ``chordpro/notation.ts`` module.

Public surface
--------------

:func:`czech_to_english` is what stage 7 calls to normalize an OCR'd chord
string before writing it into a ``.cho`` file. The function operates on
the **root** of the chord only — any quality / extension / bass-note tail
is left untouched.
"""

from __future__ import annotations

import re

# Matches: root letter [optional accidental] tail.
# Bass note (slash) gets a second pass over the substring after "/".
_ROOT_RE = re.compile(r"^([A-Ha-h])([b#♭♯]?)(.*)$")


def _translate_root(letter: str, accidental: str) -> tuple[str, str]:
    """Translate a single Czech root + accidental into English."""
    # Czech "B" with no flat sign is English Bb; Czech "H" is English B.
    L = letter.upper()
    if L == "H" and accidental == "":
        return "B", ""
    if L == "B" and accidental == "":
        return "B", "b"
    return letter, accidental


def _translate_segment(seg: str) -> str:
    """Translate the part before any slash. Handles root + optional flat/sharp."""
    m = _ROOT_RE.match(seg)
    if not m:
        return seg
    letter, accidental, tail = m.group(1), m.group(2), m.group(3)
    new_letter, new_accidental = _translate_root(letter, accidental)
    return new_letter + new_accidental + tail


def czech_to_english(chord: str) -> str:
    """Normalize a single chord token from Czech to English notation.

    Idempotent on already-English chords (``C``, ``Bb``, ``F#m`` round-trip
    unchanged). Handles slash-bass chords (``G/H`` → ``G/B``).
    """
    if "/" in chord:
        head, bass = chord.split("/", 1)
        return _translate_segment(head) + "/" + _translate_segment(bass)
    return _translate_segment(chord)
