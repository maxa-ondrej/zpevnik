# Zpěvník App — Planning Specification

*Cross-platform Christian songbook with live auto-scroll*
*v0.1*

---

## 1. Overview

A cross-platform digital songbook ("zpěvník") for Christian songs. The source material is a PDF songbook containing full musical notation (treble staves with chord symbols above and Czech syllabified lyrics below). The app converts the PDF into a structured, searchable, transposable database and presents each song with synchronized chords, lyrics, and the original engraved staves as reference imagery.

Two product phases:

- **v1** — Browse, search, and view songs. Manual auto-scroll. Transpose, capo, font size, Czech/English chord notation toggle.
- **v2** — Live audio listening. The app hears what is being sung and auto-scrolls the currently open song to match.

---

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Platforms | iOS + Android + Web (cross-platform) |
| App stack | TypeScript, React Native, Expo, React Native Web |
| Pipeline stack | Python (pdfplumber, OpenCV, Tesseract OCR — Czech) |
| Source data | PDF songbook with full notation (mixed text-layer / scanned pages) |
| Ingestion path | Path B — extract chords + lyrics, keep notation as image |
| Storage format | ChordPro (`.cho`) per song + cropped staff PNGs + `meta.json` |
| Chord notation | Stored canonically (English); UI toggle Czech ↔ English |
| v2 audio approach | On-device Whisper + fuzzy lyric matching → auto-scroll |
| Distribution rights | Confirmed: free and open |
| Multi-PDF support | Yes — per-PDF "songbook profile" YAML |

---

## 3. Source Material Analysis

Sample page (one Czech Marian hymn, *"Ave Maria, Pán buď s Tebou"*) shows the consistent layout we are designing the pipeline around:

- One song per page (or contiguous range of pages).
- Each "song line" is a vertical stack: chord row → treble staff → syllabified lyric row.
- Chord symbols use Czech conventions (*H* = English B, *B* = English B♭), with sevenths and suffixes in superscript (*E⁷, H⁷*).
- Lyrics are hyphen-syllabified beneath note heads (*A‑ve Ma‑ri‑a*), with section markers *1.*, *2.*, *R:*.
- PDF mixes pages with selectable text and scanned pages; some pages may be inverted (white-on-black) and must be normalized.

> This structure is regular enough to parse programmatically — but the irregular edges (syllable hyphens, superscript suffixes, inverted scans, Czech diacritics) are exactly where the pipeline must be robust.

---

## 4. Architecture

Four layers, built in order:

1. **Ingestion pipeline** — offline Python tool that converts any songbook PDF into structured songs.
2. **Song database** — file-based, one folder per song, source-of-truth in ChordPro plus sidecar assets.
3. **App (v1)** — cross-platform reader, search, viewer, transpose, manual auto-scroll.
4. **App (v2)** — live audio listener that drives auto-scroll on the open song.

### 4.1 Repo layout

```
zpevnik/
├── pipeline/         # Python — PDF → ChordPro + staff PNGs
│   ├── extract/      # text vs OCR per page
│   ├── parse/        # song boundaries, chord/lyric alignment
│   ├── profiles/     # per-PDF layout profiles (YAML)
│   └── review/       # local web UI for manual correction
├── songs/            # output — one folder per song
│   └── 001-ave-maria-pan-bud-s-tebou/
│       ├── song.cho
│       ├── staves/01.png, 02.png, ...
│       └── meta.json
├── app/              # React Native + Expo + RN Web
│   ├── shared/       # components, renderer, search, state
│   ├── ios/, android/, web/
└── audio/            # v2 — Whisper-based score follower
```

---

## 5. Data Model

### 5.1 Per-song folder

- **`song.cho`** — ChordPro source of truth. Inline chord/lyric alignment, section directives (`{start_of_verse}`, `{start_of_chorus}`), metadata directives (`{title}`, `{key}`, `{tempo}`).
- **`staves/NN.png`** — cropped treble-staff images from the original PDF, one per musical line. Displayed as visual reference; not transposable.
- **`meta.json`** — structured metadata (see below). Used by search index and app UI.

### 5.2 `meta.json` shape

```json
{
  "id": "001",
  "slug": "ave-maria-pan-bud-s-tebou",
  "title": "Ave Maria, Pán buď s Tebou",
  "number": 1,
  "key": "A",
  "tempo": null,
  "language": "cs",
  "tags": ["marian", "advent"],
  "sourcePdf": "zpevnik-2019.pdf",
  "sourcePages": [12],
  "hasStaffImages": true,
  "reviewStatus": "approved"
}
```

`reviewStatus` is one of: `auto`, `flagged`, `approved`.

### 5.3 Global index

- **`index.json`** at the repo root — list of all songs with their metadata, used for fast list/search loading in the app.
- Optionally **`fulltext.json`** — normalized lyric tokens (syllables rejoined into words) for full-text search.

---

## 6. Ingestion Pipeline

Generic and PDF-agnostic. Each input PDF is paired with an optional *songbook profile* (YAML) describing layout-specific hints (numbering pattern, expected fonts, page split rules). New songbook → new profile → same pipeline.

### 6.1 Stages

1. **Normalize** — color (invert if white-on-black), resolution, deskew, denoise. Output: clean page images at uniform DPI.
2. **Page classification** — for each page, decide: text-extractable, scanned, notation-heavy. Per-page manifest.
3. **Song segmentation** — detect song boundaries via the active profile (numbered headings, page breaks, separators).
4. **Layout detection** — within each song, find the repeating triple: (chord row, staff, lyric row). Horizontal projection + staff-line detection via OpenCV.
5. **Chord extraction** — OCR the chord row, parse chord-shaped tokens and their x-positions.
6. **Lyric extraction** — OCR the lyric row with Tesseract (Czech), preserve syllable hyphenation and x-positions.
7. **Alignment** — fold chords + syllables into inline ChordPro by x-coordinate matching.
8. **Section detection** — recognize `1.`, `2.`, `R:` as verse/chorus markers; emit ChordPro directives.
9. **Title & metadata** — extract title, number, key (from staff key signature or chord context), language.
10. **Staff image export** — crop each musical line and save as `staves/NN.png`.
11. **Normalization** — canonicalize chord spellings (Czech H/B → English B/B♭ for storage), validate ChordPro syntax.
12. **Output** — write `songs/NNN-slug/` tree and update `index.json`.

### 6.2 Review tool

Non-optional. Local web UI showing the original PDF page on the left and the parsed ChordPro on the right, with inline editing and per-song approval. Tracks status (`auto` / `flagged` / `approved`). Re-running the pipeline does not overwrite approved songs.

### 6.3 Properties

- **Idempotent** — re-running on unchanged input produces unchanged output.
- **Incremental** — only reprocesses pages whose hash changed.
- **Multi-PDF** — multiple profiles can run side by side; outputs go into the same `songs/` tree with source-tagging.

---

## 7. App — v1

### 7.1 Features

- Song list with search across title, song number, and full-text lyrics (syllables rejoined).
- Song detail view: ChordPro rendering with chords above lyrics, syllable-aware spacing.
- **Transpose** ± semitones, **capo** indicator.
- **Chord notation toggle** — Czech (A, H, B, C, …) ↔ English (A, B, B♭, C, …). Stored canonically, rendered per user setting.
- **Notation toggle** — show or hide the cropped staff images alongside the ChordPro lines.
- Font size, line spacing, dark mode.
- **Manual auto-scroll** with adjustable speed (precursor to v2).
- Favorites, recents, setlists (local-only).
- Offline-first: songs bundled with the app or synced once.

### 7.2 Cross-platform delivery

Single TypeScript codebase compiles to iOS (App Store), Android (Play Store), and Web (static deploy). Shared components live in `app/shared/`; platform shells handle navigation, file system, and audio permissions.

---

## 8. App — v2 (Live Auto-scroll)

Scope: auto-scroll the *currently open* song based on what the microphone hears. No song identification — the user has already chosen the song.

### 8.1 Approach

1. Request microphone permission.
2. Stream audio in a rolling window (≈ 4–6 seconds).
3. Run on-device Whisper (whisper.cpp / Core ML / NNAPI builds) to transcribe the window.
4. Fuzzy-match the transcript against the open song's lyric tokens to locate the current position.
5. Smooth-scroll the song view to that position; show a confidence indicator. Fall back to manual scroll on low confidence or silence.

### 8.2 Why this rather than score following

- Robust to live conditions (congregational singing, reverberation, piano or guitar accompaniment).
- Works without a clean reference recording.
- Uses lyrics — which we already have as structured data — as the anchor.
- On-device, offline, no server cost or privacy concerns.

---

## 9. Phased Roadmap

| Phase | Scope |
|---|---|
| **Phase 0 — Foundations** | Monorepo, stack lock-in, profile schema, this spec. |
| **Phase 1 — Pipeline prototype** | End-to-end conversion of 5–10 sample songs. Build the review UI. Measure auto-clean rate and dominant error patterns. |
| **Phase 2 — Full conversion** | Run pipeline on the complete songbook. Manual review pass through every song. Lock the v1 song database. |
| **Phase 3 — App v1** | Cross-platform reader: list, search, viewer, transpose, manual scroll, settings, offline. |
| **Phase 4 — App v2** | Microphone, streaming Whisper, lyric alignment, live auto-scroll. |
| **Phase 5 — Distribution** | App Store, Play Store, web deploy. Update channel for the song database so corrections ship without an app release. |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OCR misreads Czech diacritics or syllable hyphens | Tesseract Czech language pack; review UI to catch the residue; full-text search uses normalized rejoined words. |
| Chord row vs. lyric row misalignment by x-position | Use exact OCR bounding boxes, not just text; tolerance window calibrated per profile; visual diff in review UI. |
| Superscript suffixes (E⁷, H⁷) read as separate tokens | Post-process: small-glyph tokens immediately right of a chord token are treated as suffix. |
| Some pages span multi-page songs | Profile-driven continuation rules; song segmentation operates on the whole PDF, not per page. |
| Whisper transcript drifts on instrumental sections | Confidence threshold; on low confidence the scroll pauses rather than jumping to a wrong position. |
| New songbook PDFs have different layouts | Profile system — pipeline stays generic; only the profile changes. |
| App store review for microphone use | Clear in-app explanation; permission requested only when entering live mode; no audio ever leaves the device. |

---

## 11. Open Questions (for later)

- Review UI implementation — local Next.js page vs. Streamlit. Decide at the start of Phase 1.
- Hosting for the song database update channel — static CDN (e.g. GitHub Pages, Cloudflare R2) vs. a thin API.
- User accounts & sync for setlists — start local-only, revisit after v1 feedback.
- Will users be able to import their own PDFs in-app, or is this a single-songbook reader? Affects onboarding and profile authoring UX.

---

## 12. Definition of Done — v1

- Full songbook converted, every song has `reviewStatus = approved`.
- App available on TestFlight, Play Console internal track, and a public web URL.
- Search returns expected results across at least 95% of songs given a two-word query.
- Transpose and chord notation toggle work for every song without exception.
- Songs render correctly offline after first load.
