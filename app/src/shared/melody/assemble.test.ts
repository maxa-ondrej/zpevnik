import { describe, expect, test } from 'vitest';

import { assembleAbc, type Block, type Melody } from './assemble';

const HEADER = 'X:1\nK:C';
const V = (n: number): Block => ({ type: 'verse', body: `V${n}` });
const C: Block = { type: 'chorus', body: 'CHORUS' };

function build(blocks: Block[]): Melody {
  return { header: HEADER, blocks };
}

describe('assembleAbc', () => {
  test('no blocks → header only', () => {
    expect(assembleAbc(build([]))).toBe(HEADER);
  });

  test('verses only, in order', () => {
    expect(assembleAbc(build([V(1), V(2), V(3)]))).toBe(
      [HEADER, 'V1', 'V2', 'V3'].join('\n'),
    );
  });

  test('chorus between verses (V C V)', () => {
    expect(assembleAbc(build([V(1), C, V(2)]))).toBe(
      [HEADER, 'V1', 'CHORUS', 'V2'].join('\n'),
    );
  });

  test('trailing chorus (V V C)', () => {
    expect(assembleAbc(build([V(1), V(2), C]))).toBe(
      [HEADER, 'V1', 'V2', 'CHORUS'].join('\n'),
    );
  });

  test('multiple choruses', () => {
    expect(assembleAbc(build([V(1), C, V(2), C, V(3)]))).toBe(
      [HEADER, 'V1', 'CHORUS', 'V2', 'CHORUS', 'V3'].join('\n'),
    );
  });

  test('trims block whitespace', () => {
    const padded: Block = { type: 'verse', body: '  V1  \n' };
    expect(assembleAbc({ header: `  ${HEADER}  `, blocks: [padded] })).toBe(
      [HEADER, 'V1'].join('\n'),
    );
  });
});
