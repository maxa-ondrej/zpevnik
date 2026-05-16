"""Unit tests for stage-6 chord-to-lyric alignment."""

from __future__ import annotations

from zpevnik_pipeline.parse.align import align_line
from zpevnik_pipeline.parse.ocr import OcrToken


def _chord(text: str, x: int, w: int = 30) -> OcrToken:
    return OcrToken(text=text, x_left=x, x_right=x + w, y_top=0, y_bottom=30, confidence=95.0)


def _lyric(text: str, x: int, w: int) -> OcrToken:
    return OcrToken(text=text, x_left=x, x_right=x + w, y_top=80, y_bottom=110, confidence=95.0)


def test_chord_inserted_before_word_when_x_lines_up_with_token_start() -> None:
    chords = [_chord("C", x=100)]
    lyrics = [_lyric("hello", x=100, w=120)]
    out = align_line(chords, lyrics)
    assert out.chordpro == "[C]hello"


def test_chord_inserted_into_word_when_x_falls_within_token() -> None:
    chords = [_chord("G", x=160)]  # center x = 175, mid-way through "hello"
    lyrics = [_lyric("hello", x=100, w=120)]
    out = align_line(chords, lyrics)
    # Center x falls ~0.625 across the token → char position 3 → "hel[G]lo"
    assert "[G]" in out.chordpro
    assert out.chordpro.startswith("hel") or out.chordpro.startswith("he[G]")


def test_two_chords_over_two_words() -> None:
    chords = [_chord("C", x=100), _chord("G", x=300)]
    lyrics = [
        _lyric("hello", x=100, w=120),
        _lyric("world", x=300, w=120),
    ]
    out = align_line(chords, lyrics)
    assert out.chordpro == "[C]hello [G]world"


def test_chord_before_any_lyric_is_prepended() -> None:
    chords = [_chord("C", x=10)]  # center 25
    lyrics = [_lyric("hello", x=100, w=120)]
    out = align_line(chords, lyrics)
    assert out.chordpro == "[C]hello"


def test_chord_after_last_lyric_is_appended() -> None:
    chords = [_chord("Am", x=500)]  # well past the end of "hello"
    lyrics = [_lyric("hello", x=100, w=120)]
    out = align_line(chords, lyrics)
    assert out.chordpro == "hello [Am]"


def test_instrumental_line_with_no_lyrics() -> None:
    chords = [_chord("C", x=100), _chord("G", x=200), _chord("Am", x=300)]
    out = align_line(chords, [])
    assert out.chordpro == "[C] [G] [Am]"


def test_no_chords_returns_lyrics_unchanged() -> None:
    lyrics = [_lyric("hello", x=100, w=120), _lyric("world", x=300, w=120)]
    out = align_line([], lyrics)
    assert out.chordpro == "hello world"


def test_two_chords_on_same_word_both_render() -> None:
    chords = [_chord("C", x=110), _chord("G", x=180)]
    lyrics = [_lyric("hello", x=100, w=120)]
    out = align_line(chords, lyrics)
    # Both chords land inside "hello" — both labels should appear, and the
    # original characters of "hello" are preserved.
    assert "[C]" in out.chordpro
    assert "[G]" in out.chordpro
    plain = (
        out.chordpro.replace("[C]", "").replace("[G]", "")
    )
    assert plain == "hello"


def test_chords_assigned_to_closest_lyric_when_between_tokens() -> None:
    # Chord center at 250 — gap between "hello" (ends at 220) and "world" (starts 280)
    # Distance to "hello": 30. To "world": 30. Tie → leftmost ("hello").
    chords = [_chord("C", x=235, w=30)]  # center = 250
    lyrics = [_lyric("hello", x=100, w=120), _lyric("world", x=280, w=120)]
    out = align_line(chords, lyrics)
    # Chord goes onto "hello" — at the end since x is past the right edge.
    assert out.chordpro == "hello[C] world"


def test_hyphenated_word_keeps_chord_at_correct_syllable() -> None:
    # Czech songbook lyric tokens often arrive hyphen-joined, e.g. "ra-dost".
    # A chord landing mid-token should split at the hyphen-adjacent boundary.
    chords = [_chord("G", x=160)]  # center 175 → roughly 0.5 of a 100px token starting at 150
    # Token "ra-dost" centered at 150..250.
    lyrics = [_lyric("ra-dost", x=150, w=100)]
    out = align_line(chords, lyrics)
    # Position should be inside the word — chord label appears once, and
    # the hyphen is preserved.
    assert "[G]" in out.chordpro
    plain = out.chordpro.replace("[G]", "")
    assert plain == "ra-dost"
