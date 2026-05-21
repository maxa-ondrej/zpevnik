"""Tests for the MusicXML → ChordPro + melody.json converter."""

from __future__ import annotations

import xml.etree.ElementTree as ET

from zpevnik_pipeline.musicxml.convert import convert_song, first_phrase_title
from zpevnik_pipeline.musicxml.extra_verses import ExtraVerse
from zpevnik_pipeline.musicxml.parser import Song, parse_musicxml_root

# A minimal partwise score: 4 measures in 4/4, key C, divisions=4.
#   m1 (verse, new-system, attributes): "C"  C  D  E  F   "Pá-na chvá-lit"
#   m2 (continues):                    "G"  G  A  B  c   "bu-du na-vě-ky"
#   m3 (new-system, light-heavy at end): "Am" a g f e   "víc než zna- li"
#   m4 (chorus, new-system, has Ref. direction): "F"  f e d c   "Bo-že náš"
MINIMAL_XML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <print new-system="yes"/>
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <sound tempo="100"/>
      <harmony><root><root-step>C</root-step></root><kind text="">major</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>Pá</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>na</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>chvá</text></lyric></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>lit</text></lyric></note>
    </measure>
    <measure number="2">
      <harmony><root><root-step>G</root-step></root><kind text="">major</kind></harmony>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>bu</text></lyric></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>du</text></lyric></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>na</text></lyric></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>vě-ky</text></lyric></note>
    </measure>
    <measure number="3">
      <print new-system="yes"/>
      <harmony><root><root-step>A</root-step></root><kind text="m">minor</kind></harmony>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>víc</text></lyric></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>než</text></lyric></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>zna</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>li.</text></lyric></note>
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
    <measure number="4">
      <print new-system="yes"/>
      <direction placement="above"><direction-type><words>Ref.</words></direction-type></direction>
      <harmony><root><root-step>F</root-step></root><kind text="">major</kind></harmony>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>Bo</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>že</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>náš</text></lyric></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>Pán.</text></lyric></note>
    </measure>
  </part>
</score-partwise>
"""


def _parse() -> Song:
    return parse_musicxml_root(ET.fromstring(MINIMAL_XML))


class TestParser:
    def test_top_level_fields(self) -> None:
        s = _parse()
        assert s.key == "C"
        assert s.time_num == 4 and s.time_den == 4
        assert s.divisions == 4
        assert s.tempo == 100
        assert len(s.measures) == 4

    def test_section_boundaries(self) -> None:
        # Expected: m1 starts a section (verse), m4 starts a section
        # (chorus, from Ref. direction). m3's light-heavy barline pushes
        # the pending boundary onto m4 — but m4 also has the chorus hint,
        # so m4 ends up as the chorus start regardless of order.
        s = _parse()
        boundaries = [(m.number, m.starts_section, m.section_type_hint)
                      for m in s.measures]
        assert boundaries[0] == (1, True, None)        # initial verse
        assert boundaries[1][1] is False               # m2 no boundary
        assert boundaries[2][1] is False               # m3 no boundary (its barline is end-of)
        assert boundaries[3] == (4, True, "chorus")    # chorus from Ref.

    def test_new_system_marks(self) -> None:
        s = _parse()
        marks = [m.starts_new_system for m in s.measures]
        assert marks == [True, False, True, True]

    def test_chord_above_lands_on_following_note(self) -> None:
        s = _parse()
        m1_notes = s.measures[0].notes
        # The C harmony is before the C note → that note carries chord_above.
        assert m1_notes[0].chord_above == "C"
        # Subsequent notes in the measure get no chord (no harmony before them).
        assert all(n.chord_above is None for n in m1_notes[1:])

    def test_lyric_syllabic_preserved(self) -> None:
        s = _parse()
        m1_notes = s.measures[0].notes
        assert [n.lyric for n in m1_notes] == ["Pá", "na", "chvá", "lit"]
        assert [n.syllabic for n in m1_notes] == ["begin", "end", "begin", "end"]


class TestConvert:
    def test_emits_two_blocks_verse_then_chorus(self) -> None:
        s = _parse()
        result = convert_song(s)
        assert [b["type"] for b in result.melody["blocks"]] == ["verse", "chorus"]

    def test_chordpro_has_section_directives(self) -> None:
        s = _parse()
        cho = convert_song(s).song_cho
        assert "{start_of_verse: 1}" in cho
        assert "{end_of_verse}" in cho
        assert "{start_of_chorus}" in cho
        assert "{end_of_chorus}" in cho

    def test_chordpro_line_breaks_follow_new_system(self) -> None:
        # m1 and m2 share a new-system → one line. m3 starts a new
        # system → a fresh line. So the verse has TWO lyric lines.
        s = _parse()
        cho = convert_song(s).song_cho
        verse_body = cho.split("{start_of_verse: 1}")[1].split("{end_of_verse}")[0].strip()
        verse_lines = [ln for ln in verse_body.splitlines() if ln.strip()]
        assert len(verse_lines) == 2
        assert verse_lines[0].startswith("[C]")
        # m3's first lyric is "víc"; m3 is in the second line.
        assert "víc" in verse_lines[1]

    def test_chordpro_chord_lands_at_change_point(self) -> None:
        s = _parse()
        cho = convert_song(s).song_cho
        # First syllable "Pá" should be preceded by [C], "bu" by [G].
        assert "[C]Pá" in cho
        assert "[G]bu" in cho

    def test_abc_body_includes_chord_annotations_and_w_line(self) -> None:
        s = _parse()
        melody = convert_song(s).melody
        verse_body = melody["blocks"][0]["body"]
        # Chord annotation must appear ABOVE the note in ABC syntax: `"C" C`.
        assert '"C" C' in verse_body
        assert '"G" G' in verse_body
        # Lyric line preserves syllabic joining.
        assert "Pá- na chvá- lit" in verse_body or "Pá-na chvá-lit" in verse_body

    def test_parser_strips_verse_marker_from_first_lyric(self) -> None:
        # `<text>1. Kdo</text>` should arrive in the IR as just 'Kdo'.
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>1. Kdo</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert s.measures[0].notes[0].lyric == "Kdo"

    def test_parser_drops_bare_verse_marker_lyric(self) -> None:
        # `<text>1.</text>` on its own note → lyric becomes None.
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>1.</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>Kdo</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        notes = s.measures[0].notes
        assert notes[0].lyric is None
        # And the w: line places `*` so the surviving syllable lines up
        # under the SECOND note, not the first.
        body = convert_song(s).melody["blocks"][0]["body"]
        assert "w: * Kdo" in body

    def test_abc_body_groups_measures_by_system(self) -> None:
        """Measures share a music line until <print new-system> breaks.

        Two correctness anchors:
          - Each `\\n` in an ABC body becomes a staff-line break in
            abcjs, so per-measure newlines create the one-note-per-
            staff bug the user saw on song 008.
          - The w: directive only attaches to the music line directly
            above; one w: per system aligns syllables across all the
            measures inside that system.

        Minimal-XML's verse:
          m1 (starts_new_system=True) + m2          → system 1
          m3 (starts_new_system=True)               → system 2
        → expect TWO music lines in the verse body, each followed by
          its own w:, with m1's chord+note tokens and m2's appearing
          on the SAME line separated by `|`.
        """
        s = _parse()
        body = convert_song(s).melody["blocks"][0]["body"]
        lines = body.splitlines()
        w_lines = [ln for ln in lines if ln.startswith("w:")]
        assert len(w_lines) == 2
        # First music line carries BOTH m1 and m2 — chord tokens for
        # "C" (m1) and "G" (m2) sit on the same line, separated by `|`.
        # Label is bare "Verse" when the section is the only verse in
        # the song; "Verse N" when there are multiple. The minimal-XML
        # fixture has one verse → bare label.
        first_music_idx = lines.index('"^Verse"') + 1
        first_music = lines[first_music_idx]
        assert '"C" C' in first_music
        assert '"G" G' in first_music
        assert first_music.count("|") == 2  # m1's barline + m2's barline

    def test_abc_header_includes_tempo_and_key(self) -> None:
        s = _parse()
        header = convert_song(s).melody["header"]
        assert "Q:1/4=100" in header
        assert "K:C" in header
        assert "M:4/4" in header

    def test_meta_carries_key_tempo_slug(self) -> None:
        s = _parse()
        # Title via override (the minimal XML has no <work-title>).
        s.title = "Pána chválit budu"
        meta = convert_song(s).meta
        assert meta["title"] == "Pána chválit budu"
        assert meta["slug"] == "pana-chvalit-budu"
        assert meta["key"] == "C"
        assert meta["tempo"] == 100
        assert meta["language"] == "cs"
        assert meta["reviewStatus"] == "auto"


class TestFirstPhraseTitle:
    def test_basic_phrase(self) -> None:
        # Minimal-XML's first 4 whole words: Pá-na | chvá-lit | bu-du |
        # na-vě-ky (the test XML happens to have "vě-ky" as one note).
        assert first_phrase_title(_parse()) == "Pána chválit budu navě-ky"

    def test_caps_at_word_boundary_not_mid_word(self) -> None:
        # The bug this guard exists for: at max_words=4, a multi-syllable
        # 4th word should be allowed to complete, not cut mid-syllable.
        # Lyrics: 'Bůh' | 'je' | 'mou' | 'skrý-bez-peč-nou,' (4 words)
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>Bůh</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>je</text></lyric></note>
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>mou</text></lyric></note>
          <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>skrý</text></lyric></note>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>bez</text></lyric></note>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>middle</syllabic><text>peč</text></lyric></note>
          <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>nou,</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert first_phrase_title(s) == "Bůh je mou skrýbezpečnou"

    def test_runaway_lyric_hits_syllable_escape_hatch(self) -> None:
        # 20 begin/middle syllables in a row with no end → the title
        # has to give up at some point. Hard cap = 16 syllables.
        parts = ["<score-partwise><part-list><score-part id=\"P1\"/></part-list><part id=\"P1\"><measure number=\"1\">"]
        parts.append('<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>')
        for i in range(20):
            syl = "begin" if i == 0 else "middle"
            parts.append(
                f'<note><pitch><step>C</step><octave>4</octave></pitch>'
                f'<duration>1</duration><type>quarter</type>'
                f'<lyric number="1"><syllabic>{syl}</syllabic>'
                f'<text>la</text></lyric></note>'
            )
        parts.append("</measure></part></score-partwise>")
        s = parse_musicxml_root(ET.fromstring("".join(parts)))
        # Should be exactly 16 "la"s joined into one half-word.
        assert first_phrase_title(s) == "la" * 16

    def test_strips_bare_verse_marker_syllable(self) -> None:
        # Engraver sometimes writes the verse number as its own syllable.
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>1.</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>Pán</text></lyric></note>
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>náš</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert first_phrase_title(s) == "Pán náš"

    def test_strips_verse_marker_glued_to_first_word(self) -> None:
        # proscholy.cz exports often have '1. Kdo' as a single <text>.
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>1. Kdo</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>se</text></lyric></note>
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>vzdá</text></lyric></note>
          <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>vá</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert first_phrase_title(s) == "Kdo se vzdává"

    def test_stops_at_sentence_punctuation(self) -> None:
        # First word with trailing comma → title is just that word + any
        # full words already collected (the comma cuts before more).
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>Aleluja,</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>chvála</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert first_phrase_title(s) == "Aleluja"


class TestLyricSpacesInsideSyllable:
    """A `<text>` element with an internal space is ONE syllable on ONE note.

    ABC `w:` uses space as the syllable separator, so emitting the lyric
    verbatim splits it across two notes — exactly the bug the user saw on
    song 008's '„V Bo' lyric (rendered as '„V' under note 1 and 'Bo' under
    note 2 instead of '„V Bo' under one note). The emitter must escape
    internal spaces with `~`.
    """

    def test_space_in_lyric_text_becomes_tilde_in_w_line(self) -> None:
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>begin</syllabic>
              <text>„V Bo</text></lyric></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration>
            <type>quarter</type><lyric number="1"><syllabic>end</syllabic>
              <text>hu</text></lyric></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        body = convert_song(s).melody["blocks"][0]["body"]
        # The first syllable is `„V~Bo-` (~ keeps the space attached, - is
        # the begin/middle hyphen). Verbatim "„V Bo-" would mis-align.
        assert "w: „V~Bo- hu" in body
        assert "„V Bo-" not in body


class TestRepeats:
    REPEAT_XML = """<score-partwise><part-list><score-part id="P1"/></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
          <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>
      </measure>
      <measure number="2">
        <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>
        <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>
      </measure>
    </part></score-partwise>"""

    def test_parser_sets_starts_and_ends_repeat_flags(self) -> None:
        s = parse_musicxml_root(ET.fromstring(self.REPEAT_XML))
        assert s.measures[0].starts_repeat is False
        assert s.measures[0].ends_repeat is True
        assert s.measures[1].starts_repeat is True
        assert s.measures[1].ends_repeat is True

    def test_abc_emits_pipe_colon_for_repeats(self) -> None:
        s = parse_musicxml_root(ET.fromstring(self.REPEAT_XML))
        # The light-heavy on m1 also flips section boundary → two sections.
        bodies = [b["body"] for b in convert_song(s).melody["blocks"]]
        joined = "\n".join(bodies)
        assert ":|" in joined          # backward repeat barline
        assert "|:" in joined          # forward repeat at m2's left
        # The forward+backward together should NOT produce `| |:`
        # (the prior trailing | gets replaced by |:).
        assert " | |: " not in joined


class TestExtraVerses:
    def test_chordpro_appends_extra_verses_with_chorus_repeat(self) -> None:
        s = _parse()
        extras = [
            ExtraVerse(number=2, lines=["Druhá první", "Druhá druhá."], chorus_after=True),
            ExtraVerse(number=3, lines=["Třetí prv", "Třetí druh."], chorus_after=False),
        ]
        cho = convert_song(s, extra_verses=extras).song_cho
        # Verse 2 + a SECOND chorus block (expanded from chorus_after) +
        # Verse 3 in that order. The XML itself has one chorus block
        # (the canonical one from the minimal-XML fixture), so finding
        # a *second* {start_of_chorus} after verse 2 proves the expand.
        v2 = cho.index("{start_of_verse: 2}")
        first_chorus = cho.index("{start_of_chorus}")
        second_chorus = cho.index("{start_of_chorus}", v2)
        v3 = cho.index("{start_of_verse: 3}", second_chorus)
        assert first_chorus < v2 < second_chorus < v3
        # The expanded chorus carries the SAME lyrics as the original.
        original_body = cho[
            cho.index("{start_of_chorus}") + len("{start_of_chorus}\n"):
            cho.index("{end_of_chorus}")
        ].strip()
        expanded_body = cho[
            second_chorus + len("{start_of_chorus}\n"):
            cho.index("{end_of_chorus}", second_chorus)
        ].strip()
        assert original_body == expanded_body
        # Bodies preserved verbatim.
        assert "Druhá první" in cho
        assert "Třetí prv" in cho

    def test_no_extra_verses_means_no_extra_blocks(self) -> None:
        s = _parse()
        cho = convert_song(s).song_cho
        assert "{start_of_verse: 2}" not in cho
        assert "{chorus}" not in cho


class TestChordRendering:
    def test_dominant_seventh(self) -> None:
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <harmony><root><root-step>G</root-step></root><kind text="7">dominant</kind></harmony>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert s.measures[0].notes[0].chord_above == "G7"

    def test_minor(self) -> None:
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <harmony><root><root-step>A</root-step></root><kind text="m">minor</kind></harmony>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert s.measures[0].notes[0].chord_above == "Am"

    def test_flat_root_with_alter(self) -> None:
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root>
                   <kind text="">major</kind></harmony>
          <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert s.measures[0].notes[0].chord_above == "Bb"

    def test_key_signature_one_sharp_is_G(self) -> None:
        xml = """<score-partwise><part-list><score-part id="P1"/></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions>
            <key><fifths>1</fifths><mode>major</mode></key>
            <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
        </measure></part></score-partwise>"""
        s = parse_musicxml_root(ET.fromstring(xml))
        assert s.key == "G"
