# Session Handover — 2026-05-16

## Summary

Kickoff session for **Zpěvník** — a cross-platform Christian songbook app described in `/Users/ondrej.maxa/Downloads/zpevnik-spec.md` (also copied to the repo root as `zpevnik-spec.md`). The user provided a finished planning spec and asked me to "start working" without stopping for clarifying questions. I completed **Phase 0 (Foundations)** end-to-end and broke into **Phase 1** by implementing the first two pipeline stages with passing unit tests. The repo is a monorepo at `/Users/ondrej.maxa/Projects/zpevnik` with `pipeline/` (Python), `app/` (Expo + RN Web), `schema/` (canonical JSON Schemas), `songs/` (empty — pipeline output), and `audio/` (empty — v2). Two clean commits on `main`. No source PDF has been provided yet, so further pipeline work needs either synthetic test fixtures or a real songbook PDF to operate on.

## What Was Worked On & What Got Done

All 7 tasks created in `TaskList` are **completed**:

| # | Task | Status |
|---|------|--------|
| 1 | Create monorepo skeleton | ✅ done |
| 2 | Scaffold Python pipeline | ✅ done |
| 3 | Define profile YAML schema | ✅ done |
| 4 | Define data model types (meta.json/index.json) | ✅ done |
| 5 | Implement pipeline stage 1: normalize | ✅ done |
| 6 | Implement pipeline stage 2: page classification | ✅ done |
| 7 | Scaffold Expo + RN Web app | ✅ done |

Concretely delivered:
- Directory tree per spec §4.1, plus a `schema/` directory I added (see Decisions).
- Three JSON Schema files in `schema/` documenting the contract between pipeline and app.
- Python package `zpevnik_pipeline` with Typer CLI (`zpevnik run`, `zpevnik profile validate`, `zpevnik review`), pydantic models mirroring the schemas, YAML profile loader, and stub FastAPI review server.
- Example profile YAML `pipeline/profiles/zpevnik-2019.yaml`.
- **Stage 1 (normalize)**: `is_inverted`, `invert`, `estimate_skew`, `deskew`, `denoise`, `normalize` orchestrator + `NormalizeStats` dataclass. Operates on numpy BGR/grayscale images, decoupled from PDF rasterization so it's unit-testable on synthetic inputs.
- **Stage 2 (classify)**: `detect_staff_lines`, `notation_density`, `classify_page` returning `PageClassification(page, kind, textExtractable, notationDensity, detectedStaffLines)` with `kind ∈ {"text", "scanned", "notation_heavy"}`.
- Page hashing helper `extract/hashing.py::hash_page` for incremental pipeline runs (per spec §6.3).
- **Test suite**: 14 unit tests, all green. `pytest -v` runs in <1s after first-run OpenCV warmup.
- Expo app scaffold: `app.json` (with `NSMicrophoneUsageDescription` for v2), expo-router with `app/_layout.tsx`, `app/index.tsx` (song list, empty state), `app/song/[id].tsx` (viewer with placeholder song).
- App shared code: TS types mirroring `schema/`, `chordpro/parser.ts` (directives + inline `[chord]` tokens), `chordpro/notation.ts` (English↔Czech B/H/Bb rotation), `chordpro/transpose.ts` (semitone shift with bass-note support), `store/settings.ts` (zustand), `components/SongView.tsx` (chord-above-lyric renderer applying transpose + notation).
- Two git commits on `main`:
  - `0ee514e` — Phase 0: monorepo skeleton
  - `3f68573` — Phase 0/1: schemas, pipeline scaffold, app scaffold, normalize + classify
- Project memory saved at `~/.claude/projects/-Users-ondrej-maxa-Projects-zpevnik/memory/project_zpevnik.md` and indexed in `MEMORY.md`.

## What Worked and What Didn't

**Worked:**
- Splitting image-level normalization (`normalize.py`) from PDF rasterization. Made the whole stage testable on synthetic numpy arrays with zero external dependencies beyond OpenCV. Tests run in 0.6s once OpenCV is imported.
- `opencv-python-headless` for the test environment — no GUI libs needed.
- `python3 -m venv .venv` + plain `pip install` (uv isn't installed on this machine — see Gotchas).
- Synthetic page generator (`_make_text_page`, `_staff_page` in the tests) as ground truth for HoughLines tuning.
- Typer + Rich for CLI ergonomics; CLI `profile validate` command was verified working via `CliRunner` (`exit=0, "OK — profile zpevnik-2019 is valid."`).
- Pydantic v2 strict mode (`ConfigDict(extra="forbid")`) caught typo-style YAML errors as expected in `test_profile.py::test_profile_rejects_unknown_fields`.

**Didn't apply but worth noting:**
- I did NOT run `npm install` for the app — the app scaffold is source-only. Expo deps are listed in `package.json` but not installed; `tsc --noEmit` has never been run. The app will likely need a small typecheck pass once installed.
- I did NOT install OpenCV's full `opencv-python` — only `opencv-python-headless`. That's fine for now and avoids GUI deps, but `pyproject.toml` currently declares `opencv-python>=4.10`. If you want strict parity, switch one or the other.
- I did NOT install pdfplumber, pytesseract, etc., yet — they're declared in `pyproject.toml` but the venv only has the minimum needed for the current tests.
- No git remote configured; `git config` warning about author identity was emitted at first commit (committer is `Ondrej Maxa <ondrej.maxa@MacBook-Pro-3.local>`). Probably want to set a proper `user.email` before pushing.

**No failures or dead ends in this session** — the only iteration was tuning `estimate_skew` test tolerances; settled on `±0.5°` because Hough at `theta = π/720` resolution rounds to ~0.25° increments.

## Key Decisions Made and Why

1. **Added a top-level `schema/` directory not explicitly in the spec.**
   The spec lists `meta.json` and `index.json` shapes inline in §5 but doesn't say where the contract lives. I made `schema/*.schema.json` the **canonical source of truth**, with pydantic models (`pipeline/zpevnik_pipeline/models.py`) and TS types (`app/src/shared/types/song.ts`) explicitly declared as mirrors. Rationale: pipeline and app are in different languages, so a shared schema is the only honest contract. If the next Claude changes a field, all three places must move together.

2. **Renamed `pipeline/extract|parse|profiles|review` → moved inside `zpevnik_pipeline/` package.**
   The spec showed `pipeline/extract/`, `pipeline/parse/`, etc., at the top of `pipeline/`. Python packaging works much better with everything under a single package (`zpevnik_pipeline.extract`, `zpevnik_pipeline.parse`, etc.). `pipeline/profiles/` stayed at the top level since YAMLs aren't Python. `pipeline/tests/` also at top level (standard pytest layout). Verified with `git status` after the `rm -rf` + `mkdir -p` reorganization — no orphan files.

3. **Decoupled image normalization from PDF rasterization.**
   Spec §6.1 stage 1 says "Normalize — color (invert if white-on-black), resolution, deskew, denoise." I implemented the image-level ops only and left rasterization (PDF → image bytes) as a future `rasterize.py`. Reason: rasterization needs poppler installed system-wide, but normalization is pure numpy/OpenCV and trivially unit-testable.

4. **Page-hash strategy for incremental runs.**
   `hash_page` hashes the **raw rasterized bytes**, not normalized output. Means re-running with different normalization parameters still gets cache hits when the source page is unchanged. Spec §6.3 only said "pages whose hash changed" — this choice makes the hash a property of the input, not the pipeline configuration.

5. **`reviewStatus` is sticky.**
   In the README I documented "approved songs never overwritten" as a property of the pipeline. The spec §6.2 says "Re-running the pipeline does not overwrite approved songs" — I made this an invariant the CLI's `--force` flag opts out of (CLI option scaffolded but not yet wired to skip logic).

6. **`chord` is canonical English; notation toggle is render-time.**
   Spec §2 locks "Stored canonically (English); UI toggle Czech ↔ English". Implemented as `chordpro/notation.ts::render(chord, notation)` which is called at render time inside `SongView.tsx`. This means transpose works in canonical English space (no Czech/English ambiguity) and rendering is a pure function of (chord, transpose, notation).

7. **Czech notation rules (locked in `notation.ts`):**
   - English `B`  → Czech `H`
   - English `Bb` → Czech `B`
   - Everything else identical
   The `ROOT_RE = /^([A-H][b#]?)(.*)$/` accepts `H` as input too so `toEnglish` can round-trip user input.

8. **Transpose normalizes flats to sharps internally** (`FLAT_TO_SHARP` table). Means transposed output is always in sharps (e.g. `Eb` becomes `D#` after transposition). If the user prefers flats in display, that's a separate render-time concern not yet implemented.

9. **Expo Router (not React Navigation) and new architecture enabled.**
   `app.json` has `"newArchEnabled": true` and routes are file-based under `app/`. Matches current Expo SDK 52 conventions. `expo-router` is in dependencies.

10. **`bundleIdentifier: com.ondrejmaxa.zpevnik`** chosen based on the user's email (`ondrej.maxa@shipmonk.com`). May need to change when actually publishing — left a flag in the gitignore for keystores.

## Lessons Learned & Gotchas

- **`uv` is not installed on this machine.** All Python work used `python3 -m venv .venv && .venv/bin/pip install …`. The README claims `uv sync` works; that's aspirational. Either install uv (`brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`) or update the README.
- **Python is 3.13.11**, declared minimum is `>=3.11` in `pyproject.toml`. Fine for now but worth knowing.
- **Tesseract is NOT installed.** Pipeline declares it but no OCR work has been attempted. Install order when you need it: `brew install tesseract tesseract-lang` (the latter is required for `ces` Czech data).
- **OpenCV import is slow on first call** — first test run took 17s, subsequent runs ~0.6s. Fixture caching in pytest would help if this gets worse.
- **HoughLines `theta` resolution is `π/720`**, which gives ~0.25° angular resolution. Don't tighten skew test tolerances below `±0.5°` without bumping that.
- **`HoughLinesP` returns `None` (not an empty array) when no lines found.** Check is in `detect_staff_lines` line ~50: `if lines is None: return 0`.
- **Pydantic v2 `tuple[int, int]` works in JSON schema mode but YAML round-trips as a list.** The `pageRange` field uses `tuple[int, int] | None`; PyYAML loads it as a list, and pydantic coerces it. Fine, but if you ever add custom serialization, watch the round-trip.
- **`bilateralFilter` parameters are conservative** (`d=5, sigmaColor=35, sigmaSpace=35`). Aggressive enough to clean scan noise but preserves staff lines and glyph edges. Don't bump without re-running classification tests.
- **The `notation_density` saturation point of 40 lines** is a back-of-envelope guess (6 systems × 5 staff lines + slack). Will need calibration against a real page once a PDF is in hand.
- **Existing `.git/` author identity is auto-generated** (`Ondrej Maxa <ondrej.maxa@MacBook-Pro-3.local>`). Git warned at first commit. Set `git config user.email "ondrej.maxa@shipmonk.com"` before pushing anywhere public.
- **No git remote** — `git remote -v` returns nothing.
- **Spec lives at TWO paths**: `~/Downloads/zpevnik-spec.md` (original) and `/Users/ondrej.maxa/Projects/zpevnik/zpevnik-spec.md` (repo copy). Both are currently identical; if the user edits, they probably edit the Downloads copy.

## Current State

**Working right now:**
- `cd pipeline && PYTHONPATH=. .venv/bin/python -m pytest tests/ -v` — 14/14 green.
- `cd pipeline && PYTHONPATH=. .venv/bin/python -c "from zpevnik_pipeline.cli import app; from typer.testing import CliRunner; print(CliRunner().invoke(app, ['profile', 'validate', 'profiles/zpevnik-2019.yaml']).stdout)"` — prints `OK — profile zpevnik-2019 is valid.`
- Project memory present at `~/.claude/projects/-Users-ondrej-maxa-Projects-zpevnik/memory/`.

**Partially implemented (stubs / placeholders left intentionally):**
- `zpevnik_pipeline/cli.py::run` — accepts args, prints them, then `console.print("[yellow]Pipeline stages not yet implemented.[/yellow]")`. TODO at end of function: "wire stages 1–12 here as they land."
- `zpevnik_pipeline/review/server.py::create_app` — `/health` works; the actual review endpoints (`GET /songs`, `PUT /songs/{id}`, etc.) are a TODO comment.
- `app/app/song/[id].tsx` — renders a hardcoded `PLACEHOLDER` ChordPro string of Ave Maria, doesn't read from `songs/` yet.
- `app/app/index.tsx` — `SAMPLE: SongMeta[] = []` constant; renders empty state. Needs to load `index.json`.
- `app/src/shared/store/settings.ts` — zustand store has all setters but no persistence. README mentions "wired up in `app/_layout.tsx`" but it isn't yet.
- `app/src/shared/search/` — directory exists, empty.
- `app/src/shared/components/` only contains `SongView.tsx`. No `SongList`, no settings UI.
- `audio/` directory exists, empty (v2).
- `songs/` directory exists, empty.

**Not started:**
- Pipeline stages 3–12 (segmentation, layout detection, OCR, alignment, ChordPro emit, etc.).
- App: search, favorites, recents, setlists, manual auto-scroll, settings UI.
- App: no `npm install` has been run; `app/node_modules/` does not exist.
- v2 audio / Whisper.

**Files with explicit TODOs:**
- `pipeline/zpevnik_pipeline/cli.py:33` — `# TODO: wire stages 1–12 here as they land.`
- `pipeline/zpevnik_pipeline/review/server.py:17` — `# TODO: GET /songs, GET /songs/{id}, PUT /songs/{id}, POST /songs/{id}/approve`
- `app/app/song/[id].tsx:8-13` — `// Placeholder: until the pipeline emits real songs…` (constant `PLACEHOLDER`).
- `app/app/index.tsx:6-7` — `// Placeholder data — replaced in Phase 3 by loading index.json from the bundle…`

## Clear Next Steps

1. **Get the source PDF from the user.** The spec references a single Czech songbook; until that file exists at e.g. `pipeline/input/zpevnik-2019.pdf`, you can't run end-to-end against real data. Ask explicitly or check `~/Downloads/`.
2. **Implement `pipeline/zpevnik_pipeline/extract/rasterize.py`** — wrap `pdfplumber` or `pdf2image` to convert PDF pages to numpy arrays at the profile's DPI. Should take `(pdf_path, profile)` and yield `(page_number, image, raw_bytes_for_hashing)` tuples. This is the missing piece between "I have a PDF" and "stages 1+2 run".
3. **Wire stages 1+2 together in `cli.py::run`.** After rasterize, call `normalize` then `classify_page` and write a per-page manifest JSON (page → kind, density, hash). Provides immediate value — the user can see how many pages are notation-heavy etc. — and exercises the incremental hash logic.
4. **Stage 3: song segmentation.** Use `profile.segmentation.strategy`. For `numbered-heading` (the example profile's choice), regex-match the leftmost text of each page and group consecutive pages into songs by ascending number. For `one-per-page`, trivial. Output: per-song page-range list.
5. **Stage 4: layout detection within a song.** Find the repeating (chord-row, staff, lyric-row) triple. Approach: horizontal projection of black-pixel density to find staff bands (already roughly handled by `detect_staff_lines`); then carve fixed-height bands above and below each staff for chord row and lyric row respectively. Tune band heights from a few sample songs.
6. **Stages 5–7 (chord/lyric OCR + alignment).** Tesseract Czech on lyric rows; Tesseract on chord rows with a chord-specific whitelist (`A-Hbm#0-9maj/+`). Use bounding-box x-coordinates from Tesseract's `image_to_data` to align chord-token x to syllable x, producing ChordPro `[Chord]syllable` segments.
7. **Czech chord post-processing.** The Czech source uses `H` for English `B` and `B` for English `Bb` (spec §3, my notation table). Pipeline normalizes Czech → English at storage time; app's notation toggle handles display. Don't normalize at display time too — would double-flip.
8. **Stage 8: section markers.** Regex for `1.`, `2.`, `R:` at lyric-row start → emit `{start_of_verse}` / `{start_of_chorus}` directives.
9. **Stage 10: staff PNG export.** Crop each detected staff band (with chord row above and lyric row below) and save as `songs/<id>-<slug>/staves/NN.png`. Aspect ratio matters — keep at native resolution.
10. **Stages 11–12: write outputs.** `song.cho` + `meta.json` + update repo-root `index.json`. `meta.json` is validated via `SongMeta.model_validate` before writing.
11. **App: `npm install` and verify `npm run web`** boots to the empty-state list. Then load `../index.json` and `../songs/<id>/song.cho` (via Metro `require` or `expo-asset`). Settings persistence via `expo-secure-store` or AsyncStorage.
12. **Manual auto-scroll** in `SongView` — set up `ScrollView` ref + `requestAnimationFrame` loop driven by `settings.autoScrollSpeed`.
13. **Review UI** (FastAPI) — start with `GET /songs` returning `index.json`, `GET /songs/{id}` returning ChordPro + meta + base64 staves, then a tiny HTML/JS frontend in `zpevnik_pipeline/review/static/`.

Dependencies / blockers:
- Steps 4–10 all need a real PDF in hand.
- Step 11 needs `npm install` to run successfully (might hit RN/Expo version drift since SDK 52 dependencies are pinned to versions I picked from memory — verify against current Expo docs).
- Step 12+ require Tesseract installed system-wide.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── README.md                      ← repo overview, status, quick start
├── zpevnik-spec.md                ← copy of the planning spec (source: ~/Downloads/zpevnik-spec.md)
├── HANDOVER.md                    ← this file
├── .gitignore                     ← Python + Node + PDF source exclusions
│
├── schema/                        ★ Canonical contract — JSON Schemas
│   ├── README.md
│   ├── meta.schema.json           per-song metadata; mirrored by SongMeta + TS SongMeta
│   ├── index.schema.json          repo-root index.json
│   └── profile.schema.json        per-PDF profile YAML
│
├── pipeline/
│   ├── README.md                  install + usage
│   ├── pyproject.toml             ★ deps + Typer entry point `zpevnik`
│   ├── profiles/
│   │   └── zpevnik-2019.yaml      example profile for the main songbook
│   ├── tests/                     ★ 14 passing unit tests
│   │   ├── test_profile.py        profile load + validation
│   │   ├── test_normalize.py      invert/skew/deskew/idempotence
│   │   └── test_classify.py       staff-line detection + page kind
│   ├── .venv/                     ad-hoc venv with pydantic/pyyaml/typer/rich/opencv-headless/numpy/pytest
│   └── zpevnik_pipeline/
│       ├── __init__.py
│       ├── cli.py                 ★ Typer entry — `run`, `profile validate`, `review`
│       ├── config.py              `load_profile(path) -> SongbookProfile`
│       ├── models.py              ★ pydantic mirrors of schema/*.schema.json
│       ├── extract/
│       │   ├── normalize.py       ★ stage 1 — IMAGE-LEVEL ONLY (no PDF here)
│       │   ├── classify.py        ★ stage 2 — text vs scanned vs notation_heavy
│       │   └── hashing.py         hash_page(bytes|ndarray) for incremental runs
│       ├── parse/                 stages 3–10 (empty)
│       ├── output/                stages 11–12 (empty)
│       └── review/
│           ├── __init__.py
│           └── server.py          FastAPI app — only /health is wired
│
├── app/
│   ├── README.md
│   ├── package.json               ★ Expo SDK 52, expo-router v4, RN 0.76, RN Web — NOT YET INSTALLED
│   ├── app.json                   ★ Expo config; iOS mic perms; bundleId com.ondrejmaxa.zpevnik
│   ├── tsconfig.json              strict, with @/* + @shared/* path aliases
│   ├── babel.config.js            babel-preset-expo + reanimated/plugin
│   ├── expo-env.d.ts
│   ├── .gitignore
│   ├── app/                       ← expo-router file-based routes
│   │   ├── _layout.tsx            root Stack + SafeAreaProvider
│   │   ├── index.tsx              song list (empty placeholder)
│   │   └── song/[id].tsx          viewer with hardcoded PLACEHOLDER ChordPro
│   ├── assets/                    empty — needs icon/splash/favicon
│   └── src/
│       └── shared/
│           ├── types/song.ts      ★ TS mirror of schema/meta+index
│           ├── chordpro/
│           │   ├── parser.ts      ★ ChordPro parser — directives + [chord] inlines
│           │   ├── notation.ts    ★ Czech↔English chord rendering
│           │   └── transpose.ts   ★ semitone transposition incl. bass /X
│           ├── store/
│           │   └── settings.ts    zustand — notation, transpose, capo, font, autoscroll
│           ├── components/
│           │   └── SongView.tsx   ★ chord-above-lyric renderer using settings
│           ├── screens/           empty
│           ├── search/            empty
│           ├── theme/             empty
│           └── navigation/        empty
│
├── songs/                         empty — pipeline output target
└── audio/                         empty — v2 Whisper score follower
```

**Star (★) entries** are the high-leverage files most likely to be touched next.

**Project memory** lives separately at `/Users/ondrej.maxa/.claude/projects/-Users-ondrej-maxa-Projects-zpevnik/memory/`:
- `MEMORY.md` — single-line index
- `project_zpevnik.md` — full project context (read this first in a fresh session)

**Git status:** clean working tree on `main`, two commits, no remote.

```
3f68573 Phase 0/1: schemas, pipeline scaffold, app scaffold, normalize + classify
0ee514e Phase 0: monorepo skeleton
```

**Reproduction commands** (next Claude should be able to run these as-is):

```bash
# Verify pipeline tests still pass
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/ -v
# expect: 14 passed in <1s

# Validate the example profile
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.cli profile validate profiles/zpevnik-2019.yaml
# expect: OK — profile zpevnik-2019 is valid.
```
