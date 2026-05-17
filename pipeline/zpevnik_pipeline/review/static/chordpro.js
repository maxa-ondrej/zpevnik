/**
 * Minimal ChordPro parser — plain-JS port of app/src/shared/chordpro/parser.ts.
 *
 * Stays minimal: directives + inline chords, no tabs/grids/custom chord defs.
 * Keep in sync with parser.ts if either grows new features.
 */

const DIRECTIVE_RE = /^\{([^:}]+)(?::\s*(.*?))?\}$/;
const INLINE_CHORD_RE = /\[([^\]]+)\]/g;

export function parseChordPro(source) {
  const meta = {};
  const lines = [];
  let section = 'none';

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      lines.push({ segments: [], section });
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const name = directive[1];
      const value = directive[2];
      const key = name.trim().toLowerCase();
      switch (key) {
        case 'start_of_verse':
        case 'sov':
          section = 'verse';
          break;
        case 'end_of_verse':
        case 'eov':
          section = 'none';
          break;
        case 'start_of_chorus':
        case 'soc':
          section = 'chorus';
          break;
        case 'end_of_chorus':
        case 'eoc':
          section = 'none';
          break;
        case 'start_of_bridge':
          section = 'bridge';
          break;
        case 'end_of_bridge':
          section = 'none';
          break;
        case 'comment':
        case 'c':
          break;
        default:
          if (value !== undefined) meta[key] = value.trim();
      }
      continue;
    }

    lines.push({ segments: splitInlineChords(rawLine), section });
  }
  return { meta, lines };
}

function splitInlineChords(line) {
  const out = [];
  let lastIndex = 0;
  let pendingChord = null;
  for (const match of line.matchAll(INLINE_CHORD_RE)) {
    const idx = match.index ?? 0;
    const text = line.slice(lastIndex, idx);
    if (text.length > 0 || pendingChord !== null) {
      out.push({ chord: pendingChord, text });
    }
    pendingChord = match[1] ?? null;
    lastIndex = idx + match[0].length;
  }
  const tail = line.slice(lastIndex);
  if (tail.length > 0 || pendingChord !== null) {
    out.push({ chord: pendingChord, text: tail });
  }
  return out;
}
