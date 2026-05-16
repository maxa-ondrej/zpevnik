import { describe, expect, test } from 'vitest';

import { assembleAbc, type Melody } from './assemble';

const HEADER = 'X:1\nK:C';
const V = (n: number) => `V${n}`;
const C = 'CHORUS';

function build(verses: number, withChorus: boolean): Melody {
  return {
    header: HEADER,
    verses: Array.from({ length: verses }, (_, i) => V(i + 1)),
    ...(withChorus ? { chorus: C } : {}),
  };
}

describe('assembleAbc', () => {
  test('no chorus → verses in order', () => {
    expect(assembleAbc(build(3, false))).toBe([HEADER, 'V1', 'V2', 'V3'].join('\n'));
  });

  test('1 verse + chorus → V1, C (trailing for short songs)', () => {
    expect(assembleAbc(build(1, true))).toBe([HEADER, 'V1', C].join('\n'));
  });

  test('2 verses + chorus → V1, V2, C', () => {
    expect(assembleAbc(build(2, true))).toBe([HEADER, 'V1', 'V2', C].join('\n'));
  });

  test('3 verses + chorus → V1, V2, C, V3 (no trailing once >2 verses)', () => {
    expect(assembleAbc(build(3, true))).toBe([HEADER, 'V1', 'V2', C, 'V3'].join('\n'));
  });

  test('4 verses + chorus → V1, V2, C, V3, V4', () => {
    expect(assembleAbc(build(4, true))).toBe([HEADER, 'V1', 'V2', C, 'V3', 'V4'].join('\n'));
  });

  test('6 verses + chorus → V1, V2, C, V3, V4, C, V5, V6 (matches the user spec)', () => {
    expect(assembleAbc(build(6, true))).toBe(
      [HEADER, 'V1', 'V2', C, 'V3', 'V4', C, 'V5', 'V6'].join('\n'),
    );
  });

  test('0 verses → header only', () => {
    expect(assembleAbc({ header: HEADER, verses: [], chorus: C })).toBe(HEADER);
  });
});
