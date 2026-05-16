"""Stage 6 — align chord tokens to lyric syllables.

For each song-line we have:

* chord tokens with their x-bounding boxes (from :mod:`parse.ocr.ocr_chord_row`);
* lyric tokens with their x-bounding boxes (from :mod:`parse.ocr.ocr_lyric_row`).

Stage 6 reduces these to a single ChordPro string of the form
``[C]he[G]llo [Am]world``.

Algorithm
---------

Each chord token's *left edge* is matched against the lyric tokens. The
left edge is the chord's true anchor — typesetters place a chord with its
first character directly above the lyric character it applies to. We find
the lyric token whose x-range contains that anchor (or, failing that, the
nearest by edge distance). Within that token we interpolate the anchor's
x linearly across the token's width to pick a character position. The
chord marker is inserted right before that character. Token order on
output is the original left-to-right lyric order; chord markers attached
*before any lyric* are prepended, and ones *after the last lyric* are
appended.

This is a fast, deterministic, OCR-only alignment — it doesn't model
musical bars or measures. That's intentional: the staff PNG (stage 10)
preserves the original notation, so any subtleties the bbox-aligned
ChordPro can't capture are still visible alongside the textual chords.
"""

from __future__ import annotations

from dataclasses import dataclass

from .ocr import OcrToken


@dataclass(frozen=True)
class AlignedLine:
    chordpro: str


def _nearest_lyric_index(anchor_x: float, lyric_tokens: list[OcrToken]) -> int:
    """Index of the lyric token whose x-range is closest to ``anchor_x``.

    Containment wins over distance. Ties broken by left-most token.
    """
    best_idx = 0
    best_dist = float("inf")
    for i, t in enumerate(lyric_tokens):
        if t.x_left <= anchor_x <= t.x_right:
            return i  # containment is always preferred
        dist = min(abs(anchor_x - t.x_left), abs(anchor_x - t.x_right))
        if dist < best_dist:
            best_dist = dist
            best_idx = i
    return best_idx


def _char_position_in_token(token: OcrToken, target_x: float) -> int:
    """Linearly interpolate target_x into a character index within token.text.

    Returned position is in ``[0, len(text)]``. ``0`` means "insert before
    the first character"; ``len(text)`` means "insert after the last".
    """
    text = token.text
    if not text:
        return 0
    width = max(1, token.x_right - token.x_left)
    rel = (target_x - token.x_left) / width
    rel = max(0.0, min(1.0, rel))
    pos = round(rel * len(text))
    return max(0, min(len(text), pos))


def align_line(
    chord_tokens: list[OcrToken],
    lyric_tokens: list[OcrToken],
) -> AlignedLine:
    """Produce a ChordPro string aligning chord tokens to lyric tokens."""
    chord_tokens = sorted(chord_tokens, key=lambda t: t.x_left)
    lyric_tokens = sorted(lyric_tokens, key=lambda t: t.x_left)

    # No lyrics? Emit chords in order, separated by spaces. This is what
    # an instrumental/interlude line looks like.
    if not lyric_tokens:
        return AlignedLine(
            chordpro=" ".join(f"[{c.text}]" for c in chord_tokens)
        )

    # Per-lyric-token character buffer. We'll build each token's annotated
    # form independently, then join with spaces at the end.
    #
    # ``inserts[i]`` is a list of (char_pos, chord_label) for token ``i``,
    # sorted by char_pos so we can replay them right-to-left when stitching.
    inserts: dict[int, list[tuple[int, str]]] = {i: [] for i in range(len(lyric_tokens))}
    # Chords that land before any lyric token. Rendered as a prefix.
    prefix_chords: list[str] = []
    # Chords past the right edge of the rightmost lyric token. Rendered as suffix.
    suffix_chords: list[str] = []

    first_lyric_left = lyric_tokens[0].x_left
    last_lyric_right = lyric_tokens[-1].x_right

    for chord in chord_tokens:
        anchor = chord.x_left
        label = chord.text
        if anchor < first_lyric_left and not _any_contains(anchor, lyric_tokens):
            prefix_chords.append(label)
            continue
        if anchor > last_lyric_right and not _any_contains(anchor, lyric_tokens):
            suffix_chords.append(label)
            continue
        idx = _nearest_lyric_index(anchor, lyric_tokens)
        pos = _char_position_in_token(lyric_tokens[idx], anchor)
        inserts[idx].append((pos, label))

    # Stitch each lyric token's annotated form.
    rendered: list[str] = []
    for i, token in enumerate(lyric_tokens):
        text = token.text
        for pos, label in sorted(inserts[i], key=lambda p: p[0], reverse=True):
            text = text[:pos] + f"[{label}]" + text[pos:]
        rendered.append(text)

    body = " ".join(rendered)
    if prefix_chords:
        body = "".join(f"[{c}]" for c in prefix_chords) + body
    if suffix_chords:
        body = body + " " + " ".join(f"[{c}]" for c in suffix_chords)
    return AlignedLine(chordpro=body)


def _any_contains(x: float, tokens: list[OcrToken]) -> bool:
    return any(t.x_left <= x <= t.x_right for t in tokens)
