/**
 * Mirrors `schema/meta.schema.json` and `schema/index.schema.json`.
 * Keep in sync — JSON Schema is the canonical contract.
 */

export type Language = 'cs' | 'en' | 'la' | 'sk';
export type ReviewStatus = 'auto' | 'flagged' | 'approved';

export interface SongMeta {
  id: string;
  slug: string;
  title: string;
  number: number | null;
  key: string | null;
  tempo: number | null;
  language: Language;
  tags: string[];
  sourcePdf: string;
  sourcePages: number[];
  hasStaffImages: boolean;
  staveCount: number;
  reviewStatus: ReviewStatus;
}

export interface SongIndex {
  version: number;
  generatedAt: string;
  songs: SongMeta[];
}
