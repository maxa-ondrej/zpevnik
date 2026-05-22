/**
 * Compose a final ABC string from a structured melody sidecar.
 *
 * melody.json shape:
 *   - header   : ABC header (X, T, M, L, K, …) shared by every block
 *   - blocks[] : ordered list of { type, body } — each body is an ABC
 *                fragment (notes + w: lyric lines). Order matches the
 *                song.cho structure, so chorus position is explicit.
 *
 * No implicit interleaving — what you list is what you get.
 */

export type BlockType = 'verse' | 'chorus' | 'bridge';

export type Syllabic = 'begin' | 'middle' | 'end' | 'single';

/**
 * A single melody note. `pitch` is a MIDI number (60 = C4) for pitched
 * notes; `null` indicates a rest. `durationBeats` is in quarter-note
 * units (matches the ABC `L:1/4` default). `lyric` is the syllable
 * (already stripped of verse-number markers in the pipeline).
 *
 * Chord-tone notes (simultaneous polyphony) are NOT included — the
 * pipeline emits only the lead-voice melody.
 */
export interface MelodyNote {
  pitch: number | null;
  durationBeats: number;
  lyric: string | null;
  syllabic: Syllabic | null;
  chord: string | null;
}

export interface Block {
  type: BlockType;
  body: string;
  /** Per-note array — drives the karaoke pitch-bar timeline. Older
   *  melody.json files without this field still parse; consumers
   *  fall back to the ABC `body` for the staves view. */
  notes?: MelodyNote[];
}

export interface Melody {
  header: string;
  blocks: Block[];
}

export function assembleAbc(melody: Melody): string {
  return [melody.header.trim(), ...melody.blocks.map((b) => b.body.trim())].join('\n');
}
