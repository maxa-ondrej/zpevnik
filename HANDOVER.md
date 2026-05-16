# Session Handover — 2026-05-16 (night)

## Summary

Brought the **Zpěvník** reader app from "empty placeholder shell" to a
working end-to-end product, then stood up the manual-review server, then
got the whole pipeline through `ruff` + `mypy --strict` cleanly and added
the first batch of frontend unit tests. The previous session ended with
the pipeline complete (109 tests, no UI). This session ended with: the
Expo Router web app loading real songs / staves / settings, a vanilla
HTML/JS reviewer at `/`, **119 pipeline tests + 28 app tests, all green**,
and clean lint. Nine commits on `main`. Still no real source PDF (gates
most remaining stages — see Next Steps).

## What Was Worked On & What Got Done

Tracked as TaskList items #1–#18, all completed:

| # | Task | Status |
|---|------|--------|
| 1 | Generate sample songs via pipeline (3-song synthetic Czech PDF) | ✅ |
| 2 | Serve songs from app as static assets (symlink approach) | ✅ |
| 3 | Wire song list screen to `index.json` (loading/error/empty states) | ✅ |
| 4 | Wire song detail screen to real `song.cho` (via slug lookup) | ✅ |
| 5 | Verify end-to-end in browser (Playwright via webapp-testing skill) | ✅ |
| 6 | Add `staveCount` field across schema / pydantic / TS types | ✅ |
| 7 | Expose settings on the song detail (`SongControls` component) | ✅ |
| 8 | Persist settings via localStorage on web (zustand `persist`) | ✅ |
| 9 | Filter song list with a search input (NFKD diacritic fold) | ✅ |
| 10 | Set dynamic header title on song detail (`Stack.Screen`) | ✅ |
| 11 | Install FastAPI review extras into venv | ✅ |
| 12 | Implement review API endpoints | ✅ |
| 13 | Add a CLI command to launch the server | ✅ (already existed) |
| 14 | Cover server with pytest tests (10 new) | ✅ |
| 15 | Tiny HTML/JS frontend for review (`review/static/`) | ✅ |
| 16 | Run ruff + mypy and fix what surfaces | ✅ |
| 17 | Persist settings on native via AsyncStorage | ✅ |
| 18 | Add app-side unit tests for core modules (28 new) | ✅ |

Nine commits this session (in order, on top of `c8174ee`):

```
1f13e2b App: unit tests for parser, transpose, notation, fold
c05760a App: persist settings on native via AsyncStorage
ff01ccd Pipeline: pass ruff + mypy --strict cleanly
1c584f4 Review server: API + reviewer UI + tests
5890533 Housekeeping: accept expo-cli gitignore drift, untrack expo-env.d.ts
0dfcf4e Refresh HANDOVER for the stages-0..12 + app-wired sessions
1862e56 App: search, settings persistence, dynamic header title
0105080 App: expose notation/transpose/font/staves controls on song page
f772da9 App: load real songs from /songs/, surface stave PNGs
```

### Commit-by-commit notes

- **`f772da9` — App loads real songs**
  - `app/app/index.tsx` fetches `/songs/index.json`; `app/app/song/[id].tsx`
    looks up the song's slug via the index, then fetches `song.cho` and
    parses with the existing `parseChordPro`.
  - `app/public/songs` is a symlink to `../../songs` so Metro's static
    handler serves the generated tree at `/songs/...`.
  - `staveCount: int = Field(ge=0)` added to `SongMeta` (schema, pydantic,
    TS). CLI populates from `len(stave_crops)`. Means the app can render
    staves with one round-trip per asset instead of 404-probing.

- **`0105080` — settings controls**
  - New `app/src/shared/components/SongControls.tsx`: notation Cs/En
    toggle, transpose ±, font A−/A+, staves on/off. Hits the existing
    zustand store; `SongView` re-renders automatically.
  - Detail screen now gates the staves block on `showStaves`.

- **`1862e56` — search + persistence + header**
  - List: diacritic-folded substring search with `matches()` from
    `app/src/shared/search/fold.ts` (`NFKD` + `\p{M}+/gu` strip). Live
    `filtered/total` count chip.
  - `useSettings` wrapped in `persist` middleware. Web localStorage;
    native silently no-ops (this commit only).
  - `<Stack.Screen options={{ title: '<n>. <title>' }} />` on the detail
    screen sets the browser tab + on-page chrome.

- **`0dfcf4e` / `5890533` — housekeeping**
  - Brought HANDOVER.md up to date for the pipeline-complete state.
  - Accepted expo-cli's auto-edit of `app/.gitignore` (the
    `# @generated expo-cli sync-...` block that ignores `expo-env.d.ts`).
  - `git rm --cached app/expo-env.d.ts` — file says so itself.
  - Added `/songs/_*.json` to root `.gitignore` (intermediates).

- **`1c584f4` — Review server**
  - `pipeline/zpevnik_pipeline/review/server.py` is no longer a stub:
    - `GET  /api/songs` → refreshed index (re-reads every `meta.json`)
    - `GET  /api/songs/{id}` → `SongDetail` (meta + chordpro + staveUrls)
    - `PUT  /api/songs/{id}` → partial update; auto-promotes
      `auto → flagged` when `reviewStatus` is omitted; calls
      `write_song(force=True)` so the human can keep editing approved songs.
    - `/songs/` static mount and `/` HTML reviewer
  - `pipeline/zpevnik_pipeline/review/static/{index.html, style.css, app.js}`:
    vanilla HTML/JS reviewer. Sidebar list with status badges + search;
    detail editor with title/number/key/tempo/chordpro/status, stave PNGs
    above the form, save button. **Two bugs found and fixed during
    Playwright verification** — see "What Worked / Didn't".
  - 10 new tests in `pipeline/tests/test_review_server.py` (httpx
    `TestClient`).

- **`ff01ccd` — ruff + mypy --strict clean**
  - 22 ruff errors → 0. Per-file ignore for `B008` on `cli.py` (typer's
    `Option(...)`/`Argument(...)` in defaults is idiomatic). `datetime.UTC`
    instead of `datetime.timezone.utc`. Specific exception classes in
    `pytest.raises`. `zip(strict=True)`. SIM108 ternaries in
    `extract/normalize.py`.
  - 10 mypy errors → 0. Mypy override for `fitz` and `pytesseract`
    (`ignore_missing_imports = true`). `cast(ImageU8, ...)` wrappers around
    cv2 calls (cv2 stubs return generic `ndarray`). `npt.NDArray[Any]`.
    Typed `_write_segments` and `_ocr_token_payload`. Switched
    `typer.Exit(str)` to `console.print(...) + Exit(code=1)`.
  - One genuine test bug uncovered: `pytest.raises(FileNotFoundError)` in
    `test_rasterize_missing_pdf_raises` did **not** match — PyMuPDF defines
    its own `fitz.FileNotFoundError` that doesn't subclass the built-in.
    Fix: import `fitz` and raise on `fitz.FileNotFoundError`.

- **`c05760a` — AsyncStorage on native**
  - Added `@react-native-async-storage/async-storage` via `expo install`.
  - `app/src/shared/store/settings.ts` now picks storage by
    `Platform.OS === 'web'` → localStorage; everything else → AsyncStorage.
    Same JSON shape on both.

- **`1f13e2b` — app tests**
  - Added vitest. New `npm test` / `npm run test:watch` scripts.
  - 28 tests, ~220 ms total: `parser.test.ts`, `transpose.test.ts`,
    `notation.test.ts`, `fold.test.ts`.

## What Worked and What Didn't

### Worked
- **Symlink for static asset serving.** `app/public/songs → ../../songs`
  is dead-simple and Metro follows it without complaints. Means there's
  one source of truth — edit a song via the reviewer at port 8765 and the
  reader at port 8081 sees the change on next request.
- **`staveCount` instead of probing.** Before adding the field, the app
  HEAD-probed `01..40.png` to find the actual count → ~36 noisy 404s per
  song. Now one round-trip per real asset. Required schema + pydantic +
  CLI + TS sync, no migration pain because the synthetic songs were
  regenerated.
- **zustand `persist` with a `Platform.OS` switch** is the cleanest
  cross-platform persistence pattern I've seen — same store API, same
  JSON shape, one swap point.
- **`webapp-testing` skill + Playwright in the pipeline venv.** Used
  Playwright 4 times: list → detail flow, controls toggles, search +
  persistence, reviewer save flow. Pixel screenshots delivered to the
  user via `SendUserFile` made the visual confirmation feel concrete.
- **vitest auto-config.** No `vitest.config.ts` needed — it picked up
  `tsconfig.json`'s `strict` + paths and ran TS source files directly.
- **FastAPI's `TestClient` + the existing `write_song`/`write_index`
  helpers.** Test setup was just `_seed(songs_dir, [(meta, chordpro)])`
  — no fixtures, no mocks, no globals. The test file is 142 lines and
  covers 10 cases.

### Didn't work the first time

1. **Saved-message flash got eaten by re-render.** First version of the
   reviewer `onSave` did `status.textContent = 'Saved.'` then called
   `renderDetail()`, which replaced the form (including the status span).
   Fix: re-grab `document.getElementById('save-status')` *after* the
   re-render and write into the new node.

2. **`auto → flagged` promotion never fired in the UI.** Form always sent
   `reviewStatus: form.reviewStatus.value`. When the user edited a song
   without touching the dropdown, the value was `'auto'`, the server saw
   `update.reviewStatus is not None`, and the promotion didn't run. Fix
   in `app.js`: only send `reviewStatus` if it differs from
   `currentDetail.meta.reviewStatus`. That way the server's promotion
   logic fires when the user implicitly leaves status alone.

3. **`pytest.raises(FileNotFoundError)` didn't catch PyMuPDF's error**
   (see ff01ccd notes above). Lesson: when a library raises an
   exception named the same as a builtin but in its own namespace, it
   probably *doesn't* subclass the builtin. Always check `__bases__`
   before assuming.

4. **Misdirected `npm install --save-dev vitest` ran outside `app/`.**
   The shell was in `pipeline/` from a previous `cd ... && ...`. npm
   walked up looking for a `package.json`, found none, and created a
   fresh one at the repo root along with `node_modules/` and
   `package-lock.json` there. **Caught before staging.** Removed
   manually before commit. Next time: explicit `cd app && ...` even
   if it looks like the shell already lives there.

### Failed approach that I reverted
- **Initially considered stripping `expo-env.d.ts` change instead of
  untracking the file.** Wrong — expo *will* keep regenerating that file
  with its "should be in your git ignore" comment. The right fix is to
  honor expo-cli's request: accept the auto-edit to `app/.gitignore` and
  `git rm --cached` the file.

## Key Decisions Made and Why

1. **Symlink the songs tree into `app/public/`, don't bundle.**
   Bundling per-song assets at build time would mean `expo export` has
   to know the song corpus, which means CI has to either commit the
   corpus or run the pipeline. Symlinking keeps the reader app a thin
   web view over whatever `songs/` currently contains, which matches
   the workflow: pipeline writes → reviewer edits → reader reads.

2. **`staveCount` is required, not optional.**
   Could have been `int | None` to keep backward compat with the
   pre-staveCount metas, but there's no real corpus yet, so a hard
   migration was cheap. Making it required forces every future writer
   (incl. the reviewer's `write_song`) to fill it in.

3. **Reviewer `PUT` always uses `write_song(force=True)`.**
   The approved-sticky rule exists to protect humans from the pipeline,
   not from themselves. If a human explicitly clicks Save in the
   reviewer, they own that edit. Without `force=True`, a human couldn't
   re-edit a song they'd previously marked approved.

4. **`auto → flagged` auto-promotion when `reviewStatus` is omitted.**
   `auto` means "pipeline output, untouched by a human". The moment a
   human edits anything but doesn't pick a status, the song is *not*
   auto anymore — it's been touched. So omitting `reviewStatus` in the
   PUT body means "leave it implicit, let the server decide" → `flagged`.
   Sending an explicit value (incl. `'auto'`) means the human really
   does want that value.

5. **Vanilla HTML/JS for the reviewer, not React.**
   The reviewer is a power-user-only desktop tool. No mobile support
   needed, no auth, no styling system needed. A single static HTML page
   served by FastAPI's `StaticFiles` keeps the entire reviewer < 350
   lines (HTML + CSS + JS combined). No build step, no bundler, no
   dependency on the Expo app's frontend stack.

6. **`Platform.OS === 'web'` switch over a feature-detection guard.**
   `typeof localStorage` would also work, but the explicit `Platform`
   check matches how every Expo example handles cross-platform branches,
   and it's clearer that the intent is "different code paths per
   platform" vs. "library happens to support both".

7. **Per-file ignore for ruff's `B008` on cli.py.**
   Typer's idiomatic API is `arg: T = typer.Option(...)` — exactly the
   pattern `B008` flags. The modern alternative,
   `Annotated[T, typer.Option(...)]`, would be a 360-line refactor with
   no behavior change. Ignoring `B008` on `cli.py` is the cheapest
   correct answer.

8. **HANDOVER.md is updated in its own commit (`0dfcf4e`), not as part
   of the work it documents.**
   Otherwise docs and code lag each other and lying-about-yourself docs
   become normal. Each session ends with a documentation pass that's
   honest about what landed.

## Lessons Learned & Gotchas

- **PyMuPDF custom exceptions.** `fitz.FileNotFoundError`,
  `fitz.EmptyFileError`, etc. are siblings of the built-ins, not
  subclasses. Always import and use the `fitz.*` version when testing.
- **cv2 type stubs return generic `ndarray`, not the dtype-parameterized
  one.** Every call site that wants `ImageU8` needs `cast(ImageU8, ...)`.
  Pattern is consistent across `normalize.py`. Don't bother with `# type:
  ignore` — the cast is more honest.
- **zustand persist needs a `partialize` if the store has functions on
  it.** Without it, the setters serialize to JSON as `null` and the
  rehydrated store crashes on the first call. Listed each persisted
  field explicitly in `partialize`.
- **Metro serves `app/public/*` at root URL.** This is the Expo SDK 50+
  static-assets behavior — wasn't obvious, but is documented under
  "Static Files" in the Expo Router docs.
- **Don't run `npm install` without first verifying cwd.** See the
  misdirected install above. If you see a stray `package.json` at the
  repo root, that's why.
- **`Image.getSize` not needed when aspect ratio is roughly constant.**
  Stave crops are always ~2480 × ~200 → `aspectRatio: 12` in the
  StyleSheet is within a couple pixels of correct.
- **Pipeline `songs_dir` defaults to `Path("../songs")`** in both `run`
  and `review` commands, which works when invoked from `pipeline/`. From
  the repo root use `--songs ./songs`. Annoying but consistent.
- **Tesseract diacritic loss on synthetic Helvetica PDFs.** PyMuPDF
  substitutes `·` for `ů`/`ř` because Helvetica doesn't have them; OCR
  then reads `·`. Real songbook scans should fare much better. Song 2's
  title in the current test set (`"Hospodin je m·j pastý·"`) is a useful
  flagged-for-review reminder of how OCR can degrade.
- **The dev server hot-reloads CSS/JS changes but Expo Router can be
  flaky on type-only changes** — when in doubt, kill the metro process
  and `npm run web` again.
- **Memory file `feedback_autonomy.md` was added this session.** User
  said "just always continue, dont ask me" — saved as feedback. Don't
  end turns with "want me to continue?" choice prompts.

## Current State

**Working right now (verified by tests + Playwright):**

- **Pipeline**
  - `cd pipeline && PYTHONPATH=. .venv/bin/python -m pytest tests/` →
    **119 passed in ~3s**.
  - `.venv/bin/ruff check .` → clean.
  - `.venv/bin/mypy zpevnik_pipeline tests` → clean (40 source files).
- **Reader app**
  - `cd app && npx expo start --web` → http://localhost:8081/
  - Loads `/songs/index.json`, lists songs with search filter, opens
    detail at `/song/<id>`, renders staves + ChordPro + chord-aware
    transpose/notation.
  - Settings persist across page reload (localStorage on web,
    AsyncStorage on native).
  - `npm test` → 28 tests passing.
  - `npx tsc --noEmit` → clean.
- **Reviewer**
  - `PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs`
    → http://127.0.0.1:8765/ (default port `8765`)
  - Sidebar list with status badges + search; detail editor with
    title/number/key/tempo/chordpro/status; stave PNG strip; save
    persists + auto-promotes `auto → flagged`; reload button refetches.

**Known limitations (documented, not bugs):**

- **OCR quality on synthetic PDFs is rough.** Czech `ů`/`ř` lost on
  Helvetica; chord-row whitelist matches stray letters in lyrics like
  `isi(i`. Both will improve dramatically on real scans.
- **Renaming a song in the reviewer doesn't move the folder.** The
  `slug` field isn't editable via PUT; you'd need a slug-aware folder
  rename + `git mv`. Spec deferred this.
- **Reviewer is local-only and unauthenticated.** Fine for the intended
  workflow; would need auth + CORS if ever served remotely.
- **No SongView component tests yet** (UI rendering). Only the pure
  helper modules have unit tests. Component testing would need
  `@testing-library/react-native` + jsdom.
- **`separator` segmentation strategy still raises
  `NotImplementedError`.** Same as prior session.
- **Stage 9 (key/tempo inference) intentionally skipped.** Now also
  partially addressed by the reviewer's editable Key / Tempo fields.

**No temporary hacks in committed code.**
- `feedback_autonomy.md` is a real preference, not a workaround.
- Pipeline intermediates (`songs/_*.json`) gitignored — that's by
  design, not a hack.

## Clear Next Steps

In rough priority order:

1. **Get a real source PDF from the user.** Still the highest-value
   thing — unlocks OCR tuning, profile calibration, real corpus testing.
   Check `~/Downloads/` for any Czech `.pdf` or ask explicitly.

2. **SongView component tests.** Add `@testing-library/react-native` +
   jsdom to vitest and assert that:
   - chords render above the right lyric character;
   - chorus lines get the chorus styling;
   - transpose=2 transforms `[C]` to `[D]` in the rendered tree;
   - notation=cs renders `B` as `H`.
   - Lowest-friction approach: render `<SongView song={parseChordPro(fixture)} />`
     and assert on the resulting view tree.

3. **GitHub Actions CI.** No remote yet, but a `.github/workflows/ci.yml`
   running `ruff check`, `mypy zpevnik_pipeline tests`, `pytest`,
   `npm test`, `npx tsc --noEmit` would catch regressions the moment a
   remote is set up. Bonus: pin Tesseract install on Ubuntu runner.

4. **OCR quality tuning** against a real PDF. Candidates still as the
   prior handover described: per-token x-projection on the chord row,
   PSM 8 on per-token crops, confidence thresholding that surfaces
   weak tokens via `reviewStatus: flagged` (the reviewer can show those
   automatically now).

5. **Folder-rename support on slug change.** Add a `POST /api/songs/{id}/rename`
   that atomically renames `<id>-<old>/` → `<id>-<new>/` and rewrites
   the index. Probably needs a `tmp` move + replace dance.

6. **Reviewer enhancements that aren't blocked:**
   - Diff view between current `song.cho` and a freshly-OCRed version
     (would need a "re-OCR this song" button calling back into the
     pipeline).
   - Stave image zoom on click.
   - Keyboard shortcuts (j/k navigation, ⌘S to save).

7. **Calibrate `chordRowHeightPx` / `lyricRowHeightPx`** in the example
   profile from a real page (gated on real PDF).

8. **`separator` segmentation strategy** (gated on real PDF).

9. **Set git author identity.** `git config user.email
   "ondrej.maxa@shipmonk.com"` then optionally
   `git commit --amend --reset-author` on the most recent. Per safety
   protocol, won't do this without an explicit ask. Untouched since
   session start.

10. **Decide on `songs/` tracking.** Currently untracked; intermediates
    (`_*.json`) are gitignored, per-song dirs and `index.json` are
    eligible to be tracked. When a real PDF lands and approved songs
    start accumulating, the call gets easier.

**Dependencies / blockers:**
- Steps 1, 4, 7, 8 all need a real PDF.
- Step 3 needs a GitHub remote.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                              this file
├── README.md
├── zpevnik-spec.md
├── .gitignore                               ← added /songs/_*.json this session
│
├── schema/
│   └── meta.schema.json                     ← added staveCount this session
│
├── pipeline/
│   ├── pyproject.toml                       ← ruff per-file-ignore + mypy override
│   ├── tests/
│   │   ├── test_review_server.py            ★ NEW — 10 httpx tests
│   │   ├── test_normalize.py                ← typed via ImageU8 + cast helpers
│   │   ├── test_profile.py                  ← pytest.raises(ValidationError)
│   │   ├── test_rasterize.py                ← uses fitz.FileNotFoundError
│   │   ├── test_staves.py                   ← zip(strict=True)
│   │   └── test_writer.py                   ← _meta() typed fixture + staveCount
│   └── zpevnik_pipeline/
│       ├── cli.py                           ← types tightened; typer.Exit(code=1)
│       ├── models.py                        ← SongMeta.staveCount: int = Field(ge=0)
│       ├── extract/
│       │   ├── normalize.py                 ← cast(ImageU8, ...) on cv2 returns
│       │   └── hashing.py                   ← npt.NDArray[Any]
│       ├── output/
│       │   └── writer.py                    ← used unchanged by reviewer
│       └── review/
│           ├── __init__.py
│           ├── server.py                    ★ rewritten — full API
│           └── static/                      ★ NEW
│               ├── index.html
│               ├── style.css
│               └── app.js
│
├── app/
│   ├── package.json                         ← adds AsyncStorage, vitest, scripts
│   ├── public/
│   │   └── songs                            ★ NEW symlink → ../../songs
│   ├── app/
│   │   ├── _layout.tsx                      ← unchanged
│   │   ├── index.tsx                        ← search-enabled real-data list
│   │   └── song/[id].tsx                    ← real-data detail + controls + staves + header
│   └── src/shared/
│       ├── components/
│       │   ├── SongControls.tsx             ★ NEW — settings bar
│       │   └── SongView.tsx                 ← unchanged
│       ├── chordpro/
│       │   ├── parser.ts                    + parser.test.ts ★ NEW
│       │   ├── transpose.ts                 + transpose.test.ts ★ NEW
│       │   └── notation.ts                  + notation.test.ts ★ NEW
│       ├── search/
│       │   ├── fold.ts                      ★ NEW
│       │   └── fold.test.ts                 ★ NEW
│       ├── store/
│       │   └── settings.ts                  ← zustand persist + Platform-aware storage
│       └── types/
│           └── song.ts                      ← added staveCount: number
│
├── songs/                                   untracked; populated by zpevnik run
└── audio/                                   empty
```

★ = high-leverage files for the next session.

**Git status (end of session):** clean working tree on `main` except
`songs/` (untracked, intentional). 15 commits total, no remote.

**Memory updates:**
- `~/.claude/projects/.../memory/feedback_autonomy.md` ★ NEW — user
  asked me not to end turns with "want me to continue?" prompts.
- `MEMORY.md` indexes the new file.

**Reproduction commands** (next session can run these as-is):

```bash
# Pipeline tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 119 passed; ruff clean; mypy clean

# App tests + types
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test
npx tsc --noEmit
# expect: 28 passed; tsc clean

# Reader app
cd /Users/ondrej.maxa/Projects/zpevnik/app
npx expo start --web --port 8081
# → http://localhost:8081/

# Reviewer
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/

# Regenerate synthetic songs (3-song Czech PDF at /tmp/zpev-multi.pdf)
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli \
  run /tmp/zpev-multi.pdf \
  --profile pipeline/profiles/zpevnik-2019.yaml \
  --songs ./songs --force
```
