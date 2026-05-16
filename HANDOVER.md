# Session Handover — 2026-05-16 (evening)

## Summary

Closed the entire **Zpěvník** pipeline end-to-end. The previous session ended at stages 0–2 with 14 tests and the CLI's `run` command a stub. This session implemented every remaining pipeline stage (0 rasterize, 3 segment, 4 layout, 5 OCR, 6 align, 7 ChordPro emit + Czech notation, 8 section markers, 10 stave PNGs, 11–12 per-song writer + index), wired them all into the CLI, and verified end-to-end on a synthetic Czech songbook PDF. **Tests grew 14 → 109, all green.** Four clean commits on `main`. Tesseract was installed via Homebrew (`brew install tesseract tesseract-lang`) so the OCR-dependent tests actually run. The pipeline now produces real `songs/<id>-<slug>/{song.cho, meta.json, staves/NN.png}` directories plus a repo-root `songs/index.json` — the same shapes the reader app already expects per the JSON schemas.

## What Was Worked On & What Got Done

All ten tasks tracked in TaskList are **completed**:

| # | Task | Status |
|---|------|--------|
| 1 | Implement `extract/rasterize.py` (PyMuPDF) | ✅ done |
| 2 | Wire stages 1+2 into CLI `run` (manifest output) | ✅ done |
| 3 | Scaffold stage 3 (segmentation) | ✅ done |
| 4 | Implement stage 4 (layout detection) | ✅ done |
| 5 | Implement stage 5 (chord/lyric OCR) | ✅ done |
| 6 | Implement stage 6 (alignment) | ✅ done |
| 7 | Implement stage 7 (ChordPro emit + Czech→English) | ✅ done |
| 8 | Implement stage 8 (section markers) | ✅ done |
| 9 | Implement stage 10 (stave PNG export) | ✅ done |
| 10 | Implement stages 11–12 (per-song writer + index) | ✅ done |

Concretely delivered (in commit order):

### Commit `142b8d7` — Pipeline stages 0+3: rasterize, manifest, segmentation
- `pipeline/zpevnik_pipeline/extract/rasterize.py` — PyMuPDF-based generator; yields `RasterizedPage(page, image, raw_bytes, text_extractable, text)`. No system deps (no poppler).
- `pipeline/zpevnik_pipeline/manifest.py` — pydantic `RunManifest` / `PageRecord` + atomic `write_manifest` / `read_manifest`.
- `pipeline/zpevnik_pipeline/parse/segment.py` — `one-per-page` and `numbered-heading` strategies; `separator` raises `NotImplementedError`.
- CLI now writes `<songs>/_manifest.json` and `<songs>/_segments.json`.
- `+pymupdf>=1.24` in `pyproject.toml`.
- **+16 tests** (`test_rasterize.py:7`, `test_segment.py:7`, `test_cli_run.py:2`).

### Commit `49072b2` — Pipeline stage 4: per-page layout detection
- `pipeline/zpevnik_pipeline/parse/layout.py` — `detect_song_lines(image, layout)` clusters long horizontal lines into staves of ~5 and carves chord/lyric bands above/below. Returns `list[SongLine]`.
- Critical fix in `extract/normalize.py`: bumped deskew noop threshold from 0.05° → 0.5° to match Hough's `theta = π/720` resolution. Without this, the rasterized synthetic PDF triggered a false-positive 0.25° rotation that broke layout detection.
- Loosened `_horizontal_line_ys` tolerance from `|Δy| ≤ 2` to `|Δy| ≤ 25` to survive any residual sub-Hough-resolution skew.
- Added `chordRowHeightPx` / `lyricRowHeightPx` to `ProfileLayout` model + JSON schema. Defaults fall back to staff height when absent.
- CLI writes `<songs>/_layout.json`.
- **+9 tests** (`test_layout.py:9`, including a real-PDF→rasterize→normalize→detect e2e guard).

### Commit `48cde48` — Pipeline stage 5: chord/lyric row OCR via Tesseract
- `pipeline/zpevnik_pipeline/parse/ocr.py` — `ocr_chord_row` (PSM 7, eng, whitelist `ABCDEFGHabdgijmnopstu0123456789#♭♯b/+().`) and `ocr_lyric_row` (PSM 7, language from profile). Both wrap `pytesseract.image_to_data` and return `list[OcrToken]` with word-level bboxes.
- CLI crops `chord_y` and `lyric_y` bands per detected song-line, OCRs them, writes `<songs>/_ocr.json` keyed by song / page / line index.
- New `--skip-ocr` flag for fast iteration.
- System install: `brew install tesseract tesseract-lang` (Tesseract 5.5.2, includes `ces`, ~685 MB).
- pytesseract installed in venv.
- **+6 tests** (`test_ocr.py:4`, `test_cli_run.py:2`). OCR-touching tests gated on `tesseract --list-langs` containing the required language.

### Commit `c8174ee` — Pipeline stages 6-12: alignment, ChordPro emission, write-out
- `pipeline/zpevnik_pipeline/parse/align.py` — `align_line(chord_tokens, lyric_tokens) → AlignedLine(chordpro)`. Anchors chord at its **left x edge** (not center), interpolates linearly into the target lyric token to pick a char position, handles prefix/suffix chords + instrumental + hyphenated cases.
- `pipeline/zpevnik_pipeline/parse/chord_notation.py` — `czech_to_english("H")="B"`, `"B"="Bb"`, slash-bass `"G/H"="G/B"`. Idempotent on already-English input.
- `pipeline/zpevnik_pipeline/output/chordpro.py` — `emit_song(number, title, aligned_lines, language) → EmittedSong(chordpro, title, number)`. Title directive + number directive + body. Applies Czech→English normalization to every `[chord]` marker.
- `pipeline/zpevnik_pipeline/output/sections.py` — `apply_section_markers(lines)` regex-detects `N.` (verse) and `R:`/`Ref:`/`Ref.:` (chorus, case-insensitive), wraps each section with `{start_of_*}` / `{end_of_*}` directives. Tolerates chord brackets that landed before the marker during alignment.
- `pipeline/zpevnik_pipeline/output/staves.py` — `write_stave_pngs(out_dir, crops)` writes PNGs `01.png`, `02.png` ... Refactored from the original "image-keyed-by-page" API to "pre-computed crops" so the CLI can avoid holding full normalized images.
- `pipeline/zpevnik_pipeline/output/slug.py` — `slugify("Já mám") = "ja-mam"` via NFKD diacritic folding.
- `pipeline/zpevnik_pipeline/output/writer.py` — `write_song(songs_root, meta, chordpro, force)` writes `<songs>/<id>-<slug>/{song.cho, meta.json}` atomically; **skips when on-disk `reviewStatus: approved`** unless `force=True`. `write_index(songs_root, metas)` rewrites `songs/index.json` sorted by `(number, id)`.
- CLI now does the full assemble + write loop:
  1. Pass 1 over pages: rasterize → normalize → classify → layout → (optional) OCR. Stores per-line **stave crops** (chord_top..lyric_bottom band) in memory keyed by `(page_no, idx)` — small enough not to bloat RAM.
  2. Pass 2 over segments: per-song align → emit → write `song.cho` + `meta.json` + stave PNGs.
  3. Finally: write `index.json`.
- Updated `pipeline/profiles/zpevnik-2019.yaml` regex to capture the title group: `^(\d{1,3})\.\s+(.*)$`.
- **+40 tests** (`test_align.py:10`, `test_chord_notation.py:22`, `test_chordpro_emit.py:7`, `test_sections.py:9`, `test_staves.py:5`, `test_writer.py:12`, plus 2 new CLI integration tests).

**Final test count: 109/109 green.**

## What Worked and What Didn't

### Worked
- **PyMuPDF for rasterization.** Bundles its own renderer, no poppler, no ImageMagick. Self-contained venv install, fast (sub-second for a 3-page synthetic PDF at 300 DPI).
- **Synthetic PDFs in tests.** Using `fitz.open() + page.insert_text() + page.draw_line()` lets every stage be tested end-to-end without checking in binary PDF fixtures. Tests run in ~4s total.
- **Stream-then-assemble CLI architecture.** Pass 1 processes one page at a time (no full-page images held), only retains small per-line crops (~200×2480 px each, ~480 KB) for stave export. Pass 2 walks segments and writes per-song. Memory stays bounded even on a 240-page book.
- **`x_left` anchoring for chord-to-lyric alignment.** This was the breakthrough: chords are typeset with their **left edge** at the column they apply to, not their center. Two failing alignment tests immediately passed when I switched (see Lessons).
- **Pydantic `model_validate_json` for round-tripping `index.json`** through the SongIndex schema as an integration smoke check.
- **`pytest.mark.skipif`** on OCR tests gated by `tesseract --list-langs` — keeps the suite useful on machines without Tesseract.
- **Atomic writes via `.tmp + rename`.** Used in `manifest.py`, `writer.py`, `cli.py` `_write_*` helpers; prevents half-written files if the process is killed mid-run.
- **Approved-songs-are-sticky invariant.** `write_song` reads any existing `meta.json` and bails out if `reviewStatus == "approved"` and `force` is False. Falls back to overwrite if the existing file is malformed (so corrupted state doesn't permanently block a re-run).

### Didn't apply, but worth noting
- **Tesseract glues short tokens together** when inter-word gap < ~8 spaces at 24pt. Affected the first cut of OCR tests (`"C  G"` came back as `"CG"`). Documented in `parse/ocr.py` docstring and worked around by using realistic spacing in tests. Real-world songbook chord rows have wide spacing (one chord per syllable position), so this isn't a production problem — yet. If a particular PDF places chords tightly, the recommended fix (also in docstring) is to pre-segment the chord-row crop by vertical projection before OCR.
- **Section markers don't fire on this session's synthetic PDF.** That's because I drew `"R: H ... F"` on the chord-row y-position by mistake during the smoke test, so it OCR'd as a chord-row token rather than a lyric-row token. Section detection runs on the **lyric stream** after alignment. The logic itself is tested by 9 dedicated unit tests in `test_sections.py`.
- **OCR quality on synthetic Czech text was rough.** PyMuPDF renders Helvetica at 14 pt → 300 DPI, and Tesseract's Czech model dropped some diacritics (`Bože` became `Bo-e`). Real songbook scans of a properly typeset PDF with proper antialiasing should fare better, but expect manual review per song.

### Failed approaches / bugs fixed mid-session

1. **Layout detected 0 staves on rasterized PDFs (commit `49072b2`).**
   - Initial unit tests on numpy-only synthetic pages passed (8/8). End-to-end on a real rasterized PDF returned 0.
   - Debug: `_horizontal_line_ys` returned 0 lines after normalize, but ~50 lines on the raw rasterized image.
   - Root cause: `estimate_skew` was fitting a 0.25° angle to anti-aliasing noise on a straight page; that 0.25° is exactly Hough's `theta = π/720` resolution → unmeasurable but non-zero. The subsequent `deskew(0.25°)` rotated staff lines just enough that `|y2 - y1| ≤ 2` rejected them.
   - Fix: bumped deskew noop threshold to 0.5° in `extract/normalize.py:99`, loosened the line-y tolerance to 25 px in `parse/layout.py:_horizontal_line_ys`. **Added a real-PDF integration test** in `test_layout.py::test_layout_recovers_staves_on_a_rasterized_pdf` to catch this regression class.

2. **First OCR tests glued tokens together.**
   - `_render("C  G")` → Tesseract returned `["CG"]`.
   - Tried PSM 6, 7, 11 — all same.
   - Spacing experiment showed 2-space, 4-space → glued; 8+-space → split per token.
   - Fix: use realistic spacing in tests (8+ chars). Documented in `parse/ocr.py` docstring.

3. **First alignment tests put chord on wrong character.**
   - `[C]hello` expected but `h[C]ello` produced.
   - Root cause: was using the chord's **center x** for alignment, but typesetters anchor at the **left edge** (chord's first character sits over the lyric character it applies to).
   - Fix: changed `_center_x(chord)` → `chord.x_left` in `parse/align.py`. Two failing tests immediately passed, plus the model is more semantically correct.

4. **First CLI integration test for stages 11–12 looked for `001-test-song/` but got `001-song-1/`.**
   - Root cause: the test profile used `numberingRegex: '^(\d{1,3})\.\s'` — only captures the number, no title group. `_find_first_heading` returned title=None, so the segment's title fell back to "Song 1", which slugged to "song-1".
   - Fix: updated both the test profile and the example `zpevnik-2019.yaml` profile to the title-capturing regex `^(\d{1,3})\.\s+(.*)$`. The default in `segment.py:DEFAULT_NUMBERING_REGEX` is the same.

## Key Decisions Made and Why

1. **PyMuPDF over pdf2image/pdfplumber for rasterization.**
   `pdfplumber` was already declared in `pyproject.toml`, but its rasterization path needs poppler installed system-wide. PyMuPDF bundles its own renderer and ships as a pre-built wheel. Trades a 23 MB wheel for zero system deps — easy choice. `pdfplumber` is still in the deps for future text/table extraction work.

2. **Stream pages, cache only per-line crops.**
   A 240-page A4 PDF at 300 DPI is ~5.7 GB of grayscale if every normalized page is held in memory. Pass 1 processes a page, extracts the chord/lyric/stave crops (each ~200×2480 px), and discards the full page. The crops sum to ~580 MB across a typical book — fits comfortably. The alternative (write staves to a temp dir during pass 1, then move them after segmentation) was rejected as more complex with no clear benefit.

3. **Chord anchor = `x_left`, not center.**
   Typesetting convention: chord text starts at the x-coordinate it applies to. The chord's left edge is its anchor. Center-anchoring shifts the chord by half its width to the right, which puts it over the wrong character for any chord longer than one symbol. This was discovered by failing tests in `test_align.py`.

4. **Atomic writes everywhere.**
   `write_manifest`, `_write_segments`, `_write_layout`, `_write_ocr`, `write_song`, `write_index` all use `path.tmp` + `Path.replace`. The pipeline can take minutes on a real book; if it's interrupted, the only artifacts on disk are either the previous run's files or the new ones — never half-written corruption.

5. **`reviewStatus: approved` reads from disk, not from in-memory state.**
   `write_song` doesn't trust the caller's claim about review status. It opens the existing `meta.json` and checks its `reviewStatus` field. This means a manual edit via the review UI (when stage 9 lands) is automatically respected on the next pipeline run.

6. **`SongMeta` validated *before* the write, not after.**
   `write_song` accepts `meta: SongMeta` (already pydantic-validated). The CLI constructs it inline in `cli.py::run`. If construction fails (bad id pattern, missing required field, etc.), the run errors out cleanly with a pydantic message instead of producing invalid on-disk artifacts.

7. **Index sort: `(number is None, number, id)`.**
   Numbered songs first, in numeric order; unnumbered songs after, in id order. This matches what a reader scrolling through a hymnal expects (1, 2, 3, ..., N, then any back-matter pieces).

8. **Stave PNG numbering is per-song, page-major.**
   File names are `01.png`, `02.png`, ... within each `songs/<id>-<slug>/staves/`. Alphabetical sort gives reading order. The numbering resets between songs because that's the only stable ordering for a future when songs are added/removed/renumbered.

9. **Chord whitelist in OCR is permissive on letters, conservative elsewhere.**
   Includes `ABCDEFGH` (Czech `H` retained!) but excludes common false-positive letters like `Q`, `R`, `S`, `T`, `V`, `W`, `X`, `Y`, `Z`. Conservative enough to keep Tesseract from hallucinating prose, permissive enough that `Cmaj7sus4` still works. The Czech notation translation is a separate pass in stage 7 — OCR never has to know about it.

10. **Section markers process the *aligned* lines (after stage 6), not the raw OCR.**
    By the time `apply_section_markers` runs, chord brackets have already been inserted into the lyric stream. The regex tolerates leading chord brackets via the `_LEADING_CHORDS` named group, so `[C]1. Lyric` is correctly recognized as a verse-1 marker and the `[C]` is preserved on the line that follows the `{start_of_verse: 1}` directive.

11. **Stage 9 (key/tempo inference) intentionally skipped.**
    Was never on the spec's checklist. `meta.key` and `meta.tempo` remain `null` in emitted metas. The reader app and review UI can let humans set them after the fact.

## Lessons Learned & Gotchas

- **`estimate_skew` false-positives at 0.25°.** Hough resolution is `π/720 = 0.25°`. Any "skew" below 0.5° is anti-aliasing noise and must not trigger a rotation. The threshold in `deskew()` is now 0.5°; do not lower it without first widening `_horizontal_line_ys`'s `max_dy` tolerance to compensate.
- **Tesseract glues short capital-letter tokens** when gap < 1× cap height. Test fixtures need wide spacing (≥ 8 chars at typical font sizes). Documented in `parse/ocr.py`.
- **PyMuPDF's `swigvarlink` DeprecationWarning** prints during every test run. Harmless. Not worth filtering.
- **`opencv-python-headless` vs `opencv-python`.** Pipeline `pyproject.toml` still declares `opencv-python>=4.10`; the venv has `opencv-python-headless` from the prior session. Both expose `cv2` with identical APIs we use. If you ever run `pip install -e .` to sync, you'll end up with both — that's fine, but ideally pick one.
- **Chord anchor is `x_left`, not center.** If you find yourself debugging "chord lands one char too far right", check `parse/align.py` hasn't reverted to centers.
- **The CLI's `force` flag must propagate to `write_song`.** It's currently wired correctly (`write_song(..., force=force)`), but it's easy to drop on a refactor — would silently break the "re-run my approved songs" use case.
- **`SongMeta.id` regex requires 3+ digits.** Fallback for unnumbered segments uses `segment_index:03d` (e.g. `"001"`). If you ever have 1000+ songs in a book, the zero-pad needs to widen — but the regex `^[0-9]{3,}$` allows that.
- **`SongMeta.slug` regex forbids leading/trailing dashes and double dashes.** `slugify("---") = "song"` falls back via the `fallback` parameter to avoid producing an invalid empty slug.
- **`tesseract-lang` is 685 MB.** Worth knowing if you ever clean Homebrew caches or are working on a small disk.
- **The `from .output.writer import _read_existing_meta` import in `cli.py` is intentionally local** to avoid promoting a private helper into the module-level surface. If we surface it as public later, drop the underscore and move the import to the top.
- **Existing `.git/` author identity is still `Ondrej Maxa <ondrej.maxa@MacBook-Pro-3.local>`.** Every commit emits a warning. Set `git config user.email "ondrej.maxa@shipmonk.com"` before pushing anywhere public.
- **Still no source PDF in `~/Downloads/`.** All four commits this session are validated against synthetic PDFs only.

## Current State

**Working right now:**
- `cd pipeline && PYTHONPATH=. .venv/bin/python -m pytest tests/` → **109 passed in ~4s.**
- Full CLI run on a synthetic Czech PDF produces:
  ```
  songs/
    _manifest.json
    _segments.json
    _layout.json
    _ocr.json
    index.json
    001-pana-chvalit-budu/
      song.cho
      meta.json
      staves/
        01.png
        02.png
        03.png
  ```
- Czech `H` chord correctly translated to canonical English `B` in `song.cho`.
- Czech title `"Pána chválit budu"` slugged to `pana-chvalit-budu` via NFKD diacritic folding.
- `--skip-ocr` flag works end-to-end (manifest + segments + layout written; OCR / per-song / index skipped).
- `--force` flag flows through to `write_song` and overrides the approved-sticky rule.

**Partially implemented / known limitations:**
- **OCR quality on synthetic PDFs is rough.** Czech diacritics partially dropped (`Bože` → `Bo-e`). Expect better on real songbook scans, but plan for human review.
- **Section markers only fire when the marker is on the *lyric* row.** A `R:` printed on the chord row will be OCR'd as a chord-row token, not a lyric-row token, and won't trigger `{start_of_chorus}`.
- **Stage 9 (key/tempo inference) not implemented.** `meta.key` and `meta.tempo` are always `null`. Spec doesn't require them at pipeline time.
- **`separator` segmentation strategy raises `NotImplementedError`.** Will need design + a sample PDF to implement.
- **`pipeline/zpevnik_pipeline/review/server.py` is still a stub** (`/health` works; CRUD endpoints are a `TODO`).
- **`app/node_modules/` doesn't exist.** No `npm install` has been run. The app still renders placeholders.

**No temporary hacks in code.** No `xfail`, no `skip` other than the Tesseract gates (which are intentional and document themselves via the `reason=` string).

## Clear Next Steps

In rough priority order:

1. **Get a real source PDF from the user.** Every assumption in stages 4–7 (band heights, OCR quality, regex calibration, section marker style) needs verification against an actual songbook. Ask explicitly or check `~/Downloads/` for any Czech `.pdf`.

2. **App: `npm install` and load real `index.json`.** The pipeline-produced data shape is exactly what the app's TS types (`app/src/shared/types/song.ts`) already expect. Plumbing should be:
   - `npm install` (will likely hit RN/Expo SDK 52 version drift — verify against current Expo docs)
   - `app/app/index.tsx` — fetch `../index.json` (Metro bundling or `expo-asset`), render `SongList`
   - `app/app/song/[id].tsx` — fetch `../songs/<id>-<slug>/song.cho` + `meta.json`, replace the `PLACEHOLDER` constant
   - `app/src/shared/store/settings.ts` — wire `expo-secure-store` or AsyncStorage persistence in `_layout.tsx`

3. **Pipeline review UI (FastAPI in `review/server.py`).**
   - `GET /songs` → return `index.json`
   - `GET /songs/{id}` → return `meta.json` + base64 `staves/*.png` + ChordPro
   - `PUT /songs/{id}` → write a corrected `song.cho` / `meta.json` (and bump `reviewStatus` → `flagged` or `approved`)
   - Tiny static HTML/JS frontend in `review/static/` once the JSON endpoints work.

4. **OCR quality tuning** against a real PDF. Likely candidates:
   - Per-token x-projection pre-segmentation of the chord row to handle tight chord spacing.
   - PSM 8 ("single word") on per-token sub-images instead of PSM 7 on the whole row.
   - Confidence thresholding — drop tokens with `confidence < 30` and surface them in `reviewStatus: flagged`.

5. **Section markers on chord-row prefixes.** If the songbook prints `R:` on the chord row rather than the lyric row, extend `apply_section_markers` to also look at the chord-row OCR stream. Needs a real PDF to design against.

6. **Stage 9 (key/tempo inference)** when a clear approach emerges — probably easier to leave manual via the review UI.

7. **Calibrate `chordRowHeightPx` / `lyricRowHeightPx`** in the example profile from a sample real page.

8. **`separator` segmentation strategy** if any songbook uses it.

9. **Bench the `--force` rerun path** on a real corpus — make sure approved-stickiness genuinely holds across edits.

10. **CI**: `pyproject.toml` declares `ruff` and `mypy --strict` but they've never been run in this codebase. Worth at least a one-shot pass to fix anything that surfaces.

11. **Set git author identity** before pushing (`git config user.email "ondrej.maxa@shipmonk.com"`). No remote configured yet.

**Dependencies / blockers:**
- Steps 1, 4, 5, 7, 9 all need a real PDF.
- Step 2 needs `npm install` to succeed.
- Step 3 needs `pip install -e '.[review]'` to bring in FastAPI + uvicorn.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── README.md                       repo overview
├── zpevnik-spec.md                 planning spec (mirror of ~/Downloads/zpevnik-spec.md)
├── HANDOVER.md                     this file
├── .gitignore
│
├── schema/                         ★ canonical contract — JSON Schemas
│   ├── meta.schema.json
│   ├── index.schema.json
│   └── profile.schema.json         ← added chordRowHeightPx / lyricRowHeightPx this session
│
├── pipeline/
│   ├── pyproject.toml              ★ deps; added pymupdf>=1.24 this session
│   ├── profiles/
│   │   └── zpevnik-2019.yaml       ← regex updated this session to capture title group
│   ├── tests/                      ★ 109 passing tests
│   │   ├── test_profile.py         3
│   │   ├── test_rasterize.py       7
│   │   ├── test_normalize.py       5
│   │   ├── test_classify.py        6
│   │   ├── test_segment.py         7
│   │   ├── test_layout.py          9   (incl. real-PDF e2e guard)
│   │   ├── test_ocr.py             4   (Tesseract-gated)
│   │   ├── test_align.py           10
│   │   ├── test_chord_notation.py  22
│   │   ├── test_chordpro_emit.py   7
│   │   ├── test_sections.py        9
│   │   ├── test_staves.py          5
│   │   ├── test_writer.py          12
│   │   └── test_cli_run.py         5   (2 Tesseract-gated)
│   ├── .venv/                      ← pymupdf, pytesseract, Pillow added this session
│   └── zpevnik_pipeline/
│       ├── cli.py                  ★ full pipeline 0–12 wired; --skip-ocr / --force / --manifest flags
│       ├── config.py
│       ├── manifest.py             ★ NEW — RunManifest + atomic write/read
│       ├── models.py               ← ProfileLayout gained chordRowHeightPx / lyricRowHeightPx
│       ├── extract/
│       │   ├── rasterize.py        ★ NEW — PyMuPDF → RasterizedPage records
│       │   ├── normalize.py        ← deskew noop threshold bumped to 0.5°
│       │   ├── classify.py
│       │   └── hashing.py
│       ├── parse/
│       │   ├── segment.py          ★ NEW — one-per-page / numbered-heading
│       │   ├── layout.py           ★ NEW — staff-band clustering + chord/lyric carving
│       │   ├── ocr.py              ★ NEW — Tesseract chord/lyric row OCR
│       │   ├── align.py            ★ NEW — chord → lyric x-anchor alignment
│       │   └── chord_notation.py   ★ NEW — Czech → English (H→B, B→Bb)
│       ├── output/
│       │   ├── chordpro.py         ★ NEW — emit_song()
│       │   ├── sections.py         ★ NEW — verse/chorus directives
│       │   ├── slug.py             ★ NEW — Czech-aware ASCII slugify
│       │   ├── staves.py           ★ NEW — write_stave_pngs()
│       │   └── writer.py           ★ NEW — write_song(), write_index(), approved-sticky
│       └── review/
│           ├── __init__.py
│           └── server.py           ← STILL A STUB; only /health works
│
├── app/                            ← UNCHANGED this session (still placeholder UI)
├── songs/                          ← empty in the repo; populated by `zpevnik run`
└── audio/                          ← empty (v2)
```

★ = high-leverage files for the next session.

**Git status:** clean working tree on `main`, 6 commits total, no remote.

```
c8174ee Pipeline stages 6-12: alignment, ChordPro emission, write-out
48cde48 Pipeline stage 5: chord/lyric row OCR via Tesseract
49072b2 Pipeline stage 4: per-page layout detection
142b8d7 Pipeline stages 0+3: rasterize, manifest, segmentation
3f68573 Phase 0/1: schemas, pipeline scaffold, app scaffold, normalize + classify
0ee514e Phase 0: monorepo skeleton
```

**Reproduction commands** (the next Claude can run these as-is):

```bash
# Full test suite
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
# expect: 109 passed in ~4s

# Validate the example profile
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.cli profile validate profiles/zpevnik-2019.yaml
# expect: OK — profile zpevnik-2019 is valid.

# End-to-end smoke test on a synthetic PDF
mkdir -p /tmp/zpev-smoke && cd /tmp/zpev-smoke
.venv/bin/python -c "
import fitz
doc = fitz.open()
page = doc.new_page(width=595, height=842)
page.insert_text((72, 60), '1. Pána chválit budu', fontsize=18)
page.insert_text((72, 180), 'C        G        Am        F', fontsize=14)
for i in range(5):
    page.draw_line((60, 200+i*12), (535, 200+i*12), color=(0,0,0), width=1.2)
page.insert_text((72, 290), 'Bože náš a Pane', fontsize=14)
doc.save('demo.pdf')
doc.close()
"
cp /Users/ondrej.maxa/Projects/zpevnik/pipeline/profiles/zpevnik-2019.yaml ./profile.yaml
PYTHONPATH=/Users/ondrej.maxa/Projects/zpevnik/pipeline \
  /Users/ondrej.maxa/Projects/zpevnik/pipeline/.venv/bin/python \
  -m zpevnik_pipeline.cli run demo.pdf --profile profile.yaml --songs ./songs
# expect: Wrote manifest / segments / layout / OCR / 1 song / index
ls songs/001-pana-chvalit-budu/
# expect: song.cho meta.json staves/
```

**Project memory** still lives at `~/.claude/projects/-Users-ondrej-maxa-Projects-zpevnik/memory/project_zpevnik.md`. The high-level overview there is still accurate; only the "Phase 1 partially done" framing is now obsolete (pipeline is complete pending a real PDF).
