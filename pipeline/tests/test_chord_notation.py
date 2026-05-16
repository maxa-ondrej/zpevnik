"""Unit tests for Czech ↔ English chord-root translation."""

from __future__ import annotations

import pytest

from zpevnik_pipeline.parse.chord_notation import czech_to_english


@pytest.mark.parametrize(
    "czech,english",
    [
        ("H", "B"),
        ("Hm", "Bm"),
        ("Hmaj7", "Bmaj7"),
        ("H7", "B7"),
        ("B", "Bb"),
        ("Bm", "Bbm"),
        ("B7", "Bb7"),
        ("Bm7", "Bbm7"),
        # English-flat / sharp roots are pass-through.
        ("Bb", "Bb"),
        ("Bbm", "Bbm"),
        ("F#", "F#"),
        ("F#m", "F#m"),
        ("Cmaj7", "Cmaj7"),
        ("C", "C"),
        ("Am", "Am"),
        ("D7", "D7"),
        # Slash-bass: both halves translate.
        ("G/H", "G/B"),
        ("C/B", "C/Bb"),
        ("D/F#", "D/F#"),
    ],
)
def test_czech_to_english(czech: str, english: str) -> None:
    assert czech_to_english(czech) == english


def test_czech_to_english_is_idempotent_on_english_input() -> None:
    for chord in ["C", "G", "Am", "Bb", "F#m", "G/B", "Dm7", "Cmaj7"]:
        assert czech_to_english(czech_to_english(chord)) == czech_to_english(chord)
