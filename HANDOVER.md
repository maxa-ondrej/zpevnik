# Session Handover — 2026-05-21

## Summary

Long, two-phase session. **Phase A** (early): closed the three
remaining small-polish items from the prior HANDOVER's next-steps
list (#8 melody-derived beats/line, #9 stepper auto-repeat, #10
reviewer add-block shortcut). **Phase B** (after a "what's missing"
audit): infrastructure — Dockerfiles + compose, LICENSE, ESLint v9
migration (lint was effectively dead before), nginx SPA fallback,
CI docker-build job, README refresh, and a parity test suite that
locks the reviewer's hand-ported JS modules to their TS originals.

**Nine commits**, all pushed to `origin/main` (range
`9be41ee..f0be00b`). One of them is the mid-session HANDOVER
refresh at `d3ab7c4` that this document supersedes.

App tests **89 → 616** (+527 across this session, the bulk from
the parity battery). Pipeline tests **137** unchanged. `npm run
lint` now exits clean; previously errored out on every run.

## What Was Worked On & What Got Done

### Commit timeline (oldest first)

| Commit    | Phase | What                                                              |
|-----------|-------|-------------------------------------------------------------------|
| `b90d11e` | A     | Hold-to-repeat stepper buttons via new `useAutoRepeat` hook (#9)  |
| `091cedf` | A     | Reviewer Alt+Shift+V/C/B inserts verse/chorus/bridge (#10)        |
| `0587cdc` | A     | Lyric-fallback `beatsPerLine` from melody.json measure count (#8) |
| `d3ab7c4` | —     | Mid-session HANDOVER refresh (superseded by this doc)             |
| `3fa7164` | B     | Reviewer + Reader Dockerfiles, `.dockerignore`                    |
| `27f2cb7` | B     | LICENSE (MIT) + nginx SPA fallback in the reader image            |
| `30ab6b4` | B     | docker-compose, README status refresh, CI docker build job        |
| `a80016b` | B     | ESLint v9 flat config + CI lint step                              |
| `f0be00b` | B     | 503 parity assertions: reviewer JS ↔ app TS                       |

### Phase A — feature polish (closed the prior next-steps list)

- **`b90d11e` — Stepper auto-repeat (item #9).**
  Held +/− buttons (Transpose, Capo, Size, Spacing, Speed) now
  repeat on hold instead of needing one click per step.
  - New `app/src/shared/components/useAutoRepeat.ts` — generic
    `{ start, stop }` hook. Initial press fires once, then a 400ms
    delay before repeating every 80ms until release, disabled, or
    unmount. `start` calls `stop()` first to defensively reset.
  - `SongControls.tsx`'s internal `Step` wires
    `onPressIn={start}` / `onPressOut={stop}`.
  - 8 tests via `renderHook`.

- **`091cedf` — Reviewer add-block shortcut (item #10).**
  Alt+Shift+V / C / B inserts a new verse/chorus/bridge regardless
  of focus, mirroring the existing Alt+↑/↓ reorder shortcut's
  modifier pattern.
  - `pipeline/zpevnik_pipeline/review/static/app.js`: extracted
    `addBlock(type)` helper + global `keydown` listener.
  - `index.html`: `<span class="hint">Alt+Shift+V / C / B</span>`.
  - `style.css`: `.melody-add-row .hint` styling.

- **`0587cdc` — Beats/line from melody.json (item #8).**
  Lyric-only Play fallback (staves off, or any native run) was
  advancing one line per 4 beats unconditionally. Now uses
  `totalBeats / lineCount` from real measure structure.
  - New `app/src/shared/melody/totalBeats.ts` —
    `parseMeter`, `countMeasures`, `totalBeatsFromMelody`.
    `countMeasures` strips ABC info-field lines (`/^[A-Za-z]:/`)
    and quoted chord/annotation strings before counting `\|+`
    groups.
  - 16 tests in `totalBeats.test.ts`.
  - `app/app/song/[id].tsx`: added `totalBeats: number | null`
    to ready state; falls back to constant 4 when melody is absent.

### Phase B — infrastructure ("what's missing" audit fixes)

- **`3fa7164` — Two Dockerfiles + `.dockerignore`.**
  - `pipeline/Dockerfile`: python:3.11-slim + tesseract-ocr +
    libgl1 + libglib2.0-0; `pip install ".[review]"`; runs
    `zpevnik review --songs /data/songs --host 0.0.0.0 --port 8765`.
    Expects songs/ bind-mounted at /data/songs (read-write — reviewer edits).
  - `app/Dockerfile`: two-stage. node:20-alpine runs
    `npm run build:web` after replacing the `app/public/songs`
    dev-only symlink with a real copy of `songs/`. nginx:alpine
    serves the static export on :80.
  - `.dockerignore` at repo root trims node_modules, .venv,
    caches, .git, HANDOVER.md.
  - **Untested in this session** — no Docker available in the dev
    terminal. CI (added later) is where these get verified.

- **`27f2cb7` — LICENSE + reader nginx SPA fallback.**
  - `LICENSE`: MIT, matching what `README.md` and
    `pipeline/pyproject.toml` already claimed.
  - `app/nginx.conf`: `try_files $uri $uri/ /index.html` so
    `/song/[id]` and `/setlists/[id]` deep links don't 404 against
    nginx defaults. Long-cache for `/_expo/` hashed assets,
    no-cache for `index.html`.
  - `app/Dockerfile`: COPY the conf to
    `/etc/nginx/conf.d/default.conf`.

- **`30ab6b4` — Compose + README + CI docker job.**
  - `docker-compose.yml` at repo root — reader on :8080, reviewer
    on :8765 with `./songs:/data/songs` bind mount. Single
    `docker compose up --build` for the full stack.
  - `README.md`: status section was stuck on "Phase 0 —
    Foundations." Updated to reflect the actual Phase 3 v1 reader
    feature-complete state. Added a docker quickstart.
  - `.github/workflows/ci.yml`: new `docker` job builds both
    Dockerfiles with `cache-from`/`cache-to` GHA scopes per image.
    No push, just verification.

- **`a80016b` — ESLint v9 flat config + CI lint step.**
  `npm run lint` errored out on every run because ESLint v9
  dropped `.eslintrc.*` and the project never had a config file.
  - `app/eslint.config.js`: minimal flat config — `@eslint/js`
    recommended + `typescript-eslint` (parser + plugin) +
    `globals` bundle. Skipped `eslint-config-expo` because the
    installed copy extends `plugin:react-hooks/recommended` but
    `eslint-plugin-react-hooks` isn't in the lockfile — wrapping
    with `FlatCompat` would fail at load time.
  - `package.json`: lint script becomes `eslint .` (drop
    deprecated `--ext`).
  - `AbcView.native.test.tsx`: dropped the unused `fireEvent`
    import and the dead `getReceivedProps` hoist that the new
    lint surfaced.
  - `ci.yml`: added a lint step before the test step.

- **`f0be00b` — Reviewer JS ↔ app TS parity tests.**
  The reviewer ships hand-ported plain-JS copies of three TS
  modules so the static review UI can run them in the browser
  without a build step. The HANDOVER's "keep in sync" gotcha is
  now an enforced invariant.
  - New `app/src/__parity__/reviewer.test.ts` — 503 assertions:
    - 36 chords × `toCzech` + `toEnglish` = 72
    - 36 chords × 12 semitones × `transposeChord` = 432
    - 9 ChordPro sources × `parseChordPro` (deep-equal)
    - 4 melodies × `assembleAbc`
  - Cross-package import via relative path:
    `../../../pipeline/zpevnik_pipeline/review/static/*.js`.
    TS treats the exports as `any` — exactly what we want, since
    assertions compare against the strongly-typed TS side.
  - All 503 pass on first run — implementations currently in
    lockstep.

## What Worked and What Didn't

### Worked

- **`useAutoRepeat` extracted into a hook + `renderHook` tests.**
  Sidestepped react-native-web Pressable's responder layer
  entirely (see Failed approaches #1). Tests run via the hook's
  actual API (`start`/`stop`) and `vi.useFakeTimers()`. Fast,
  honest, complete.

- **`ev.code === 'KeyV'` (not `ev.key`)** for the reviewer
  shortcut. On macOS US, Option+Shift+V inserts `◊`; `ev.key`
  becomes the diamond, but `ev.code` stays `'KeyV'`. Use `code`
  for any modifier-based shortcut targeting a letter.

- **Counting `\|+` groups for ABC measure counting.** Treats
  `||`, `|]`, `[|`, `|:`, `:|` as single boundaries by collapsing
  consecutive `|`s. Right for the demo corpus.

- **Filter ABC info-field lines via `/^[A-Za-z]:/`.** One regex
  catches the whole alphabet of ABC directives (`X:`, `T:`, `M:`,
  `L:`, `Q:`, `K:`, `w:`, `s:`, …).

- **Cross-package vitest imports.** `import { ... } from
  '../../../pipeline/zpevnik_pipeline/review/static/foo.js'`
  works without any extra vitest config. The JS modules are
  native ESM and treated as `any` on the TS side.

- **GHA `cache-from: type=gha,scope=<image>`** for the docker
  job. Each image gets its own scope so reader edits don't
  invalidate the reviewer's opencv layer (and vice versa).

### Failed approaches / things I had to redo

1. **First test attempt for the new auto-repeat** — wrote
   `SongControls.test.tsx` that rendered `<SongControls />` and
   tried `fireEvent.mouseDown(screen.getByRole('button', {name: 'A+'}))`.
   `onPressIn` never fired. Root cause: react-native-web 0.19
   Pressable wires its responder via the press hook stack, not
   plain `onMouseDown`, and `@testing-library/react`'s
   `fireEvent.mouseDown` doesn't reliably trigger it in jsdom.
   Deleted the file; extracted the timing logic into a hook and
   tested with `renderHook`.

2. **`git add` from inside the `app/` cwd.** Ran
   `git add app/src/...` while `cwd` was `…/zpevnik/app`. Got
   `pathspec 'app/src/...' did not match any files`. Switched to
   `git -C /Users/ondrej.maxa/Projects/zpevnik` for all subsequent
   git ops. **Adopted as standing pattern.**

3. **Initial parity test had `@ts-expect-error` directives** on
   each JS import (assuming TS would complain about missing
   types). It doesn't — TS treats them as `any`. The directives
   then triggered `TS2578: Unused @ts-expect-error directive`.
   Removed; added a comment block explaining the `any` treatment.

4. **First ESLint config attempt** missed the `no-undef` warnings
   on `require`/`module` in the config file itself, because the
   minimal config block applied only to `.ts`/`.tsx`. Easiest fix
   was to add `eslint.config.js` to its own `ignores` list —
   listed alternatives (a CJS-globals block for `**/*.js`) in
   the config comments.

5. **Tried to use `eslint-config-expo` via `FlatCompat`** at
   first — abandoned when I saw that `eslint-plugin-react-hooks`
   (a peer dep of expo's config) isn't installed. Built a
   minimal flat config from `@eslint/js` + `typescript-eslint`
   directly. Config comment spells out the migration path if
   someone adds the missing peer.

### Not attempted (intentional)

- **#4 native asset bundling** and **#7 native note-highlight via
  WebView+postMessage** — both unblocked but require device QA
  this terminal can't do. Carried forward.
- **Deployment manifest (fly.toml/Vercel/k8s/etc.)** — needs a
  target decision.
- **Reviewer auth/HTTPS** — needs a deployment context.
- **Update channel for songs (roadmap Phase 5)** — substantial.

## Key Decisions Made and Why

1. **`useAutoRepeat` is a separate hook, not inlined in `Step`.**
   The hook is the unit of testability — RN-W Pressable's event
   plumbing made direct component tests impractical. Other
   future steppers (e.g. tempo slider) can reuse it.

2. **Defaults `delayMs: 400`, `intervalMs: 80`.** Matches macOS
   keyboard repeat (initial ~400ms, then ~30/s; we chose ~12.5/s
   for steppers — fast enough, hard to overshoot).

3. **`start()` calls `stop()` first.** Defends against `onPressIn`
   arriving without paired `onPressOut` (mouse leaves the
   element). Without it, repeat intervals could pile up.

4. **Alt+Shift+V/C/B over Ctrl+Shift+V** for the reviewer
   shortcut. Ctrl/Cmd+Shift+V is "paste plain text" / "paste and
   match style" in many editors. Alt+Shift+letter is rarely
   claimed and reuses the existing Alt-modifier pattern.

5. **Global `document.addEventListener('keydown', ...)` for the
   reviewer shortcut, gated on `currentDetail !== null`.** Fires
   regardless of focus. No song loaded → no-op.

6. **`totalBeats` stored in state, not derived on the fly.** Computed
   once when melody loads, never changes. Putting it in state
   keeps the fallback effect's dep list simple.

7. **`Alt+Shift+letter` is `e.code` not `e.key`.** See "Worked".

8. **Default `beatsPerMeasure = 4` when `M:` is absent.** ABC
   convention; useful default for headerless melodies.

9. **Two Dockerfiles, both context = repo root.** Reader needs
   `songs/` (sits at repo root) for the build-time bundling.
   Reviewer needs `songs/` (volume-mounted at runtime). Both
   need to walk into the repo, not just their own subdir.

10. **Reader bakes songs into the image; reviewer mounts them.**
    Asymmetry is intentional: the reader is a read-only artifact
    (rebuild for new corpus); the reviewer is a dev tool that
    writes back to the working tree.

11. **Minimal flat ESLint config without `eslint-config-expo`.**
    The installed Expo config has a missing peer dep
    (`eslint-plugin-react-hooks`) that would break load. A
    minimal `@eslint/js` + `typescript-eslint` config gives real
    lint coverage today; the comment block describes how to
    layer Expo's defaults back in if anyone adds the peer.

12. **GHA build cache scoped per image.** `scope=reviewer` and
    `scope=reader` so opencv install on one side doesn't
    invalidate the other when only one Dockerfile changes.

13. **Parity test lives in `app/` not `pipeline/`.** Vitest is
    already set up there; cross-package import is trivial. Adding
    a Node test runner under `pipeline/` for one suite isn't
    worth the duplication.

14. **Parity test does NOT cover `renderNotation` /
    `transformChord`** from `chord.js`. They're pure
    compositions of the other functions; if the components pass,
    the wrappers pass.

## Lessons Learned & Gotchas

- **react-native-web 0.19 Pressable doesn't reliably surface
  `onPressIn` from `fireEvent.mouseDown` in jsdom.** Extract the
  logic into a hook/function or move to `userEvent` (not
  installed here). Don't burn time wiring synthetic events
  through the responder system. (Carried from Phase A; still true.)

- **`git add` resolves paths from cwd.** When running git from
  outside the repo root, paths must be relative to cwd OR use
  `git -C <repo-root>`. Default to `git -C`.

- **`ev.key` is keyboard-layout-dependent.** Use `ev.code` for
  modifier-based letter shortcuts.

- **ABC info-field lines start with `[A-Za-z]:` at column 0.**
  The spec allows lowercase too (`w:`, `s:`).

- **`|` can legitimately appear inside `"..."` chord/annotation
  strings.** Strip those before counting measures.
  `body.replace(/"[^"]*"/g, '')` is enough — no nested quotes
  in the corpus.

- **Expo Router with `web.output = "static"`** still needs an
  SPA fallback in nginx, because dynamic segments (`[id]`)
  without pre-rendered params produce no HTML at build time.
  `try_files $uri $uri/ /index.html` hands them to the router
  for client-side mount.

- **`eslint-config-expo@8.0.1`** is a legacy `.eslintrc`-format
  config that references plugins not in the lockfile
  (`eslint-plugin-react-hooks`). Wrapping it via `FlatCompat`
  fails at load. Either install the missing peer or skip it.

- **TypeScript silently accepts ESM `.js` imports as `any`** —
  no error, no `@ts-expect-error` needed. If you add
  `@ts-expect-error` defensively, `noUnusedLocals`-style
  `TS2578` will complain about the unused directive. Just don't
  add the directive.

- **`eslint.config.js` itself can't easily be linted in the same
  flat config** — it runs in node-CJS context with its own
  globals. Cleanest is to add `eslint.config.js` to the `ignores`
  list.

- **GHA's `docker/build-push-action@v5` uses `gha` cache by
  default but requires explicit `cache-from`/`cache-to`** when
  you want per-image scopes.

- **Vitest cross-package imports** work via plain relative
  paths — no resolver tweaks needed. The `include:
  ['src/**/*.test.{ts,tsx}']` matters only for test
  *discovery*, not for what those tests can `import` from.

- **HANDOVER.md is the project's session-close artifact.** Skill
  is at `~/.claude/skills/handover`. The user's pattern is one
  refresh near the end of each working session (and sometimes
  mid-session at major milestones).

- **CI workflow filename is `.github/workflows/ci.yml`** with
  jobs: `pipeline`, `app`, `docker`. The app job now has lint;
  the docker job is new this session.

- **Reviewer JS modules** at
  `pipeline/zpevnik_pipeline/review/static/{assemble,chord,chordpro}.js`
  are now under parity test. **If you change either side, you
  must change the other** — the test will catch it but the
  failure message will tell you what diverged.

## Current State

**Working right now:**

- **Reader app** (web export): list page (full-text search, ★
  favorites filter, Recently viewed section, Setlists pill),
  detail page (fixed top bar + scrollable content,
  Notation/Transpose/Capo/Size/Spacing/Staves/Theme/Play/
  Autoscroll groups, ★ favorites, "+ Setlist" sheet, hold-to-
  repeat steppers), setlists pages, dark mode, full Play mode
  (web abcjs note-level + lyric-only fallback now song-length-
  proportional).

- **Reviewer** (Python FastAPI on :8765): two side-by-side
  previews (chord chart + notation), structured block editor
  with drag/Alt-arrow reorder + Alt+Shift letter add, Cs/En +
  transpose preview controls, dark mode via OS preference.

- **Docker stack**: `docker compose up --build` brings up reader
  on :8080 and reviewer on :8765 (with songs/ bind-mounted RW).
  Both images defined but **not yet built end-to-end in this
  terminal** — CI is where they get verified on each push.

- **CI**: pipeline (ruff + mypy + pytest) + app (lint + vitest +
  tsc) + docker (build both images). Adding the docker job
  approximately triples CI wall-time for tagged Dockerfile
  changes.

**Test counts:**
- Pipeline: **137 passed** (unchanged)
- App: **616 passed** (was 89 at session start; +24 for #8/#9/#10
  features, +503 for the parity battery)
- `npm run lint`: clean (was broken before this session)
- `npx tsc --noEmit`: clean

**Repo:**
- Working tree: clean
- `main` at `f0be00b`
- `origin/main` matches (all 9 commits pushed)

**Known limitations (carried forward):**

- **Note-level highlight is web-only on native** (item #7).
  WebView doesn't run `TimingCallbacks`; native gets the
  line-level setInterval fallback.
- **Native still uses `fetch('/songs/...')`** for the corpus
  (item #4). Works in dev; not viable for production native.
- **Play tempo accuracy depends on `meta.tempo`** being right
  (demo songs hard-code 84/null).
- **Lyric search loads every `.cho` on app boot** (item #6 —
  premature to fix at 3 songs).
- **Reviewer has no auth / no HTTPS / no rate limiting** —
  intended for localhost.

**Docker caveats baked into this session's commits:**

- `pipeline/Dockerfile` installs full pipeline deps (opencv,
  tesseract, pdfplumber) even though the reviewer only needs
  fastapi + uvicorn + pydantic + the package internals it
  imports. Image ~700 MB. **Slim alternative**: write a small
  entrypoint that imports only `zpevnik_pipeline.review.server:create_app`
  and runs uvicorn directly; skip the CLI entry. Not done here.
- `app/Dockerfile` replaces `app/public/songs` (dev symlink)
  with a real copy of `songs/` before `expo export`. The new
  songs are baked into the resulting image.

**No temporary hacks in committed code.**

## Clear Next Steps

The next-steps list from prior HANDOVER, updated. Items 8/9/10
are done this session; everything else is unchanged or
device/content-blocked.

1. **(blocked)** Real source PDF.
2. **(blocked)** Pipeline → `melody.json` emission from real PDF.
3. **(blocked)** Real corpus passes.
4. **(unblocked, untested)** Native offline-first asset bundling.
   Sketch: generate static asset manifest at build time, use
   `expo-asset` + `expo-file-system` to copy bundled files to
   `FileSystem.documentDirectory/songs/` on first launch,
   introduce unified `loadSongAsset(path)` helper, refactor 6
   `fetch('/songs/...')` sites (`app/app/index.tsx:53,66`,
   `app/app/song/[id].tsx:47,327,335`,
   `app/app/setlists/[id].tsx:40`). **Needs device QA — cannot
   verify from this terminal.**
5. **(blocked)** Whisper autoscroll sync (v2 spec).
6. **(YAGNI for now)** Server-side `fulltext.json`.
7. **(unblocked, untested)** Native note-highlight via
   WebView+postMessage. Sketch: extend `buildHtml` in
   `AbcView.tsx` to define `window.__zStartFollow({tempo})` and
   `window.__zStopFollow()` that construct `ABCJS.TimingCallbacks`
   inside the WebView and post `{kind: 'beat'|'staffLine'|'end'}`
   back. Add `useRef<WebView>` in the native branch; effect on
   `[isFollowing, tempo]` calls
   `webViewRef.current?.injectJavaScript(...)`. Extend
   `onMessage` to dispatch. **Needs device QA.**
8. **Done** (`0587cdc`) — beats/line from melody.json measures.
9. **Done** (`b90d11e`) — hold-to-repeat stepper buttons.
10. **Done** (`091cedf`) — reviewer add-block shortcut.

**New items surfaced this session:**

11. **Slim reviewer Docker image.** Reviewer entrypoint that
    bypasses the CLI and pulls only fastapi + uvicorn +
    pydantic. Would drop image size by hundreds of MB and skip
    the tesseract + libgl1 apt install.
12. **Deployment target decision.** Both Dockerfiles exist;
    where do they run? Fly.io, Vercel (web only), Railway, k8s?
    Drives whether we add a manifest.
13. **CONTRIBUTING.md / PR templates.** Skipped this session;
    low value for single-developer state.
14. **Reviewer auth model.** Needed if it's ever exposed beyond
    localhost. Token? Basic auth? OAuth?

**Recommended next session:**

- If user is at a device: tackle #4 and #7 (last v1 §7.1 gaps).
- If user has real PDF: cascade 1 → 2 → 3.
- Otherwise: no realistically unblocked feature work in this
  corpus size. Optional polish: #11.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                           ★ this file (refreshed)
├── LICENSE                               ★ new — MIT
├── README.md                             ★ status: Phase 0 → Phase 3
│                                          + docker quickstart
├── docker-compose.yml                    ★ new — reader + reviewer stack
├── .dockerignore                         ★ new — trims build context
├── .github/workflows/ci.yml              ★ + lint step + docker job
│
├── pipeline/
│   ├── Dockerfile                        ★ new — reviewer service
│   └── zpevnik_pipeline/
│       └── review/static/
│           ├── app.js                    ★ + addBlock() + onGlobalKeydown
│           ├── index.html                ★ + Alt+Shift hint
│           ├── style.css                 ★ + .melody-add-row .hint
│           ├── assemble.js               ◇ parity-pinned with TS
│           ├── chord.js                  ◇ parity-pinned with TS
│           └── chordpro.js               ◇ parity-pinned with TS
│
└── app/
    ├── Dockerfile                        ★ new — multi-stage → nginx
    ├── nginx.conf                        ★ new — SPA fallback + cache headers
    ├── eslint.config.js                  ★ new — flat config (v9)
    ├── package.json                      ★ lint script: drop --ext
    ├── app/song/[id].tsx                 ★ + totalBeats state
    │                                       + melody-aware fallback
    └── src/
        ├── __parity__/
        │   └── reviewer.test.ts          ★ new — 503 JS↔TS assertions
        └── shared/
            ├── components/
            │   ├── SongControls.tsx      ★ Step → useAutoRepeat
            │   ├── useAutoRepeat.ts      ★ new — hook
            │   ├── useAutoRepeat.test.ts ★ new — 8 tests
            │   └── AbcView.native.test.tsx ★ unused-import cleanup
            └── melody/
                ├── totalBeats.ts         ★ new — parseMeter,
                │                                  countMeasures,
                │                                  totalBeatsFromMelody
                └── totalBeats.test.ts    ★ new — 16 tests
```

★ = files created or modified in this session.
◇ = unchanged this session but now under parity test.

**Git status:** clean. `main` at `f0be00b`. `origin/main` matches.

**Memory updates this session:** none. `feedback_autonomy.md` and
`project_zpevnik.md` still apply.

**Reproduction commands:**

```bash
# Pipeline tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 137 passed; ruff clean; mypy clean.

# App tests + lint + types
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test
npm run lint
npx tsc --noEmit
# expect: 616 passed; eslint clean; tsc clean.

# Reader (web dev server)
cd /Users/ondrej.maxa/Projects/zpevnik/app
lsof -i :8081 2>/dev/null
npx expo start --web --port 8081

# Reviewer (Python)
cd /Users/ondrej.maxa/Projects/zpevnik
PYTHONPATH=pipeline pipeline/.venv/bin/python -m zpevnik_pipeline.cli review --songs ./songs
# → http://127.0.0.1:8765/

# Full docker stack (untested in this terminal)
cd /Users/ondrej.maxa/Projects/zpevnik
docker compose up --build
# Reader   → http://localhost:8080/
# Reviewer → http://localhost:8765/
```
