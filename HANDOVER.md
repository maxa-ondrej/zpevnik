# Session Handover — 2026-05-17 (pm)

## Summary

Cleared the four highest-value unblocked items from the previous handover's
"Clear Next Steps": reviewer ergonomic block editor (#3), reviewer live
chord-chart preview for `song.cho` (#6), dark mode UI (#8), and the
trivial part of native test coverage (#4, the pure HTML builder).
Confirmed #9 (mypy warnings) was already clean — the previous handover
note was stale. Four commits on `main`, not yet pushed. Tests: pipeline
134 (unchanged), app 57 (was 46).

## What Was Worked On & What Got Done

Tasks taken from the previous handover's `Clear Next Steps` list:

| # | Task                                                  | Status                     |
|---|-------------------------------------------------------|----------------------------|
| 1 | Real source PDF                                       | ⏳ Blocked on user input   |
| 2 | Pipeline → melody.json emission                       | ⏳ Blocked on #1           |
| 3 | Reviewer: ergonomic block editing                     | ✅ `dc54b65`               |
| 4 | Native component-test coverage                        | ⚠️ Partial — `e41b7cd`     |
| 5 | Whisper autoscroll sync (v2)                          | ⏳ Blocked — no `audio/`   |
| 6 | Reviewer: rerender notation for `song.cho`            | ✅ `2d56d0f`               |
| 7 | Multi-chorus / bridge content in corpus               | ⏳ Blocked on #1           |
| 8 | `darkMode` UI                                         | ✅ `2b81c81`               |
| 9 | mypy `import-untyped` warnings                        | ✅ already clean (no-op)   |

Four new commits this session, all on `main`, **not pushed yet**:

```
e41b7cd App: cover AbcView native-branch HTML builder
2d56d0f Reviewer: live chord-chart preview for song.cho
2b81c81 App: surface dark mode and theme list/detail/controls
dc54b65 Reviewer: structured per-block melody editor
```

### Commit-by-commit notes

- **`dc54b65` — Reviewer structured block editor.** Replaces the raw
  `melody.json` textarea with a structured editor:
  - `pipeline/zpevnik_pipeline/review/static/index.html`: the
    `editor-melody` label is now a `<div class="editor-melody">`
    containing a small header textarea, a `<div id="melody-blocks">`
    list, and a row of `+Verse / +Chorus / +Bridge` buttons. A new
    `<template id="block-template">` defines the per-block card markup
    (type dropdown + up/down/delete buttons + body textarea).
  - `pipeline/zpevnik_pipeline/review/static/app.js`: drops the raw-JSON
    parse path. Maintains a `currentMelody` in-memory model (cloned from
    `loadedMelody` on song select). `renderBlocks()` rebuilds the card
    list on structural changes (add/delete/reorder/type-change); pure
    text edits on header/body don't re-render the list, so focus and
    cursor position survive. After Add, focuses the new card's textarea;
    after up/down, focuses the moved card. `cloneMelody()` normalizes
    unknown types to `verse` defensively. `onSave` reads `currentMelody`
    directly, with the same dirty/stub-unchanged logic as before.
  - `pipeline/zpevnik_pipeline/review/static/style.css`: per-block cards
    with a left-color-stripe by type (verse=blue, chorus=amber,
    bridge=purple), and a dashed-border `+ Verse/Chorus/Bridge` button
    row.
  - **Server unchanged** — `_validate_melody` already accepts the same
    schema; the client just emits it via a friendlier UI.

- **`2b81c81` — Dark mode.** The `darkMode` setting existed in the store
  with no UI; this surfaces it AND wires colors through.
  - New `app/src/shared/store/theme.ts`: exports `useTheme()` (resolves
    the `darkMode` setting against RN's `useColorScheme()` for
    `'system'`) and a `Theme` type with semantic colors (`bg`, `bgAlt`,
    `text`, `textMuted`, `textDim`, `border`, `borderSoft`, `accent`,
    `accentText`, `danger`, `inputBg`, `isDark`). Two palettes: LIGHT +
    DARK.
  - New `app/src/shared/store/theme.test.ts`: 4 cases pinning
    light/dark/system → light fallback (under jsdom, `useColorScheme`
    returns null), and re-render on setting change.
  - `app/src/shared/components/SongControls.tsx`: adds a `Theme` group
    with three Toggles — ☀ / ☾ / Auto — wired to `setDarkMode`. All
    inner `Toggle`/`Step`/`Group` components now take a `theme` prop
    and use semantic colors instead of hex literals.
  - `app/src/shared/components/SongView.tsx`: chord color from
    `theme.accent`, lyric color from `theme.text`, chorus left-border
    from `theme.textMuted`.
  - `app/app/index.tsx`: list rows, search bar, empty state, count
    badge all use theme colors.
  - `app/app/song/[id].tsx`: ScrollView background, error text,
    title, stave image bg all themed.
  - `app/app/_layout.tsx`: Stack header (`headerStyle`, `headerTintColor`,
    `headerTitleStyle`, `contentStyle`) and `<StatusBar>` style track
    `theme.isDark`. The Stack's screenOptions take theme values
    directly — no need to pass per-screen.

- **`2d56d0f` — Reviewer chord-chart preview.** When you edit
  `song.cho`, see the chord-above-lyric layout live, in a panel above
  the form, debounced 150 ms.
  - New `pipeline/zpevnik_pipeline/review/static/chordpro.js`: plain-JS
    port of `app/src/shared/chordpro/parser.ts`. Same regex, same
    directive handling. **Keep these two in sync.**
  - `index.html`: the notation panel is now wrapped in
    `<div class="preview-grid">` together with a new
    `<section class="preview-panel chordpro-panel">`. At 1100+ px wide,
    the two previews sit side-by-side; below that, they stack.
    Shared class `.preview-status` replaces the per-panel
    `.notation-status` (kept the `id`s though).
  - `app.js`: imports `parseChordPro`, adds `CHORDPRO_DEBOUNCE_MS = 150`,
    `chordproDebounce` timer, `scheduleChordproRender()`,
    `renderChordpro()`. Each parsed line becomes a row of column-cells
    (each cell has a chord span on top and a lyric span below). Empty
    chord/lyric uses a literal space so the row's height stays stable.
    Chorus / bridge sections get a left-rule (`.cp-chorus`,
    `.cp-bridge`). Status badge shows `N lines`.
  - `style.css`: `.preview-grid` (2-col @ ≥1100px), shared
    `.preview-panel` / `.preview-status` styles, `.chordpro-target` with
    `max-height: 480px` overflow-y for long songs.
  - **No tests for the chordpro JS port.** The TS one in `app/` has
    parser.test.ts; the reviewer port mirrors it byte-for-byte
    (modulo TS type annotations).

- **`e41b7cd` — AbcView native-branch test coverage.** The native
  branch's logic is `buildHtml(abc, scale, visualTranspose)` —
  pure functions. Export them, test them; sidesteps the
  react-native-webview Flow-source problem entirely.
  - `app/src/shared/components/AbcView.tsx`: `buildScale` and
    `buildHtml` are now exported.
  - `app/src/shared/components/AbcView.test.tsx`: adds 7 cases —
    1 for `buildScale`, 6 for `buildHtml` (asserts ABC literal is
    JSON-encoded, scale + visualTranspose reach the renderAbc call,
    abcjs CDN URL is correct, `postMessage` handshake is present,
    `responsive: 'resize'` is NOT in the payload, embedded quotes
    in ABC are escaped properly).
  - **Still uncovered**: the React-side `<WebView>` mounting itself
    — needs Detox or a SWC Flow-strip transform. Out of scope.

## What Worked and What Didn't

### Worked

- **Pure-function tests for the native branch.** Tried to think of how to
  cover the `Platform.OS !== 'web'` path of `AbcView`, and noticed the
  bulk of its complexity is in two pure helpers (`buildHtml`,
  `buildScale`). Exporting + unit-testing those gave 7 useful tests
  without touching the WebView render path. Lesson: when a branch is
  hard to mount, test the pure parts it composes from.

- **Cloning `loadedMelody` on song-select for the structured editor.**
  Keeps the loaded server state pristine for dirty detection while
  letting the UI mutate freely. Simpler than tracking "dirty" flags
  per-block.

- **Side-by-side preview grid.** Putting both `chord chart` and
  `notation` previews in one `display: grid` cell each (with a stack
  fallback at ≤1100px) reuses the existing `.preview-panel` styles and
  reads well at typical reviewer widths.

- **Inline color overrides on top of `StyleSheet.create`.** For theming,
  kept structural styles in `StyleSheet.create` (cached, fast) and only
  threaded the color-dependent properties via inline style arrays
  `[styles.foo, { color: theme.text }]`. Avoided a deeper refactor to a
  full `useStyles(theme)` factory pattern.

### Failed approaches / corrections mid-session

1. **Booting expo on port 8081 for a visual check.** A prior dev server
   (PID 51483 from a previous session) was already listening; expo CLI
   prompted for a fallback port, my `--non-interactive` flag wasn't
   recognized, and the new instance was skipped. The existing server
   still hot-reloaded my changes, but I had no browser to drive a
   visual check from this terminal. **Resolution**: trusted tsc + tests.
   Note for next session: if you need a clean expo boot, kill PID 51483
   first or pick a different port (8082+).

2. **`git checkout -- songs/index.json` blocked by classifier.** The
   reviewer's `/api/songs` endpoint regenerates `index.json` (including
   a `generatedAt` timestamp) every time it's hit; my boot test dirtied
   the file. `git checkout --` is destructive enough that the auto-mode
   classifier refused. **Resolution**: just left `songs/index.json`
   unstaged. It still shows as modified in working tree at session end.
   The timestamp drift is harmless but means **the file will churn
   every time the reviewer is booted** — consider stripping
   `generatedAt` from `index.json` or gitignoring it in a future
   session.

3. **`darkMode` UI was framed as "easy points" but theming the whole app
   isn't trivial.** Adding a toggle that does nothing would have been
   easy; making it actually work required threading a `theme` object
   through 5 components and updating ~7 StyleSheets. Worth doing — but
   not "easy points."

4. **Handover said "6 mypy warnings on fitz/pytesseract".** False —
   `pyproject.toml` lines 60-63 already had `[[tool.mypy.overrides]]`
   for both, and `mypy --strict` reports clean ("Success: no issues
   found in 41 source files"). The previous handover's bullet was stale.

## Key Decisions Made and Why

1. **Structured block editor, no raw-JSON fallback.** The previous
   handover noted "Reviewer UI doesn't surface per-block type changes
   ergonomically (you edit raw JSON)." Adding a "raw" toggle would
   double the editor surface area and complicate dirty tracking. Power
   users can edit `melody.json` on disk; the reviewer is for the
   common case.

2. **Re-render block list only on structural changes.** Pure body/header
   text edits update `currentMelody` in-place but don't rebuild the
   DOM — this preserves focus and cursor position. Reorder/add/delete
   does rebuild, and we manually re-focus the affected card to keep
   the keyboard flow intact.

3. **Theme palette: semantic, not raw.** `theme.text`, `theme.accent`,
   `theme.borderSoft` etc., not `theme.gray800`. Lets future palettes
   (high-contrast, OLED-black) drop in without renaming call sites.

4. **`useColorScheme()` for `'system'` mode, no MediaQuery polyfill.**
   In jsdom, `useColorScheme()` returns `null` and we fall through to
   light. That's the correct behavior: a test env that doesn't claim
   to know the user's preference shouldn't impose one. Document in
   `theme.test.ts`.

5. **Theming the Stack header at `_layout.tsx` instead of per-screen.**
   Avoids re-passing screenOptions on every push and means the header
   updates instantly when the user toggles the theme.

6. **Reviewer port of the ChordPro parser, not a TS bundler.** Wiring
   up a build step for the reviewer's static dir to consume TS would
   buy us shared code but cost ~30 min of tooling. The parser is small
   (~70 lines), unchanging, and the duplication is acknowledged in a
   header comment. Same trade-off as `assemble.js` already used.

7. **Side-by-side preview grid at 1100+ px, stack below.** Matches the
   existing editor grid breakpoint exactly so the entire form follows
   one rule.

8. **Chord-chart preview is column-per-segment, not row-aligned.** Each
   `[Chord]text` segment becomes a `<div class="cp-cell">` with chord on
   top, lyric on bottom. Cell width = max(chord, lyric). This is the
   chord-chart classic and avoids SongView's slight misalignment with
   long chords (it pads chord-spaces by `text.length`, which goes wrong
   when chord is multi-character — the reviewer's preview now does it
   better than the app does).

9. **150 ms debounce for chord-chart, 300 ms for notation.** Chord
   parsing + DOM render is much cheaper than abcjs SVG generation, so
   it can be faster without lag.

10. **`buildHtml` / `buildScale` exported solely for testing.** Slight
    "test smell" — exposing internals — but the alternative (mounting
    `<WebView>` in jsdom) needs Flow-strip plumbing that doesn't earn
    its keep. The exports are stable functions; if they ever need to
    change, the tests should change too.

11. **Did NOT push commits.** Previous handover documented that the
    auto-mode classifier blocks pushes; user has to approve once per
    push. Left four commits local on `main` for the user to push or
    redirect.

## Lessons Learned & Gotchas

- **`songs/index.json` regenerates on every reviewer hit.** The
  `generatedAt` timestamp drifts even if no song changes. Every reviewer
  boot dirties the working tree. Two ways out: either gitignore
  `songs/index.json` (lossy for the symlinked
  `app/public/songs/index.json` consumer in the reader), or drop
  `generatedAt` from the file. Worth deciding next session.

- **`git checkout --` on a tracked file is classifier-blocked.** It
  silently discards local changes. If you need to revert, use
  `git restore --source=HEAD -- path` (still risky), or just don't
  stage. The user can pre-approve in `.claude/settings.json`.

- **`npx expo start --non-interactive` is not a real flag.** Expo CLI
  prints `--non-interactive is not supported, use $CI=1 instead`. If
  you need a non-prompting boot, set `CI=1` in the env.

- **Port 8081 may be busy from a previous session's expo.** Check
  with `lsof -i :8081 | head` before starting a new one.

- **vitest + react-native-web treats inline-style arrays as flattened
  style attributes.** Asserting on `getAttribute('style')` with a
  regex (as in `SongView.test.tsx` for fontSize) works fine even
  after my theming changes — the chord-color regex didn't matter
  because no test asserted on chord color.

- **The reviewer's port of `parser.ts` is unsynced by hand.** Both
  files have a header comment noting the relationship; if you change
  one (add a directive, fix a regex), change the other in the same
  commit.

- **Stack `screenOptions` in `_layout.tsx` requires the layout to
  subscribe to the theme.** That means `_layout.tsx` is no longer a
  trivial component — it now re-renders on theme changes. Cheap, but
  worth knowing.

- **`StatusBar style="auto"` vs explicit `light|dark`.** I went with
  explicit `style={theme.isDark ? 'light' : 'dark'}` to match the
  theme exactly, regardless of system. `auto` would mirror system
  even in `light` darkMode — wrong.

## Current State

**Working right now (verified by tests):**

- **Reader (`cd app && npx expo start --web --port 8082`):**
  - All previous functionality (list + detail, notation, autoscroll, etc.)
    unchanged.
  - **NEW**: `Theme ☀ ☾ Auto` group in `SongControls` toggles the
    palette across list, detail, controls, lyrics, chord row, search
    bar, headers, status bar.
  - Persists to localStorage (web) / AsyncStorage (native) under the
    existing `zpevnik-settings` key.
  - **Not yet verified**: visual look in actual browser this session
    (no browser tool available; trusted tsc + 57 tests).

- **Reviewer (`PYTHONPATH=pipeline pipeline/.venv/bin/python -m
  zpevnik_pipeline.cli review --songs ./songs`, default port 8765):**
  - Sidebar + detail unchanged.
  - **NEW**: two preview panels side-by-side at ≥1100 px:
    `Chord chart preview` (live, 150 ms debounce) and
    `Notation preview` (live, 300 ms debounce).
  - **NEW**: per-block structured editor for `melody.json`. Type
    dropdown + body textarea + up/down/delete + Add Verse/Chorus/Bridge.
  - Save flow unchanged (auto→flagged promotion still works).

- **Pipeline**: 134 pytest passing; ruff clean; **mypy --strict clean**
  (the prior "6 import-untyped warnings" was stale — overrides are in
  place at `pyproject.toml:60-63`).

- **CI**: workflow at `.github/workflows/ci.yml` unchanged.

- **Repo**: `main` at `e41b7cd` locally; **`origin/main` still at
  `ea414b9`** (the previous handover refresh). 4 new commits, not
  pushed.

**Known limitations / non-issues:**

- `songs/index.json` will appear modified in `git status` after any
  reviewer boot — just timestamp drift. Currently unstaged at session
  end.
- AbcView's `<WebView>` mount path itself still has no test coverage —
  only its inputs (HTML payload + scale). Detox or a Flow-strip vitest
  plugin is the unblocked path.
- Reviewer preview shows chords as written (no Cs↔En toggle, no
  transpose). The reviewer's job is "did I author this correctly," not
  "does it look right under all settings."
- Dark mode in the **reviewer** (HTML/CSS) is NOT themed — the reviewer
  is still light-only. Surface is small; do later if useful.
- AbcView in dark mode renders SVG with abcjs's defaults (black on
  near-white background). On dark theme this is a noticeable contrast
  bump. Future: pass abcjs colors options or skin the SVG via CSS.

**No temporary hacks in committed code.**

## Clear Next Steps

In rough priority order:

1. **Push the 4 local commits** to `origin/main`. Classifier will
   probably prompt; user approves once.

2. **Get a real source PDF from the user.** Still the gate for OCR
   tuning, profile calibration, real corpus, real stave PNGs, real
   melodies. Steps 2 (pipeline → melody.json emission) and 7
   (multi-chorus/bridge corpus testing) are still blocked on this.

3. **Decide `songs/index.json` policy.** Either drop `generatedAt`
   from the file, or `.gitignore` it. Otherwise every reviewer boot
   creates a noisy diff.

4. **Theme abcjs SVG output to match the dark theme** (when active).
   Pass `bgColor: theme.bg`, `staffColor: theme.text` etc. to
   `renderAbc`, OR use CSS to invert/skin the SVG.

5. **Theme the reviewer's HTML/CSS** if the user wants the reviewer
   dark too. Small CSS-only change (swap `:root` variables, add
   `prefers-color-scheme` media query).

6. **Full native test coverage for AbcView's WebView mount.** Two
   approaches:
   - Vitest + SWC plugin to strip Flow from `react-native-webview`
     (`transformIgnorePatterns` for vite-node).
   - Detox/E2E setup running in a real RN context.
   Currently only the pure `buildHtml` / `buildScale` helpers are
   covered.

7. **Whisper autoscroll sync (v2 spec).** Needs `audio/` to grow
   content; the rAF-driven scroller is ready for a speed feed.

8. **Reviewer ergonomic-block editing v2.** Drag-to-reorder via
   pointer events instead of `↑↓` buttons. Nice-to-have.

9. **Reviewer transpose/Cs↔En toggle for the chord-chart preview.**
   So an author can quickly confirm `[H]` ↔ `[B]` swaps work as
   intended.

**Dependencies / blockers:**
- Step 2 needs user input (PDF). Step 7 (corpus testing) is also
  blocked on the PDF.
- Steps 1, 3, 4, 5, 6, 8, 9 are unblocked.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                                       this file
├── README.md
├── zpevnik-spec.md
│
├── .github/workflows/ci.yml                          unchanged
│
├── pipeline/
│   ├── pyproject.toml                                mypy overrides already in
│   │                                                 place (lines 60-63)
│   ├── tests/                                        134 tests
│   └── zpevnik_pipeline/review/
│       ├── server.py                                 unchanged
│       └── static/
│           ├── index.html                            ★ adds preview-grid +
│           │                                          block-template
│           ├── app.js                                ★ structured block editor;
│           │                                          chord-chart preview;
│           │                                          parseChordPro import
│           ├── assemble.js                           unchanged
│           ├── chordpro.js                           ★ NEW — plain-JS port of
│           │                                          parser.ts; keep in sync
│           └── style.css                             ★ .melody-block.*;
│                                                     .preview-grid; .cp-* rules
│
├── app/
│   ├── vitest.config.ts                              unchanged
│   ├── vitest.setup.ts                               unchanged
│   ├── app/
│   │   ├── _layout.tsx                               ★ Stack screenOptions
│   │   │                                              themed via useTheme()
│   │   ├── index.tsx                                 ★ list themed
│   │   └── song/[id].tsx                             ★ detail themed
│   └── src/shared/
│       ├── components/
│       │   ├── AbcView.tsx                           ★ buildHtml/buildScale
│       │   │                                          now exported
│       │   ├── AbcView.test.tsx                      ★ +7 cases for the
│       │   │                                          native HTML builder
│       │   ├── SongControls.tsx                      ★ + Theme group;
│       │   │                                          all internals take
│       │   │                                          a Theme prop
│       │   ├── SongView.tsx                          ★ chord/lyric colors
│       │   │                                          from theme
│       │   └── SongView.test.tsx                     unchanged (resetSettings
│       │                                              already includes
│       │                                              darkMode)
│       └── store/
│           ├── settings.ts                           unchanged
│           ├── theme.ts                              ★ NEW — useTheme() +
│           │                                          LIGHT/DARK palettes
│           └── theme.test.ts                         ★ NEW — 4 cases
│
├── songs/                                            unchanged corpus
│   ├── index.json                                    timestamp drifts on
│   │                                                 every reviewer boot
│   └── (3 demo songs unchanged)
│
└── audio/                                            still empty
```

★ = files created or substantially modified this session.

**Git status (session end):**
- `main` local at `e41b7cd` (4 commits ahead of `origin/main`).
- Working tree: `songs/index.json` modified (timestamp drift; no real
  change). Otherwise clean.
- 4 commits not pushed.

**Memory updates this session:** none new. `feedback_autonomy.md` and
`project_zpevnik.md` still apply.

**Reproduction commands** (next session can run these as-is):

```bash
# Pipeline tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 134 passed; ruff clean; mypy clean (NOT 6 warnings — handover
# was stale, overrides already in place).

# App tests + types
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test
npx tsc --noEmit
# expect: 57 passed; tsc clean.

# Reader (port 8082 to avoid the stale 8081 instance)
cd /Users/ondrej.maxa/Projects/zpevnik/app
npx expo start --web --port 8082
# → http://localhost:8082/

# Reviewer
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/
```
