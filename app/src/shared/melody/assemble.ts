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

export interface Block {
  type: BlockType;
  body: string;
}

export interface Melody {
  header: string;
  blocks: Block[];
}

export function assembleAbc(melody: Melody): string {
  return [melody.header.trim(), ...melody.blocks.map((b) => b.body.trim())].join('\n');
}
