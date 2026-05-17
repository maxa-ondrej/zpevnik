/**
 * Compose a final ABC string from a structured melody sidecar.
 *
 * Plain-JS port of app/src/shared/melody/assemble.ts. Header + each block's
 * body, in the order the author wrote them. No implicit interleaving.
 */

export function assembleAbc(melody) {
  const parts = [melody.header.trim()];
  for (const block of melody.blocks) {
    parts.push(block.body.trim());
  }
  return parts.join('\n');
}
