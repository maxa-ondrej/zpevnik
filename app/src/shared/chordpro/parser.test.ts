import { describe, expect, test } from 'vitest';

import { parseChordPro } from './parser';

describe('parseChordPro', () => {
  test('captures {title:} and {key:} as meta', () => {
    const song = parseChordPro('{title: Salve Regina}\n{key: A}\n');
    expect(song.meta.title).toBe('Salve Regina');
    expect(song.meta.key).toBe('A');
  });

  test('splits inline chords with the text that follows', () => {
    const song = parseChordPro('Today [G]we sing [D]praise');
    expect(song.lines[0]?.segments).toEqual([
      { chord: null, text: 'Today ' },
      { chord: 'G', text: 'we sing ' },
      { chord: 'D', text: 'praise' },
    ]);
  });

  test('leading chord with no preceding text still produces a segment', () => {
    const song = parseChordPro('[C]hello');
    expect(song.lines[0]?.segments).toEqual([{ chord: 'C', text: 'hello' }]);
  });

  test('trailing chord with no following text still produces a segment', () => {
    const song = parseChordPro('end [G]');
    expect(song.lines[0]?.segments).toEqual([
      { chord: null, text: 'end ' },
      { chord: 'G', text: '' },
    ]);
  });

  test('section directives toggle subsequent line.section', () => {
    const song = parseChordPro(
      '{start_of_verse}\nfirst\n{end_of_verse}\n{start_of_chorus}\nchorus line\n{end_of_chorus}\n',
    );
    expect(song.lines[0]?.section).toBe('verse');
    expect(song.lines[1]?.section).toBe('chorus');
  });

  test('blank lines become empty segments rows', () => {
    const song = parseChordPro('one\n\ntwo');
    expect(song.lines.map((l) => l.segments.length)).toEqual([1, 0, 1]);
  });

  test('directive aliases sov/eov/soc/eoc work', () => {
    const song = parseChordPro('{sov}\nverse\n{eov}\n{soc}\nchorus\n{eoc}\n');
    expect(song.lines[0]?.section).toBe('verse');
    expect(song.lines[1]?.section).toBe('chorus');
  });
});
