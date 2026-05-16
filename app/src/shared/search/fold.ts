/**
 * Diacritic-folded case-insensitive substring match.
 * "pana" matches "Pána", "hospodin" matches "Hospodin".
 */

export function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function matches(haystack: string, needle: string): boolean {
  const n = fold(needle).trim();
  if (n.length === 0) return true;
  return fold(haystack).includes(n);
}
