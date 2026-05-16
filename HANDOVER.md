# Session Handover — 2026-05-16 (late night)

## Summary

Took the **Zpěvník** reader from "list + plain ChordPro" to a real
music-notation app. The previous handover ended with the reader
serving real song.cho files and the reviewer running on its own port,
but the staves on the detail page were empty placeholders cropped from
the source PDF (which we don't have yet). This session: hand-authored
three demo songs with proper Czech lyrics, then added real notation
rendering via `abcjs` driven by a per-song `melody.json` sidecar. The
notation respects the user's notation toggle, transpose, and font
size, and the staff auto-interleaves the chorus by a deliberately
simple rule (`V1, V2, C, V3, V4, C, V5, V6`). Also: pushed the repo to
GitHub as `maxa-ondrej/zpevnik` (private). Seven commits on `main`.

## What Was Worked On & What Got Done

Tracked as TaskList items #19–#22, all completed:

| # | Task | Status |
|---|------|--------|
| 19 | Render real notation via abcjs (sidecar `melody.abc` + AbcView) | ✅ |
| 20 | Notation: transpose binding + lyrics under notes + roomy layout | ✅ |
| 21 | Melody: JSON sidecar + auto chorus interleave + fontSize scaling | ✅ |
| 22 | Fix notation: `w:` per music line, scale honors A−/A+ | ✅ |

Seven commits this session (in order, on top of `40446e3`):

```
4cc5163 Notation: fix song 3 — 3/4 time needs denser melodies
a2867d1 Notation: w: per music line, scale honors A-/A+
3fce7d9 Notation: JSON sidecar, auto chorus interleave, size buttons wired
d0e6fba Notation: repeat the staff per verse instead of stacking lyrics
958f45b App: transpose binds to notation, lyrics under notes, roomy layout
5c61d38 App: render real music notation via abcjs
33e9d23 Seed 3 hand-authored demo songs for the reader
```

### Commit-by-commit notes

- **`33e9d23` — Demo songs**
  - The synthetic-PDF pipeline output had been unusable in the reader
    (`"Hospodin je m·j pastý·"` etc.). Wrote three short hand-authored
    ChordPro songs (Pána chválit budu / Hospodin je můj pastýř / Já mám
    v nebi Otce) directly to `songs/`, with `hasStaffImages: false` and
    `staveCount: 0` so the reader auto-hides the stave-PNG section.
  - Helper script lives at `/tmp/seed_demo_songs.py` (not committed; it
    just calls `output.writer.write_song()` + `write_index()`).

- **`5c61d38` — abcjs**
  - Added `abcjs` (~200 KB minified) to the app deps. New `AbcView`
    component in `app/src/shared/components/AbcView.tsx`. Web-only —
    abcjs is a DOM library and gracefully no-ops via `Platform.OS`.
  - Each song gained a `melody.abc` sidecar; the detail screen fetches
    it via `fetchOptionalAbc(dir)` alongside `song.cho` and passes the
    string to `AbcView`. Notes + chord labels + key + time signature
    render into an SVG.

- **`958f45b` — transpose / lyrics under notes / spacing**
  - Wired the user's transpose setting into abcjs's `visualTranspose`,
    so +/− shifts the rendered notes too.
  - Rewrote each `melody.abc` with `w:` lyric lines so words sit
    directly under the notes (not in a separate text block).
  - `scale: 1.25` + `paddingbottom: 12` for a non-compact layout
    (the page will eventually auto-scroll, so vertical breathing room
    is the right default).

- **`d0e6fba` — repeat per verse**
  - First cut used multiple `w:` lines stacked under one melody line;
    the user pushed back ("instead of stacking, repeat the notes"). So
    each verse now gets its own full music line + its own `w:`.

- **`3fce7d9` — JSON sidecar + auto interleave + size**
  - `melody.abc` → `melody.json` with `{ header, verses[], chorus? }`.
    Authors write the verse and chorus once; the app interleaves at
    render time.
  - **The interleaving rule** (lives in
    `app/src/shared/melody/assemble.ts` and is covered by 7 vitest
    cases):
    - Chorus between every 2nd verse, never as the final block.
    - Short songs (≤2 verses) get a single trailing chorus.
    - 6 verses + chorus → `V1, V2, C, V3, V4, C, V5, V6` (matches the
      user's spec).
  - `A−/A+` now drives the staff scale, not just the text. (See bug
    #2 below for the catch.)

- **`a2867d1` — `w:` per music line + scale fix**
  - **Bug fix #1**: ABC's `w:` line only attaches to the *immediately
    preceding* music line. My verse had two music lines (4 bars each)
    and one combined `w:`, so only the second staff got lyrics and the
    first appeared empty. Each verse is now 4 short music+w pairs —
    one per ChordPro text line — so every staff row carries its own
    lyric line beneath it.
  - **Bug fix #2**: `abcjs.renderAbc(..., { responsive: 'resize' })`
    clamps the SVG to its container width and effectively ignores
    `scale`, so the A−/A+ buttons did nothing visible on the staff.
    Removed `responsive`; abcjs now uses its native width × scale.
    Verified: SVG grew 925 px → 1156 px after two A+ presses.

- **`4cc5163` — song 3 3/4 fix**
  - Song 3 is in 3/4 (Q: `M:3/4`) so each bar holds 3 beats, not 4.
    I'd sized its melodies as if they were 4/4, so the actual note
    count was ~25 % short of the syllables. Rewrote each verse with
    eighth-note runs so dense Czech words like *milujícího* fit on
    five consecutive eighths. Now every lyric line in song 3 fits.

## What Worked and What Didn't

### Worked
- **abcjs as a black-box renderer.** Drop in an ABC string, get back a
  styled SVG with notes, chords, lyrics, key/time sigs, even the
  tempo glyph. Took 5 minutes to integrate (incl. installing the dep)
  and another hour to get the input format right.
- **JSON sidecar over a custom file format.** The earlier `melody.abc`
  approach forced authors to pre-interleave the chorus. JSON with a
  flat `verses: string[]` + optional `chorus` puts the rendering rule
  in code, not in the data — and we can change the rule (e.g.,
  "chorus every 3 verses") without rewriting every melody.
- **Vitest coverage for `assembleAbc`** caught a subtle off-by-one in
  the "should there be a trailing chorus" branch on the very first
  test run.
- **`Platform.OS !== 'web'` early return inside `AbcView`'s
  `useEffect`** keeps native targets compiling cleanly even though
  `abcjs` won't actually render there (would need a WebView wrapper).
  Cost: zero. Native crash if forgotten: certain.
- **Padding short verses with `*` (skip-note) and overflow with `_`
  (extend-previous-syllable)**: lets verses with different syllable
  counts share the same melody. Documented inline.

### Failed approaches / bugs fixed mid-session
1. **First melody.abc had stacked `w:` lines** (V1, V2, V3 under one
   music line). User pushback was instant — see commit `d0e6fba`. The
   convention is to repeat the staff, not the lyric stack.
2. **`w:` association.** I assumed `w:` would split across all the
   preceding music lines. It doesn't — only the most recent. Cost: one
   "the verses have no lyrics" screenshot from the user. Fixed in
   `a2867d1` by splitting each verse into 4 music+w pairs.
3. **`responsive: 'resize'` swallowing `scale`.** Easy to miss — both
   options are accepted by `abcjs.renderAbc`, and `scale` *seemed* to
   work because the lyrics size changed (those are styled by the
   surrounding React code, not by abcjs). The staff itself was pinned
   to container width. Removed `responsive`.
4. **3/4 unit confusion.** Sized song 3's melodies as if they were
   4/4. The bars hold 3 beats, not 4, so the actual note count was
   25 % short of the syllables. Lesson: always check `M:` against the
   beat math before writing bars.
5. **Stray `npm install` at repo root** (still a hazard — flagged in
   the previous handover, happened again this session when running
   `npm install abcjs`). Caught by `git status` before staging. If a
   stray `package.json` + `node_modules/` appears in the repo root,
   that's why.

## Key Decisions Made and Why

1. **Hand-authored demo songs > better synthetic pipeline output.**
   Two options when the user complained the songs were garbage: (a)
   fix the OCR pipeline to produce readable text from synthetic PDFs,
   or (b) bypass the pipeline for demo content. (b) won — the pipeline
   mechanics are sound; the problem was always "no real input PDF".
   Hand-authored ChordPro lets the app *actually be a songbook reader*
   while we wait for real source material.

2. **`hasStaffImages: false` for the demo songs.**
   We have no real scans to crop, so emitting empty stave PNGs would
   be lying. The reader already gates the stave section on the count,
   so disabling means clean rendering.

3. **abcjs over VexFlow.**
   abcjs accepts a plain-text ABC string; VexFlow needs you to build a
   note tree programmatically. For a sidecar-file workflow where humans
   (or, eventually, the pipeline) author the melody, text input is
   massively more ergonomic. abcjs's responsive-resize quirk is the
   only real wart and it's documented in code now.

4. **JSON sidecar instead of pre-interleaved ABC.**
   The interleaving rule lives in code so we can iterate on it. If we
   decide "every 3 verses, or always trailing for hymns, or never
   trailing for psalms", that's a one-line change in
   `assemble.ts` — not 240 file edits across the corpus.

5. **One music+w pair per ChordPro text line.**
   `w:` is bound to the previous music line, so splitting every verse
   into one music line per text line gives a 1:1 lyric:staff mapping
   that abcjs handles correctly. Side benefit: each staff row is
   short, which is the right shape for the upcoming autoscroll.

6. **`scale = BASE_SCALE × (fontSize / BASE_FONT_SIZE)`.**
   Linear mapping so A− and A+ both visibly move the needle. The base
   1.25 keeps the staff readable at the default font size; tweaks
   either direction from there.

7. **Padding strategy: `*` for missing syllables, `_` for extra ones.**
   `*` skips a note (note plays, no lyric beneath); `_` extends the
   previous syllable across the next note (visual slur).
   Both are standard ABC. Made the verse-2-doesn't-quite-fit case
   purely declarative — no melody-per-verse needed.

## Lessons Learned & Gotchas

- **ABC's `w:` line associates with the *immediately preceding* music
  line, full stop.** If you want lyrics on every staff row, you need
  one `w:` per music line. Stacking multiple `w:` lines under one
  music line means "this melody has multiple verses with these
  stacked lyrics" — a different feature.
- **`abcjs.renderAbc(target, abc, { responsive: 'resize' })`** clamps
  the SVG to the container's width and effectively ignores `scale`.
  Don't combine them.
- **`M:3/4` means each bar = 3 beats, not 3 quarter-notes-of-anything
  smaller.** With `L:1/4` the natural note is a quarter, and a bar
  holds three of them. If you want 9 notes per 2-bar phrase, that's
  3 quarters + 3 eighth pairs per bar, not "two and change bars of
  quarters".
- **`Pán` / `Král` are one syllable each, not two.** The Czech accent
  doesn't add a syllable. The line "on je můj Pán a Král." is six
  syllables, not eight.
- **Stray `npm install` at repo root** (running outside `app/`)
  creates a top-level `package.json` + `node_modules/` + `package-lock.json`.
  Always `cd app && npm install ...`. If you see those files at the
  repo root, delete them — nothing references them.
- **abcjs's TypeScript types call the function `renderAbc` (not
  `renderABC`).** Easy to mis-cap.
- **`expo install` (vs `npm install`) is the right way to add native
  deps** — it pins to the version compatible with the installed Expo
  SDK. We used it for `@react-native-async-storage/async-storage`
  earlier this session, and not for `abcjs` (web-only, no Expo
  compatibility check needed).
- **Don't trust `Q:` in older ABC docs.** Modern abcjs accepts
  `Q:1/4=84` (quarter = 84 BPM); the older `Q:60` or `Q:"Allegro"`
  forms work but render differently.

## Current State

**Working right now (verified end-to-end via Playwright):**

- **Reader app at http://localhost:8081/**
  - 3 demo songs in the sidebar list with diacritic-folded search.
  - Click any → detail screen with real notation:
    - 4 music+w pairs per verse, each with its own lyrics directly
      under the notes
    - Chord labels above each bar
    - Chorus auto-interleaved (`V1, V2, C` for the 2-verse demos)
  - SongControls bar drives: notation Cs/En, transpose ± (shifts
    notation too), font A−/A+ (resizes notation too), staves on/off.
  - Settings persist via localStorage on web / AsyncStorage on native.
  - `npm test` → 35 vitest tests passing.
  - `npx tsc --noEmit` → clean.

- **Reviewer at http://127.0.0.1:8765/**
  - Sidebar + detail editor; status badges; save flow with
    auto-promotion `auto → flagged`.
  - No changes this session; still healthy.

- **Pipeline**
  - 119 tests green; ruff + mypy --strict clean. (Unchanged this
    session.)

- **Repo on GitHub: https://github.com/maxa-ondrej/zpevnik (private)**
  - Pushed as `origin/main` this session. `git push` works.

**Known limitations:**
- abcjs is web-only. On iOS/Android the `AbcView` gracefully renders
  nothing (the staff section just doesn't appear). When the native
  build matters, wrap abcjs in a WebView.
- Demo melodies are *placeholder* musical phrases I wrote (chord-tone
  arpeggios in each key), not faithful tunes. Real hymns will need
  real melodies in `melody.json`.
- Czech word *milujícího* in song 3 is rendered as 5 eighth notes,
  which is musically right but visually dense at default scale —
  the user might want denser bars stretched horizontally.
- The horizontal scrollbar on the notation SVG can appear at narrow
  viewport widths now that `responsive: 'resize'` is off. Acceptable
  trade-off for the A−/A+ feature.
- HANDOVER.md is now ~24 KB; could use a "things from previous
  sessions" archive section in a future refresh.

**No temporary hacks in committed code.**

## Clear Next Steps

In rough priority order:

1. **Get a real source PDF from the user.** Still the gate for OCR
   tuning, profile calibration, real corpus testing, and (most
   visibly) real stave PNGs alongside the rendered notation.

2. **Pipeline → melody.json emission.**
   When the pipeline starts producing real per-song output, teach it
   to write a `melody.json` alongside `song.cho`. For now the
   pipeline doesn't know about ABC at all. Initial bridge: the OCR'd
   chord row + lyric row already align to staff lines on the
   page — there's enough structure to emit ABC if we're loose about
   exact note durations.

3. **Reviewer: ABC editor.**
   The reviewer's textarea currently edits `song.cho` only. Add a
   second textarea for `melody.json` (or split it into per-verse
   inputs) so humans can tune the notation without leaving the UI.

4. **Component tests for SongView and AbcView.**
   Pure-helper tests cover the parsers + assemblers; rendering tests
   would catch regressions in the rendered tree. Needs
   `@testing-library/react-native` + jsdom.

5. **Native: WebView-wrapped notation rendering.**
   The detail page falls back gracefully on iOS/Android, but the
   notation is the headline feature now — worth wrapping abcjs in a
   `WebView` (or shipping a small static page) so native gets the
   staff too.

6. **GitHub Actions CI.**
   `gh repo create` is done. Add `.github/workflows/ci.yml` running
   `ruff check`, `mypy zpevnik_pipeline tests`, `pytest`, `npm test`,
   `npx tsc --noEmit`.

7. **Reviewer: rerender notation in-page.**
   The reviewer can edit `song.cho` but can't *see* the rendered
   notation for the song being reviewed. Pull the same `AbcView`
   into the reviewer's detail view.

8. **Autoscroll.**
   The whole notation layout was designed with autoscroll in mind
   (one music+w pair per text line, generous vertical spacing). The
   missing piece is a `requestAnimationFrame` loop tied to
   `autoScrollSpeed` in the settings store. Tied to v2 spec.

9. **Set git author identity.**
   Still `MacBook-Pro-3.local`. `git config user.email
   "ondrej.maxa@shipmonk.com"` when the user gives the go-ahead.

**Dependencies / blockers:**
- Steps 1, 2 need a real PDF.
- Step 6 needs nothing (CI infra is ready).
- Step 4 needs `@testing-library/react-native` + a vitest jsdom config.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                              this file
├── README.md
├── zpevnik-spec.md
├── .gitignore                               /songs/_*.json gitignored
│
├── schema/
│   └── meta.schema.json                     staveCount required
│
├── pipeline/                                ← UNCHANGED this session
│   ├── pyproject.toml                       ruff/mypy config
│   ├── tests/                               119 tests
│   └── zpevnik_pipeline/
│       ├── cli.py
│       ├── models.py
│       ├── extract/
│       ├── parse/
│       ├── output/
│       └── review/
│           ├── server.py                    FastAPI app
│           └── static/                      reviewer UI
│
├── app/
│   ├── package.json                         + abcjs ^6.6.3
│   ├── public/songs                         → ../../songs symlink
│   ├── app/
│   │   ├── _layout.tsx                      Stack root
│   │   ├── index.tsx                        list with search
│   │   └── song/[id].tsx                    ★ fetches melody.json,
│   │                                          calls assembleAbc, passes
│   │                                          to AbcView + SongView
│   └── src/shared/
│       ├── components/
│       │   ├── AbcView.tsx                  ★ NEW — abcjs wrapper
│       │   ├── SongControls.tsx             notation/transpose/font/staves
│       │   └── SongView.tsx                 text-only ChordPro renderer
│       ├── chordpro/
│       │   ├── parser.ts                    + parser.test.ts
│       │   ├── transpose.ts                 + transpose.test.ts
│       │   └── notation.ts                  + notation.test.ts
│       ├── melody/                          ★ NEW
│       │   ├── assemble.ts                  ★ interleaving logic
│       │   └── assemble.test.ts             7 cases
│       ├── search/
│       │   ├── fold.ts                      + fold.test.ts
│       ├── store/
│       │   └── settings.ts                  zustand persist
│       └── types/
│           └── song.ts                      SongMeta TS mirror
│
├── songs/
│   ├── index.json                           hand-authored corpus index
│   ├── 001-pana-chvalit-budu/
│   │   ├── meta.json                        reviewStatus: approved
│   │   ├── song.cho                         hand-authored ChordPro
│   │   └── melody.json                      ★ NEW — { header, verses[], chorus }
│   ├── 002-hospodin-je-muj-pastyr/
│   │   ├── meta.json
│   │   ├── song.cho
│   │   └── melody.json                      ★ NEW
│   └── 003-ja-mam-v-nebi-otce/
│       ├── meta.json
│       ├── song.cho
│       └── melody.json                      ★ NEW (3/4 time, dense eighths)
│
└── audio/                                   empty (v2 — Whisper sync)
```

★ = high-leverage files for the next session.

**Git status:** working tree clean. 25 commits total. Remote
`origin = git@github.com:maxa-ondrej/zpevnik.git` (private).

```
4cc5163 Notation: fix song 3 — 3/4 time needs denser melodies
a2867d1 Notation: w: per music line, scale honors A-/A+
3fce7d9 Notation: JSON sidecar, auto chorus interleave, size buttons wired
d0e6fba Notation: repeat the staff per verse instead of stacking lyrics
958f45b App: transpose binds to notation, lyrics under notes, roomy layout
5c61d38 App: render real music notation via abcjs
33e9d23 Seed 3 hand-authored demo songs for the reader
40446e3 Refresh HANDOVER for the app-wired + reviewer + lint-clean session
1f13e2b App: unit tests for parser, transpose, notation, fold
c05760a App: persist settings on native via AsyncStorage
ff01ccd Pipeline: pass ruff + mypy --strict cleanly
1c584f4 Review server: API + reviewer UI + tests
5890533 Housekeeping: accept expo-cli gitignore drift, untrack expo-env.d.ts
0dfcf4e Refresh HANDOVER for the stages-0..12 + app-wired sessions
1862e56 App: search, settings persistence, dynamic header title
0105080 App: expose notation/transpose/font/staves controls on song page
f772da9 App: load real songs from /songs/, surface stave PNGs
c8174ee Pipeline stages 6-12: alignment, ChordPro emission, write-out
…
```

**Memory updates this session:** none new (the `feedback_autonomy.md`
entry from earlier still applies).

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
# expect: 35 passed; tsc clean

# Reader app
cd /Users/ondrej.maxa/Projects/zpevnik/app
npx expo start --web --port 8081
# → http://localhost:8081/  (lists 3 demo songs with proper notation)

# Reviewer
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/
```
