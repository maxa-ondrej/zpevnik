# Session Handover — 2026-05-17

## Summary

Cleared seven of the nine "Clear Next Steps" from the previous handover in
one push: GitHub Actions CI, native WebView for notation, reviewer
melody.json editor + abcjs preview, component tests, autoscroll, and git
author identity. Then two post-launch follow-ups: migrated the `melody.json`
schema from `{verses[], chorus?}` + an interleave rule to an **explicit
ordered `blocks[]`** (the rule disagreed with `song.cho` — chorus was
ending up trailing instead of between V1 and V2), and wired the Staves
toggle into a clean either/or with the text-only `SongView` (notation when
on, text when off). Eight commits on `main`, all pushed to
`origin/main`. Tests: pipeline 134 (was 119), app 46 (was 35).

## What Was Worked On & What Got Done

Tasks #1–#9 from the previous handover (`f5d37e9 HANDOVER.md`):

| #  | Task                                       | Status                       |
|----|--------------------------------------------|------------------------------|
| 1  | Real source PDF                            | ⏳ Blocked on user input     |
| 2  | Pipeline → melody.json emission            | ⏳ Blocked on #1             |
| 3  | Reviewer: ABC editor                       | ✅ `4334de9` + `b680b8e`     |
| 4  | Component tests (SongView, AbcView)        | ✅ `71d749a`                 |
| 5  | Native WebView for notation                | ✅ `f0ec706`                 |
| 6  | GitHub Actions CI                          | ✅ `fba1354`                 |
| 7  | Reviewer: in-page notation preview         | ✅ `b680b8e` (bundled w/ #3) |
| 8  | Autoscroll                                 | ✅ `72a1430`                 |
| 9  | Git author identity                        | ✅ `ondrej.maxa11@gmail.com` |

Plus two post-launch follow-ups driven by user feedback:

| #   | Task                                                       | Status        |
|-----|------------------------------------------------------------|---------------|
| 10  | Melody schema: drop interleave rule, explicit `blocks[]`   | ✅ `1cacbc5`  |
| 11  | Staves toggle hides text-only `SongView` when on           | ✅ `ee75d1d`  |

Eight commits this session, all on `main`, all pushed:

```
ee75d1d App: hide text-only lyrics when staves toggle is on
1cacbc5 Melody: explicit block ordering instead of implicit chorus interleave
71d749a App: component tests for SongView and AbcView
72a1430 App: autoscroll loop with play/pause + speed stepper
b680b8e Reviewer: melody editor + in-page abcjs preview
4334de9 Reviewer: melody.json GET/PUT endpoints
f0ec706 Notation: WebView wrapper for iOS/Android
fba1354 CI: GitHub Actions workflow for pipeline + app
```

### Commit-by-commit notes

- **`fba1354` — CI workflow.** Two jobs on `ubuntu-latest`, in parallel:
  - `pipeline` — Python 3.11 (from `pipeline/pyproject.toml`
    `requires-python = ">=3.11"`), pip cache, `pip install -e ".[dev]"`,
    then `ruff check .`, `mypy zpevnik_pipeline tests`, `PYTHONPATH=.
    pytest tests/`.
  - `app` — Node 20, npm cache keyed on `app/package-lock.json`,
    `npm ci`, `npm test`, `npx tsc --noEmit`.
  - Triggers: `push` (all branches) + `pull_request`. Workflow file
    quotes `"on:"` to defuse YAML 1.1 boolean coercion.

- **`f0ec706` — WebView wrapper for iOS/Android.** `AbcView.tsx` was
  previously a `Platform.OS !== 'web'` no-op. Now:
  - **Web** (`Platform.OS === 'web'`): unchanged — `useEffect` →
    `abcjs.renderAbc(el, abc, { scale, visualTranspose, paddingbottom: 12,
    staffwidth: 740, lineThickness: 0.2 })`. Still no `responsive: 'resize'`
    (carried-over bug).
  - **Native**: `<WebView source={{ html }} scrollEnabled={false} />` where
    `html` is an inline string with abcjs from CDN
    (`https://cdn.jsdelivr.net/npm/abcjs@6.6.3/dist/abcjs-basic-min.js`).
    After render, the page posts
    `{ kind: 'size', height: document.body.scrollHeight }` via
    `window.ReactNativeWebView.postMessage`; `onMessage` parses it and
    drives the WebView's `style.height` so the staff is fully visible
    without inner-scrolling. Two posts (immediately + 80 ms later) to
    catch late layout shifts.
  - Installed `react-native-webview@13.12.5` via `npx expo install` from
    `app/`. Public API of `<AbcView abc transpose fontSize />` unchanged —
    `app/app/song/[id].tsx` doesn't need edits.

- **`4334de9` + `b680b8e` — Reviewer overhaul.** Now reviews melody as
  well as lyrics.
  - `pipeline/zpevnik_pipeline/review/server.py`:
    - `GET /api/songs/{id}/melody` → JSON body, 404 if absent (or song
      missing), 500 on malformed JSON on disk.
    - `PUT /api/songs/{id}/melody` → write `melody.json` atomically (via
      `.tmp` + `replace`), with strict validation. Same `auto → flagged`
      promotion as the song.cho PUT, via `write_song(..., force=True)`.
    - Validator after the schema migration (`_validate_melody`) enforces
      `{ header: str, blocks: list[{type ∈ {verse, chorus, bridge}, body:
      str}] }`.
  - `pipeline/zpevnik_pipeline/review/static/`:
    - `assemble.js` — plain-JS port of the app's `assembleAbc` (now just
      header + each `block.body`, in order).
    - `index.html` — pulls `abcjs@6.6.3` from jsdelivr, adds the
      notation-preview panel and a second textarea for `melody.json`.
    - `app.js` — ES module. Loads `song` + `melody` in parallel on select;
      empty stub `{header:"", blocks:[]}` when 404. Re-renders the staff
      300 ms after every keystroke (debounced). Save fires `PUT song`
      first then (only if dirty / non-stub) `PUT melody`. `renderAbc` call
      omits `responsive: 'resize'`.
    - `style.css` — two-column editor grid.

- **`72a1430` — Autoscroll.** Detail page wraps a `ScrollView` (already
  there) and now has:
  - `scrollRef` + `currentYRef` + `lastTimeRef` + `rafRef` +
    `contentHeightRef` + `layoutHeightRef` + `expectedYRef`.
  - `useEffect` keyed on `isPlaying` starts/stops a `requestAnimationFrame`
    loop. Each frame: `dt` ms × `speed / 1000` → `scrollTo({ y })`. Stops
    automatically when `y + layout >= content − 1`.
  - **Manual-scroll override**: `onScroll` compares the reported y against
    `expectedYRef` (slack 6 px). If the user dragged while playing, we
    pause and adopt the new position.
  - `speedRef` mirrors `autoScrollSpeed` so the slider doesn't restart the
    loop — speed is read every frame.
  - `SongControls` got an optional `{ isPlaying, onTogglePlay }` prop pair.
    When `onTogglePlay` is supplied, a new "Autoscroll" group renders
    (`▶`/`⏸` toggle + `− N +` stepper, step 10, clamp 0–200 px/s, drives
    `autoScrollSpeed`).
  - Default `autoScrollSpeed` bumped from `1` to `30` px/s.

- **`71d749a` — Component tests.** First rendering-level coverage in the
  app.
  - Added dev deps: `@testing-library/react@^16.3.2`,
    `@testing-library/jest-dom@^6.9.1`, `jsdom@^29.1.1`.
  - New `app/vitest.config.ts` — jsdom env (with `url:
    'http://localhost/'` so `localStorage` isn't blocked by opaque-origin),
    `resolve.alias: { /^react-native$/: 'react-native-web' }`.
  - New `app/vitest.setup.ts` — imports
    `@testing-library/jest-dom/vitest`; installs an in-memory
    `localStorage` polyfill because **vitest 4's bundled jsdom 29 ships a
    Storage stub with no `setItem`/`getItem`**, which broke zustand
    `persist`.
  - `SongView.test.tsx` — 7 cases (lyric text, chord rendering, transpose,
    English ↔ Czech notation switch, fontSize plumbing, multi-line songs).
  - `AbcView.test.tsx` — 5 cases (mocked `abcjs` + `react-native-webview`;
    asserts `renderAbc` called with the ABC, computed scale from fontSize,
    `visualTranspose`, pinned padding/staffwidth; re-render with new props
    reinvokes). Native WebView branch **not covered** —
    `react-native-webview` ships Flow-typed source that vite-node can't
    parse; mocked to a no-op so the file still imports.
  - Notable finding: `notation.ts` `toEnglish` / `toCzech` are asymmetric.
    `toEnglish('B')` returns `'Bb'` (treats input as Czech `B`). Tests
    use `H` instead of `B` for the Cs↔En switching test to avoid that.

- **`1cacbc5` — Melody schema migration** (driven by user feedback that
  song 3's chorus was rendering in the wrong place). See "Key Decisions"
  below. 9 files: `app/src/shared/melody/assemble.ts` + its test, all 3
  `songs/*/melody.json`, reviewer's `assemble.js` + `app.js` +
  `server.py`, `pipeline/tests/test_review_melody.py`.

- **`ee75d1d` — Staves toggle is now either/or.** `app/app/song/[id].tsx`:
  the SongView (text + chords) used to always render below the
  notation/staves. One-line change: `{!showStaves && <SongView … />}`.

## What Worked and What Didn't

### Worked

- **Parallel agents with strict file-scoping.** Worktree isolation
  errored out (`Cannot create agent worktree: not in a git repository and
  no WorktreeCreate hooks are configured`), even though `git` works fine
  here — the harness checks a different signal than the cli does. So I
  dispatched three agents in parallel WITHOUT isolation, with each one
  explicitly told its scope and that two other agents were running:
  A1 = `.github/`, A2 = `pipeline/`, A3 = `app/` (only `AbcView.tsx` +
  webview install). Zero conflicts. The fourth agent (A4 autoscroll, also
  `app/`) ran sequentially after A3 to avoid an `npm install` race —
  worth the wait. The fifth agent (component tests) ran after #5 landed.

- **Skill-mining the previous handover for context.** The earlier
  HANDOVER.md baked in a lot of subtle facts (don't combine `responsive:
  'resize'` with `scale`, `npm install` only from `app/`, `expo install`
  for native deps, `w:` binding rules) — feeding those into each agent's
  brief saved them from re-discovering everything.

- **JSON sidecar with ordered blocks.** The original `{verses[], chorus?}`
  + interleave-rule design forced authors to pre-interleave OR let a
  hardcoded rule guess. New `{ blocks: [{type, body}] }` puts position in
  the data where the author actually knows it, and naturally handles
  multiple choruses, bridges, etc.

- **Auto `auto → flagged` promotion on melody PUT** mirrors the existing
  song.cho PUT cleanly — no new state-machine code.

### Failed approaches / bugs fixed mid-session

1. **Worktree isolation in `Agent`.** Pre-set `.worktreesymlink` with
   `pipeline/.venv` + `app/node_modules` to make worktrees inherit deps,
   then called `Agent(..., isolation: 'worktree')` four times in parallel.
   All four failed with the same error. The harness's "is a git repo?"
   probe disagrees with reality. **Fix**: dropped isolation, used
   file-scoping in prompts.

2. **Chorus order bug.** All 3 demo songs have `song.cho` ordered V C V,
   but the notation rendered V V C because of `assembleAbc`'s rule:
   _"chorus between every 2nd verse, never as the final block; ≤2 verses
   get a trailing chorus"_. The rule made the chorus position **implicit
   and frequently wrong** — `song.cho` already says where the chorus
   goes; the melody schema was ignoring that information. **Fix
   (`1cacbc5`)**: `Melody = { header, blocks: Block[] }` where `Block =
   { type: 'verse'|'chorus'|'bridge', body: string }`. `assembleAbc` just
   concatenates header + each `block.body`. Tests rewritten on both
   sides; all 3 melodies migrated.

3. **`localStorage` setItem missing under vitest+jsdom.** Component tests
   crashed because zustand's `persist` middleware calls `setItem` on
   `localStorage`, and the Storage stub bundled with jsdom 29 (shipped by
   vitest 4) has no `setItem`. **Fix**: added an in-memory polyfill in
   `vitest.setup.ts` that replaces `window.localStorage` with a real
   `Map`-backed object before any test runs.

4. **Reviewer smoke test left a server running**, which the harness
   killed with SIGTERM (exit 143) — surfaced as a `task-notification`
   mid-session. Cosmetic only; the agent had already committed.

5. **`Edit` tool friction** with the bracketed filename `[id].tsx` — the
   shell `git add` needs the bracket escaped (`git add app/app/song/\[id\].tsx`).
   `Edit` itself handles it fine because we pass the raw path.

## Key Decisions Made and Why

1. **Drop the interleave rule; encode block order explicitly.** The
   `{verses[], chorus?}` + rule design said "the author should not have
   to pre-interleave the chorus", but in practice authors **always have
   an opinion** about where the chorus sits — and `song.cho` already
   records it. Storing the same fact twice (once implicit in `melody.json`,
   once explicit in `song.cho`) means they can disagree. They did, on
   all 3 demo songs. New schema treats `song.cho` ordering as the source
   of truth that `melody.json` must mirror, with the door open to V C V C V
   patterns, multiple choruses, bridges, etc.

2. **Schema migration without a back-compat path.** Three hand-authored
   melody files exist. Migrating them in-place is faster than dual-parsing.
   If the pipeline starts emitting `melody.json` (item #2 in next steps),
   it'll emit the new shape directly.

3. **Component tests stop at the web path.** `react-native-webview` ships
   Flow source that vite-node can't transform without extra plumbing
   (e.g. a SWC plugin or `transformIgnorePatterns`). Web is the
   production target today, so we mock the webview to a no-op and pin
   the native branch's behavior with future device tests instead.

4. **Staves toggle becomes either/or, not "show extras".** Originally:
   text always renders; staves render below when toggled on. User
   feedback said the duplication is noisy. Simpler mental model: one
   knob, two states (notation vs lyrics). Kept the existing "Staves"
   label since it's still accurate (Staves = on → notation visible).

5. **Default `autoScrollSpeed` 30 px/s.** Range 0–200, step 10. 30 reads
   slow but moves at all; 200 is "fast scroll for the chorus a third
   time". User can tune live with the stepper next to play/pause.

6. **`reset on play` not implemented; resume from current position.**
   When the user pauses then plays, we don't snap back to the top —
   feels right for the "I lost my place" case.

7. **Manual-scroll-during-play pauses (slack 6 px).** If the user drags
   while playing, we adopt the new position and pause. Easier to reason
   about than "ignore manual scroll" or "treat manual scroll as a speed
   change".

8. **Block types: `verse | chorus | bridge`.** Three slots is enough for
   the corpus; extending later is a one-line change in two places (TS
   union + Python `_BLOCK_TYPES`). Did NOT add free-form types; a typo'd
   `'verce'` should 400 at PUT time, not silently render.

9. **No backwards-compat key shimming on `melody.json`.** The reviewer's
   `EMPTY_MELODY` stub is `{header: '', blocks: []}`; old stubs with
   `verses[]` will fail the validator. Acceptable since the corpus has
   3 files and they're all migrated.

10. **Git identity set repo-locally**, not globally. `git config
    user.email "ondrej.maxa11@gmail.com" && git config user.name "Ondrej
    Maxa"` ran without `--global`, so other repos are untouched.
    Existing 25 commits still show the old `@MacBook-Pro-3.local`; not
    rewriting history.

## Lessons Learned & Gotchas

- **`Agent(isolation: 'worktree')` doesn't work here** even though it's
  a real git repo — the harness's repo-detection probe diverges from the
  CLI's. Stick with file-scoped parallel agents.

- **`renderAbc(..., { responsive: 'resize' })` silently kills `scale`.**
  Documented in the previous handover; still true; the new reviewer
  `app.js` also omits it. If a future contributor reintroduces it,
  A−/A+ will visibly stop affecting the staff (lyrics will still
  resize — they're styled by React, not abcjs).

- **vitest 4 + jsdom 29 has a busted `localStorage` Storage stub** (no
  `setItem`). `vitest.setup.ts` polyfills it. Anything using `persist`
  middleware or `localStorage` directly under vitest will fail without
  the polyfill.

- **`react-native-webview` ships Flow source**, not TypeScript or pure
  JS. vite-node can't parse `// @flow` files out of the box. We mock the
  module in tests; if you want real native-branch coverage, you'll need
  a Flow-strip transform.

- **`notation.toEnglish` / `toCzech` are asymmetric.** `toEnglish('B')` →
  `'Bb'` (assumes the input is Czech `B`, which is English `Bb`). Don't
  use plain `B` in roundtrip tests.

- **Long `Bash` commands sometimes print a directory listing as part of
  their output** — harmless; ignore the `ls -la`-looking preamble that
  precedes actual command output.

- **Pushing to `main` is blocked by the auto-mode classifier** by
  default. User has to approve once per push, or add a permission rule.

- **The `[id].tsx` route file needs bracket-escaping in shell calls**
  (`git add app/app/song/\[id\].tsx`), but Edit/Read handle it raw.

- **The reviewer ships static files via `StaticFiles(directory=...)`**;
  no bundler. New static modules are plain ES modules served from
  `/static/...`.

- **CI uses `pip install -e ".[dev]"`** — confirm `pyproject.toml` has
  `[project.optional-dependencies] dev = [...]` if you add new tooling.

## Current State

**Working right now (verified by tests):**

- **Reader (`cd app && npx expo start --web --port 8081`):**
  - Lists 3 demo songs (with diacritic-folded search, count badge).
  - Detail page renders title, controls bar, notation OR lyrics
    (depending on Staves toggle), and stave PNGs if any.
  - Notation: abcjs on web (direct DOM); abcjs in a WebView on
    iOS/Android (auto-sized via `postMessage`).
  - Controls: Notation Cs/En, Transpose ± (drives both chord text and
    `visualTranspose` on staff), Size A−/A+ (drives both font size and
    staff scale), Staves On/Off (now also toggles between notation and
    text), **Autoscroll** ▶/⏸ + speed stepper (0–200 px/s).
  - Settings persist (localStorage on web, AsyncStorage on native).
  - `npm test` → 46 passed. `npx tsc --noEmit` → clean.

- **Reviewer (`PYTHONPATH=pipeline pipeline/.venv/bin/python -m
  zpevnik_pipeline.cli review --songs ./songs`):**
  - Sidebar + detail with status badges; song.cho textarea +
    **`melody.json` textarea** + **in-page abcjs notation preview**.
  - Preview re-renders 300 ms after each keystroke.
  - Save flow: PUT song first, then PUT melody if dirty. `auto →
    flagged` promotion on either.

- **Pipeline**: 134 pytest passing; ruff clean. (mypy --strict still has
  6 pre-existing `import-untyped` warnings on `fitz` / `pytesseract` —
  unchanged from prior session.)

- **CI**: workflow at `.github/workflows/ci.yml`. Fires on every
  `push` and `pull_request`. Both jobs went green on the initial push.

- **Repo**: `origin/main` at `ee75d1d` on GitHub
  (`maxa-ondrej/zpevnik`, private). 8 new commits this session, all
  pushed.

- **Author identity**: locally set to
  `Ondrej Maxa <ondrej.maxa11@gmail.com>`.

**Known limitations / non-issues:**
- Native `AbcView` (WebView branch) has no component-test coverage —
  see "Lessons" for why.
- Demo melodies are still placeholder arpeggios in each key; real hymns
  need real melodies.
- 6 pre-existing mypy `import-untyped` warnings (`fitz`,
  `pytesseract`) — out of scope this session.
- Manual-scroll-pause has a 6 px slack — if a user nudges by a few
  pixels during autoscroll, we'll absorb it. Acceptable.
- Reviewer UI doesn't surface per-block type changes ergonomically
  (you edit raw JSON). Future work.

**No temporary hacks in committed code.**

## Clear Next Steps

In rough priority order:

1. **Get a real source PDF from the user.** Still the gate for OCR
   tuning, profile calibration, real corpus, real stave PNGs, real
   melodies.

2. **Pipeline → `melody.json` emission.** When the pipeline starts
   producing real per-song output, teach it to write a `melody.json` in
   the **new schema** (`{ header, blocks: [{type, body}, …] }`) — order
   the blocks from the same `start_of_*` directives that already drive
   `song.cho` so the two stay in sync.

3. **Reviewer: ergonomic block editing.** Right now the reviewer's
   `melody.json` is a single raw-JSON textarea. Better UX: per-block
   cards with type pickers + body textareas, drag-to-reorder. The
   abcjs preview is already wired to re-render on edit.

4. **Native component-test coverage.** `react-native-webview` Flow
   source needs either (a) `transformIgnorePatterns` + a Flow-strip
   loader, or (b) a Detox/E2E test that runs in a real RN context.

5. **Whisper autoscroll sync (v2 spec).** The rAF-driven autoscroll
   exists; the missing piece is feeding scroll speed from a Whisper
   alignment of recorded audio. Tied to the audio/ dir which is still
   empty.

6. **Reviewer: rerender notation in-page** for the song.cho field, not
   just `melody.json`. Currently lyrics edits don't preview live; you
   have to save and reload.

7. **Multi-chorus / bridge content** in real corpus testing. The
   schema supports it; no demo song exercises it. Once item #1 lands,
   pick a hymn that uses it and prove the path.

8. **`darkMode` setting** exists in the store but no UI surfaces it.
   Low priority but easy points.

9. **Pre-existing mypy `import-untyped` warnings.** Six on `fitz` /
   `pytesseract` in unrelated files. Either `[[tool.mypy.overrides]]
   ignore_missing_imports = true` for those modules, or install
   stubs.

**Dependencies / blockers:**
- Steps 1, 2, 7 need a real PDF.
- Steps 3, 4, 6, 8, 9 are unblocked.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                                       this file
├── README.md
├── zpevnik-spec.md
├── .gitignore                                        /songs/_*.json gitignored
├── .github/
│   └── workflows/
│       └── ci.yml                                    ★ pipeline + app jobs in parallel
│
├── schema/
│   └── meta.schema.json
│
├── pipeline/
│   ├── pyproject.toml                                Py 3.11+, ruff + mypy strict
│   ├── tests/                                        134 tests
│   │   └── test_review_melody.py                     ★ updated for blocks schema
│   └── zpevnik_pipeline/
│       ├── cli.py
│       ├── models.py
│       ├── extract/
│       ├── parse/
│       ├── output/
│       └── review/
│           ├── server.py                             ★ _validate_melody → blocks
│           └── static/
│               ├── index.html                        notation panel + melody editor
│               ├── app.js                            ES module; debounced preview;
│               │                                    EMPTY_MELODY = {header:'', blocks:[]}
│               ├── assemble.js                       ★ plain-JS port of assembleAbc
│               └── style.css
│
├── app/
│   ├── package.json                                  + react-native-webview, +
│   │                                                 @testing-library/react,
│   │                                                 @testing-library/jest-dom, jsdom
│   ├── vitest.config.ts                              ★ NEW — jsdom env, RN→RN-Web alias
│   ├── vitest.setup.ts                               ★ NEW — localStorage polyfill +
│   │                                                  jest-dom matchers
│   ├── public/songs                                  → ../../songs symlink
│   ├── app/
│   │   ├── _layout.tsx                               Stack root
│   │   ├── index.tsx                                 list with search
│   │   └── song/[id].tsx                             ★ autoscroll rAF loop;
│   │                                                  {!showStaves && <SongView/>}
│   └── src/shared/
│       ├── components/
│       │   ├── AbcView.tsx                           ★ web DOM render OR WebView
│       │   ├── AbcView.test.tsx                      ★ NEW — 5 cases, web path
│       │   ├── SongControls.tsx                      ★ + Autoscroll ▶/⏸ + stepper
│       │   ├── SongView.tsx
│       │   └── SongView.test.tsx                     ★ NEW — 7 cases
│       ├── chordpro/
│       │   ├── parser.ts                             + parser.test.ts
│       │   ├── transpose.ts                          + transpose.test.ts
│       │   └── notation.ts                           + notation.test.ts
│       │                                             toEnglish/toCzech ASYMMETRIC
│       ├── melody/
│       │   ├── assemble.ts                           ★ Melody = { header, blocks[] };
│       │   │                                          no interleave
│       │   └── assemble.test.ts                      ★ 6 cases
│       ├── search/
│       │   └── fold.ts                               + fold.test.ts
│       ├── store/
│       │   └── settings.ts                           autoScrollSpeed default 30
│       └── types/
│           └── song.ts
│
├── songs/
│   ├── index.json
│   ├── 001-pana-chvalit-budu/
│   │   ├── meta.json
│   │   ├── song.cho                                  V {C} V structure
│   │   └── melody.json                               ★ blocks: [V, C, V]
│   ├── 002-hospodin-je-muj-pastyr/
│   │   ├── meta.json
│   │   ├── song.cho
│   │   └── melody.json                               ★ blocks: [V, C, V]
│   └── 003-ja-mam-v-nebi-otce/
│       ├── meta.json
│       ├── song.cho                                  3/4 time
│       └── melody.json                               ★ blocks: [V, C, V]
│
└── audio/                                            empty (v2 — Whisper sync)
```

★ = high-leverage files for the next session.

**Git status:** working tree clean. 33 commits total on `main`. Remote
`origin = git@github.com:maxa-ondrej/zpevnik.git` (private). Author
identity `Ondrej Maxa <ondrej.maxa11@gmail.com>` (repo-local).

**Memory updates this session:** none new (`feedback_autonomy.md` and
`project_zpevnik.md` still apply).

**Reproduction commands** (next session can run these as-is):

```bash
# Pipeline tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 134 passed; ruff clean; mypy 6 pre-existing import-untyped warns

# App tests + types
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test
npx tsc --noEmit
# expect: 46 passed; tsc clean

# Reader
cd /Users/ondrej.maxa/Projects/zpevnik/app
npx expo start --web --port 8081
# → http://localhost:8081/

# Reviewer
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/
```
