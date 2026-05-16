"""Unit tests for stage-8 section markers."""

from __future__ import annotations

from zpevnik_pipeline.output.sections import apply_section_markers


def test_no_markers_passes_through() -> None:
    lines = ["just lyrics", "more lyrics"]
    assert apply_section_markers(lines) == lines


def test_verse_marker_opens_and_closes_section() -> None:
    out = apply_section_markers(
        [
            "1. první sloka první řádek",
            "druhý řádek",
        ]
    )
    assert out == [
        "{start_of_verse: 1}",
        "první sloka první řádek",
        "druhý řádek",
        "{end_of_verse}",
    ]


def test_consecutive_verses_close_previous_section() -> None:
    out = apply_section_markers(
        [
            "1. prvni",
            "2. druha",
        ]
    )
    assert out == [
        "{start_of_verse: 1}",
        "prvni",
        "{end_of_verse}",
        "{start_of_verse: 2}",
        "druha",
        "{end_of_verse}",
    ]


def test_refrain_marker_opens_chorus() -> None:
    for marker in ["R:", "Ref:", "Ref.:", "ref:"]:
        out = apply_section_markers([f"{marker} Pane náš"])
        assert out == [
            "{start_of_chorus}",
            "Pane náš",
            "{end_of_chorus}",
        ]


def test_verse_then_chorus_then_verse_closes_each_in_turn() -> None:
    out = apply_section_markers(
        [
            "1. sloka 1",
            "R: refrén",
            "2. sloka 2",
        ]
    )
    assert out == [
        "{start_of_verse: 1}",
        "sloka 1",
        "{end_of_verse}",
        "{start_of_chorus}",
        "refrén",
        "{end_of_chorus}",
        "{start_of_verse: 2}",
        "sloka 2",
        "{end_of_verse}",
    ]


def test_leading_chord_brackets_are_preserved_with_body() -> None:
    out = apply_section_markers(["[C]1. [G]Lorem [Am]ipsum"])
    assert out == [
        "{start_of_verse: 1}",
        "[C][G]Lorem [Am]ipsum",
        "{end_of_verse}",
    ]


def test_marker_on_its_own_line_emits_directive_without_body() -> None:
    # Some songs print the section header on a line by itself.
    out = apply_section_markers(
        [
            "1.",
            "actual lyrics here",
        ]
    )
    assert out == [
        "{start_of_verse: 1}",
        "actual lyrics here",
        "{end_of_verse}",
    ]


def test_section_does_not_close_until_next_marker_or_end() -> None:
    out = apply_section_markers(
        [
            "1. první",
            "druhý",
            "třetí",
        ]
    )
    assert out == [
        "{start_of_verse: 1}",
        "první",
        "druhý",
        "třetí",
        "{end_of_verse}",
    ]


def test_digit_period_inside_a_line_is_not_a_section_marker() -> None:
    # We only match markers at the very start of a line. "He turned 1. away"
    # in the middle of text must not be misclassified.
    out = apply_section_markers(["he turned 1. away"])
    assert out == ["he turned 1. away"]
