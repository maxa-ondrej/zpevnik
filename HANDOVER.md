# Session Handover — 2026-05-18

## Summary

Short, focused session picking up from the prior handover at `9be41ee`.
Closed the three remaining **small-polish** items from the
HANDOVER's next-steps list (#8, #9, #10). Three commits, all pushed
to `origin/main`. Tests: app **113** (was 89, +24 new), pipeline
**137** (unchanged). No code in flight; working tree clean. The big
remaining items (#4 native asset bundling, #6 server-side fulltext,
#7 native note-highlight) were deliberately deferred — see "Clear
Next Steps" for why.

## What Was Worked On & What Got Done

### Three commits this session (oldest first)

| Commit    | Item | What                                                    |
|-----------|------|---------------------------------------------------------|
| `b90d11e` | #9   | Hold-to-repeat for stepper buttons via `useAutoRepeat`  |
| `091cedf` | #10  | Reviewer Alt+Shift+V/C/B to add verse/chorus/bridge     |
| `0587cdc` | #8   | Lyric-fallback beats/line from melody.json measure count |

All pushed to `origin/main` (range `9be41ee..0587cdc`).

### `b90d11e` — Stepper auto-repeat (item #9)

Held +/− buttons (Transpose, Capo, Size, Spacing, Speed) now repeat
on hold instead of needing one click per step. Architecture:

- New file `app/src/shared/components/useAutoRepeat.ts` — a generic
  `{ start, stop }` hook. Initial press fires `onPress` once, then
  after a 400ms delay it auto-repeats every 80ms until released,
  disabled, or unmounted. `start` calls `stop()` first to defensively
  reset before re-arming.
- `SongControls.tsx`'s internal `Step` now wires
  `onPressIn={start}` / `onPressOut={stop}` to the hook (was
  `onPress`). Boundary clamps are still handled by the parent's
  Math.max/min setters; the hook's `useEffect([disabled])` tears
  down any in-flight interval when the parent disables the button.
- 8 tests in `useAutoRepeat.test.ts` (renderHook-based).

### `091cedf` — Reviewer add-block shortcut (item #10)

`Alt+Shift+V` / `Alt+Shift+C` / `Alt+Shift+B` insert a new
verse/chorus/bridge block in the structured editor and focus the new
textarea, regardless of which control currently has focus. Hint text
("Alt+Shift+V / C / B") added next to the existing
+ Verse / + Chorus / + Bridge buttons.

Touched files:
- `pipeline/zpevnik_pipeline/review/static/app.js` — extracted
  `addBlock(type)` helper, added global `keydown` listener
  `onGlobalKeydown`.
- `pipeline/zpevnik_pipeline/review/static/index.html` — added
  `<span class="hint">Alt+Shift+V / C / B</span>` in the add row.
- `pipeline/zpevnik_pipeline/review/static/style.css` — added
  `.melody-add-row` `align-items: center` + `.melody-add-row .hint`
  styling (muted, 11px).

### `0587cdc` — Beats/line from melody.json (item #8)

The lyric-only Play fallback (used when AbcView TimingCallbacks
aren't the timing source — staves off, or currently any native run)
was advancing one line every 4 beats unconditionally. Now it derives
a real `beatsPerLine = totalBeats / lineCount` from melody.json when
available, falling back to 4 when the song has no melody.json.

Touched files:
- New `app/src/shared/melody/totalBeats.ts` — exports
  `parseMeter(header)`, `countMeasures(body)`, and
  `totalBeatsFromMelody(melody)`. `countMeasures` strips ABC
  information-field lines (`/^[A-Za-z]:/`) and quoted
  chord/annotation strings before counting `\|+` groups, so
  `"^Verse 1"` annotations and embedded `|` characters in
  text don't inflate the count.
- 16 tests in `totalBeats.test.ts` — `M:` parsing variants,
  `|`/`||`/`|]`/`[|`/`|:`/`:|` boundary handling, `w:` line
  filtering, multi-block summation.
- `app/app/song/[id].tsx`:
  - Imports `totalBeatsFromMelody`.
  - Adds `totalBeats: number | null` to `State.kind === 'ready'`.
  - Computes once during the load effect alongside `assembleAbc`.
  - Uses it in the lyric-fallback `useEffect` instead of the
    hardcoded constant 4.

## What Worked and What Didn't

### Worked

- **`useAutoRepeat` as a generic hook + `renderHook` tests.**
  Sidesteps react-native-web Pressable's event plumbing entirely.
  The hook is tested through its actual API (`start` / `stop`) and
  fake timers, which is faster and more honest than trying to fire
  events through the synthetic Pressable layer.

- **`ev.code === 'KeyV'` instead of `ev.key === 'v'`** for the
  reviewer shortcut. On macOS with the US layout, `Option+Shift+V`
  inserts `◊` (a literal character) — so `ev.key` is the diamond,
  but `ev.code` is still `'KeyV'`. Keying off `code` makes the
  shortcut layout-resilient.

- **Counting `\|+` groups for ABC measure counting.** Quick and
  correct for the demo corpus. `||` / `|]` / `|:` / `:|` all
  collapse into a single boundary by the regex.

- **Filter ABC info-field lines via `/^[A-Za-z]:/`.** Catches the
  full alphabet of ABC directives (`X:`, `T:`, `M:`, `L:`, `Q:`,
  `K:`, `w:`, `s:`, …) in one regex.

- **`add_classes: true`** still relied on for the staff-line
  wrapper walk-up (no regression from this session; just
  confirming it's still the foundation).

### Failed approaches / things I had to redo

1. **First test attempt for the new auto-repeat** — wrote
   `SongControls.test.tsx` that rendered `<SongControls />` and
   tried `fireEvent.mouseDown(screen.getByRole('button', {name: 'A+'}))`.
   `onPressIn` never fired. Root cause: react-native-web 0.19's
   Pressable wires its responder via the press hook stack, not
   plain `onMouseDown`, and `@testing-library/react`'s
   `fireEvent.mouseDown` doesn't reliably trigger it in jsdom.
   Deleted the file; extracted the timing logic into a hook and
   tested it with `renderHook` instead.

2. **`git add` from inside the `app/` cwd.** Ran
   `git add app/src/shared/components/...` while `cwd` was
   `/Users/ondrej.maxa/Projects/zpevnik/app`, producing
   `pathspec 'app/src/...' did not match any files`. Switched to
   `git -C /Users/ondrej.maxa/Projects/zpevnik add app/src/...`
   for all subsequent git ops. **Gotcha for next time.**

### Not attempted (intentional)

- **#7 (native note-highlight via WebView+postMessage).** The
  implementation plan was clear (inject `__zStartFollow` /
  `__zStopFollow` on `window`, post `{kind: 'beat'|'staffLine'|'end'}`
  back to RN, drive via `webViewRef.current?.injectJavaScript(...)`
  on `isFollowing` toggle). Skipped because the actual native
  behavior can't be verified from this terminal (handover gotcha
  #9 still applies — playwright install denied, no device QA). The
  contract is well-defined; the user can request this next session
  if they're at a device.

- **#4 (native asset bundling).** Substantial: needs an asset
  manifest generated at build time, expo-asset → documentDirectory
  first-launch sync, and a unified loader abstraction across all
  6 `fetch('/songs/...')` sites in `index.tsx`, `song/[id].tsx`,
  and `setlists/[id].tsx`. None of it is device-testable from
  here, and a partial impl risks shipping silently-broken native.

- **#6 (server-side fulltext.json).** Handover explicitly marks
  this premature at 3 songs. The current client-side fallback
  works fine. Defer until corpus growth.

## Key Decisions Made and Why

1. **Auto-repeat extracted into a hook, not inlined in `Step`.**
   `useAutoRepeat` is the unit of testability. Without extracting,
   the only path to testing the timing behavior was through
   Pressable, which RN-Web makes painful in jsdom. Other parts of
   the app may eventually want hold-to-repeat too (e.g. a future
   tempo slider), so a hook is the natural shape.

2. **Defaults: `delayMs: 400`, `intervalMs: 80`.** Matches OS-level
   keyboard repeat (initial delay ~400ms, repeat rate ~30/s on
   macOS). 80ms = ~12.5 ticks/s, comfortable for steppers without
   running away.

3. **`start()` calls `stop()` first.** Defends against a stray
   `onPressIn` arriving without a paired `onPressOut` (e.g. mouse
   leaves the element). Without it, repeat intervals could pile up.

4. **Alt+Shift+V/C/B chosen over Ctrl+Shift+V** for the reviewer
   shortcut. Ctrl+Shift+V is "paste plain text" in many editors on
   Windows/Linux; Cmd+Shift+V is "paste and match style" on macOS.
   Alt+Shift+letter is rarely claimed and doesn't conflict with the
   existing Alt+↑/↓ reorder shortcut (different modifier set).

5. **Global `document.addEventListener('keydown', ...)` for the
   reviewer shortcut, gated on `currentDetail !== null`.** Fires
   regardless of which control has focus. Without a song loaded
   (`currentDetail` is null), it's a no-op.

6. **`totalBeats` stored in state, not derived on the fly.** The
   value is computed once when melody loads and doesn't change
   thereafter. Putting it in state keeps the fallback effect's
   dependency list simple (`[isFollowing, useAbcjsTiming, state,
   stopFollow]`) — it would re-run on state changes anyway.

7. **Default `beatsPerMeasure = 4` when `M:` is absent.** Matches
   ABC convention (most hymns are 4/4 even without an explicit
   meter). Keeps the helper useful even for headerless melodies.

8. **`totalBeatsFromMelody` returns `null` when there are zero
   measures.** Forces the caller (the fallback effect) to use the
   sensible fallback (4) rather than the meaningless zero. Clearer
   than returning 0 and asking everyone to handle it.

## Lessons Learned & Gotchas

- **react-native-web 0.19 Pressable doesn't reliably surface
  `onPressIn` from `fireEvent.mouseDown` in jsdom.** When you
  need to test Pressable-triggered behavior, either extract the
  logic into a plain hook/function or move up to `userEvent` (not
  installed here). Don't burn time wiring synthetic events through
  the responder system.

- **`git add` resolves paths from cwd, not from the repo root.**
  When running git from a subdirectory of the repo, paths must be
  relative to cwd OR you must use `git -C <repo-root>`. I tripped
  on this and wasted a tool call. Default to `git -C` for clarity.

- **`ev.key` is keyboard-layout-dependent.** Alt/Option modifiers
  on macOS produce non-ASCII characters (`◊` for V, `Ç` for C,
  `∫` for B). `ev.code` is the physical key (`KeyV`, `KeyC`,
  `KeyB`) and survives any layout. Use `code` for any modifier-
  based shortcut that targets a letter key.

- **`requestIdleCallback` and `setInterval` are NOT stripped by
  `vi.useFakeTimers()` unless you opt in to the right toggles.**
  The default in this project worked for our straightforward
  `setTimeout`/`setInterval` cases without extra config.

- **`renderHook` from `@testing-library/react` v16 gives you a
  `rerender({...})` that re-runs the hook with new props.** Use
  this for testing reactions to prop changes (e.g. the
  `useEffect([disabled])` teardown). No magic needed.

- **ABC info-field lines start with `[A-Za-z]:` at column 0.**
  The full ABC spec allows lowercase too (`w:`, `s:`). A regex
  `/^[A-Za-z]:/` catches all of them in one pass.

- **In ABC bodies, `|` can legitimately appear inside `"..."`
  quoted chord/annotation strings.** Strip those before counting.
  `body.replace(/"[^"]*"/g, '')` is enough — no nested quotes
  in the corpus.

- **HANDOVER.md is the project's session-close artifact.** Pattern
  from the previous session is one refresh near the end of each
  working session. The skill at `~/.claude/skills/handover` is the
  expected entry point.

## Current State

**Working right now:**

- Reader app — all features from the previous session still work.
  Stepper buttons now auto-repeat on hold.
- Reviewer — block editor still works; Alt+Shift+V/C/B inserts
  blocks.
- Lyric-fallback Play mode — now uses song-proportional beats/line
  when melody.json is available.

**Test counts:**
- Pipeline: **137 passed** (unchanged from prior session)
- App: **113 passed** (was 89; +8 useAutoRepeat + 16 totalBeats)
- `npx tsc --noEmit`: clean
- `eslint`: pre-existing config-missing failure (ESLint v9 needs
  `eslint.config.js`; project still has the old format). **Not
  introduced by this session.**

**Repo:**
- Working tree: clean
- `main` at `0587cdc`
- `origin/main` matches (pushed this session)

**Known limitations (unchanged from prior handover):**
- Note-level highlight still web-only on native (item #7 unfixed).
- Native still loads songs via `fetch('/songs/...')` which only
  works in dev or web (item #4 unfixed).
- Lyric search still loads every `.cho` on app boot (item #6 —
  premature to fix).
- Play tempo accuracy still depends on `meta.tempo` (demo songs
  hard-code 84/null).

**No temporary hacks introduced this session.**

## Clear Next Steps

The next-steps list from the prior handover, updated:

1. **(blocked)** Real source PDF — gate for OCR tuning, profile
   calibration, real corpus, real stave PNGs, real melodies.
2. **(blocked)** Pipeline → `melody.json` emission from a real PDF.
3. **(blocked)** Real corpus passes — multi-chorus / bridge
   structure, real tempos.
4. **(unblocked, untested)** Native offline-first asset bundling.
   Sketch: generate a static asset manifest at build time
   (`pipeline → app/src/shared/assets/manifest.ts`), use
   `expo-asset` + `expo-file-system` to copy bundled files to
   `FileSystem.documentDirectory/songs/` on first launch,
   introduce a unified `loadSongAsset(path)` helper that returns
   bytes from documentDirectory on native and fetch on web,
   then refactor the 6 `fetch('/songs/...')` sites
   (`app/app/index.tsx:53,66`, `app/app/song/[id].tsx:47,327,335`,
   `app/app/setlists/[id].tsx:40`) to use it. **Cannot be
   device-verified from this terminal — needs the user to QA on
   iOS/Android.**
5. **(blocked)** Whisper autoscroll sync (v2 spec).
6. **(YAGNI for now)** Server-side `fulltext.json`. Revisit when
   corpus is ≳ 10 songs.
7. **(unblocked, untested)** Native note-highlight via
   WebView+postMessage. Sketch: extend `buildHtml` in `AbcView.tsx`
   to define `window.__zStartFollow({tempo})` and
   `window.__zStopFollow()` that construct
   `ABCJS.TimingCallbacks` inside the WebView and post
   `{kind: 'beat'|'staffLine'|'end'}` back. Add `useRef<WebView>`
   in the native branch; effect on `[isFollowing, tempo]` calls
   `webViewRef.current?.injectJavaScript(...)`. Extend `onMessage`
   to dispatch to `onBeat` / `onStaffLineChange` / `onFollowEnd`.
   **Needs device QA — same caveat as #4.**
8. **Done** (`0587cdc`) — beats/line from melody.json measures.
9. **Done** (`b90d11e`) — hold-to-repeat stepper buttons.
10. **Done** (`091cedf`) — reviewer add-block shortcut.

**Recommended order if the user picks up next:**
- If they have a device: items 4 and 7 (the last v1 §7.1 gap
  plus its natural follow-on).
- If they have a real PDF: items 1 → 2 → 3 (cascade).
- Otherwise: there is no realistically unblocked feature work
  left in this corpus size. Wait for content.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                                       ★ this file
│
├── pipeline/
│   └── zpevnik_pipeline/review/static/
│       ├── app.js                                    ★ + addBlock() helper
│       │                                              + onGlobalKeydown
│       ├── index.html                                ★ + Alt+Shift hint
│       └── style.css                                 ★ + .melody-add-row .hint
│
└── app/
    ├── app/song/[id].tsx                             ★ + totalBeats state
    │                                                   + melody-aware fallback
    └── src/shared/
        ├── components/
        │   ├── SongControls.tsx                      ★ Step → useAutoRepeat
        │   ├── useAutoRepeat.ts                      ★ new — hook
        │   └── useAutoRepeat.test.ts                 ★ new — 8 tests
        └── melody/
            ├── totalBeats.ts                         ★ new — parseMeter,
            │                                              countMeasures,
            │                                              totalBeatsFromMelody
            └── totalBeats.test.ts                    ★ new — 16 tests
```

★ = files created or modified in this session.

**Git status:** clean. `main` at `0587cdc`. `origin/main` matches.

**Memory updates this session:** none. `feedback_autonomy.md` and
`project_zpevnik.md` still apply.

**Reproduction commands** (unchanged):

```bash
# Pipeline tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 137 passed; ruff clean; mypy clean.

# App tests + types
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test
npx tsc --noEmit
# expect: 113 passed; tsc clean.

# Reader
cd /Users/ondrej.maxa/Projects/zpevnik/app
lsof -i :8081 2>/dev/null
npx expo start --web --port 8081

# Reviewer
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/
```
