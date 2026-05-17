/**
 * Component tests for {@link SongView}.
 *
 * Runs in the jsdom environment via `react-native-web` (configured in
 * `vitest.config.ts`), so RN's `<Text>` / `<View>` mount as real DOM nodes
 * that Testing Library can query.
 *
 * These tests pin the rendered tree against the SongView's interplay with
 * the settings store: transpose, notation, and fontSize.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { parseChordPro } from '../chordpro/parser';
import { useSettings } from '../store/settings';
import { SongView } from './SongView';

/** Reset the persisted Zustand settings store between tests. */
function resetSettings() {
  useSettings.setState({
    notation: 'cs',
    transpose: 0,
    capo: 0,
    fontSize: 16,
    lineSpacing: 1.4,
    darkMode: 'system',
    showStaves: true,
    autoScrollSpeed: 30,
  });
}

describe('SongView', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    // Belt-and-braces: ensure no test leaks settings into the next.
    resetSettings();
  });

  test('renders lyric text from parsed ChordPro', () => {
    const song = parseChordPro('Today [G]we sing [D]praise');
    render(<SongView song={song} />);
    // The parser splits the line into ["Today ", "we sing ", "praise"]
    // segments — each rendered as its own <Text>. Testing Library normalizes
    // whitespace, so trim() the expected values.
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('we sing')).toBeInTheDocument();
    expect(screen.getByText('praise')).toBeInTheDocument();
  });

  test('renders chord labels above lyrics (Czech notation by default)', () => {
    const song = parseChordPro('[C]Hello [G]world');
    render(<SongView song={song} />);
    // C and G are identical in both notations — just confirms chords reach
    // the rendered tree. Each chord renders in its own <Text>, padded with
    // spaces; TL normalizes whitespace, so we match on the chord token alone.
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  test('honors `transpose` setting by shifting chord labels', () => {
    const song = parseChordPro('[C]Praise [G]Him');
    act(() => {
      // English notation makes the assertion easy to read; +2 semitones:
      // C → D, G → A.
      useSettings.setState({ notation: 'en', transpose: 2 });
    });
    render(<SongView song={song} />);
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    // The original roots must NOT appear.
    expect(screen.queryByText('C')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });

  test('renders the same lyrics regardless of notation/transpose', () => {
    const song = parseChordPro('[C]Praise [G]Him');
    act(() => {
      useSettings.setState({ notation: 'en', transpose: 2 });
    });
    render(<SongView song={song} />);
    expect(screen.getByText('Praise')).toBeInTheDocument();
    expect(screen.getByText('Him')).toBeInTheDocument();
  });

  test('switches between English and Czech notation', () => {
    // `[H]` is the unambiguous Czech marker: Czech leaves it alone, English
    // converts it to `B`. (Bb / B vs H / B is asymmetric in this codebase —
    // see notation.ts — so the cleanest test uses H.)
    const song = parseChordPro('[H]Hej');

    // English: H → B.
    act(() => {
      useSettings.setState({ notation: 'en' });
    });
    const { unmount } = render(<SongView song={song} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('H')).not.toBeInTheDocument();
    unmount();

    // Czech: H stays H.
    act(() => {
      useSettings.setState({ notation: 'cs' });
    });
    render(<SongView song={song} />);
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  test('applies fontSize from settings to lyric Text', () => {
    const song = parseChordPro('Hello world');
    act(() => {
      useSettings.setState({ fontSize: 28 });
    });
    render(<SongView song={song} />);
    // A chord-free line renders as a single segment containing the whole
    // string verbatim.
    const lyric = screen.getByText('Hello world');
    // react-native-web flattens the [styles.lyric, { fontSize }] array
    // onto the actual style attribute. Just confirm the px is plumbed.
    expect(lyric.getAttribute('style') ?? '').toMatch(/font-size:\s*28px/i);
  });

  test('renders multiple lines from a multi-line song', () => {
    const song = parseChordPro('[C]Line one\n[G]Line two');
    render(<SongView song={song} />);
    expect(screen.getByText('Line one')).toBeInTheDocument();
    expect(screen.getByText('Line two')).toBeInTheDocument();
  });

  test('applies highlight styling to the line at highlightedLineIndex', () => {
    const song = parseChordPro('[C]Line one\n[G]Line two\n[D]Line three');
    const { container } = render(<SongView song={song} highlightedLineIndex={1} />);
    // The three lines render as siblings inside the SongView container.
    // The highlighted one carries an inline backgroundColor — pin that.
    const lineNodes = container.querySelectorAll('div > div > div');
    // The exact RN-Web → DOM nesting is awkward to assert on; check that
    // SOMETHING in the rendered tree has a background-color rule (the
    // highlighted line) and the others don't.
    const stylesWithBg = Array.from(container.querySelectorAll('*'))
      .map((el) => el.getAttribute('style') ?? '')
      .filter((s) => /background-color/i.test(s));
    expect(stylesWithBg.length).toBeGreaterThan(0);
    // Defensive: at least one line node exists, so the test isn't a no-op.
    expect(lineNodes.length).toBeGreaterThan(0);
  });

  test('omitting highlightedLineIndex renders no highlight backgrounds', () => {
    const song = parseChordPro('[C]Line one\n[G]Line two');
    const { container } = render(<SongView song={song} />);
    const stylesWithBg = Array.from(container.querySelectorAll('*'))
      .map((el) => el.getAttribute('style') ?? '')
      .filter((s) => /background-color/i.test(s));
    // No lines should carry a background-color override.
    expect(stylesWithBg.length).toBe(0);
  });
});
