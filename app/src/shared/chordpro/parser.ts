/**
 * Minimal ChordPro parser — enough to render a song with inline chords.
 *
 * Supported syntax (v0):
 *   - Directives:           {title: …}, {key: …}, {tempo: …},
 *                           {start_of_verse}…{end_of_verse},
 *                           {start_of_chorus}…{end_of_chorus},
 *                           {comment: …}
 *   - Inline chords:        Today [G]we sing [D]praise
 *   - Blank lines separate stanzas.
 *
 * Out of scope for v0: tabs, grids, custom chord definitions.
 */

export type Section = 'verse' | 'chorus' | 'bridge' | 'none';

export interface ChordSegment {
  chord: string | null;
  text: string;
}

export interface SongLine {
  segments: ChordSegment[];
  section: Section;
}

export interface ParsedSong {
  meta: Record<string, string>;
  lines: SongLine[];
}

const DIRECTIVE_RE = /^\{([^:}]+)(?::\s*(.*?))?\}$/;
const INLINE_CHORD_RE = /\[([^\]]+)\]/g;

export function parseChordPro(source: string): ParsedSong {
  const meta: Record<string, string> = {};
  const lines: SongLine[] = [];
  let section: Section = 'none';

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      lines.push({ segments: [], section });
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const [, name, value] = directive as [string, string, string | undefined];
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
          // future: surface as a styled annotation
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

function splitInlineChords(line: string): ChordSegment[] {
  const out: ChordSegment[] = [];
  let lastIndex = 0;
  let pendingChord: string | null = null;
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
