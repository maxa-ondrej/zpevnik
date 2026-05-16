"""Unit tests for stage-7 ChordPro emission."""

from __future__ import annotations

from zpevnik_pipeline.output.chordpro import emit_song, normalize_chordpro_line
from zpevnik_pipeline.parse.align import AlignedLine


def test_normalize_chordpro_line_translates_czech_chords() -> None:
    line = "Já [H]jdu k [B]Pánu [G/H]vésti"
    assert (
        normalize_chordpro_line(line, language="cs")
        == "Já [B]jdu k [Bb]Pánu [G/B]vésti"
    )


def test_normalize_chordpro_line_passes_through_english() -> None:
    line = "Walk in [G]light, [C]hold [D]on"
    assert normalize_chordpro_line(line, language="en") == line


def test_normalize_chordpro_only_touches_chord_brackets() -> None:
    line = "no chords here, just lyrics"
    assert normalize_chordpro_line(line, language="cs") == line


def test_emit_song_starts_with_title_directive() -> None:
    out = emit_song(
        number=3,
        title="Salve Regina",
        aligned_lines=[AlignedLine(chordpro="[C]Salve [G]Regina")],
        language="la",
    )
    lines = out.chordpro.splitlines()
    assert lines[0] == "{title: Salve Regina}"
    assert lines[1] == "{number: 3}"
    assert "[C]Salve [G]Regina" in out.chordpro
    assert out.title == "Salve Regina"
    assert out.number == 3


def test_emit_song_translates_chords_when_language_is_cs() -> None:
    out = emit_song(
        number=1,
        title="Test",
        aligned_lines=[AlignedLine(chordpro="[H]ahoj [B]světe")],
        language="cs",
    )
    assert "[B]ahoj [Bb]světe" in out.chordpro
    # Original Czech notation must not leak through.
    assert "[H]" not in out.chordpro


def test_emit_song_falls_back_to_synthetic_title_when_missing() -> None:
    out = emit_song(
        number=42,
        title=None,
        aligned_lines=[AlignedLine(chordpro="instrumental")],
        language="en",
    )
    assert out.title == "Song 42"
    assert out.chordpro.startswith("{title: Song 42}\n")


def test_emit_song_skips_empty_aligned_lines() -> None:
    out = emit_song(
        number=1,
        title="x",
        aligned_lines=[
            AlignedLine(chordpro="line one"),
            AlignedLine(chordpro=""),
            AlignedLine(chordpro="line two"),
        ],
        language="en",
    )
    body = out.chordpro.split("\n\n", 1)[1]  # everything after the head block
    assert body.strip().splitlines() == ["line one", "line two"]
