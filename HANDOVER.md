# Session Handover — 2026-05-21 (overnight)

## Summary

Continuation of the same calendar-day session. Prior HANDOVER
refresh at `7f0f04a` covered the kytara extra-verses extraction,
the system-grouped ABC body, and `|:` / `:|` repeat barlines.

Since then, **one commit**: a small but real ABC alignment fix
the user spotted on song 008. The proscholy.cz XML ships a
single `<text>„V Bo</text>` on a single note (lyric with a
literal space inside). My ABC `w:` emitter passed it through
verbatim, but ABC uses space as a syllable separator — the
single XML lyric was split across two notes, shifting the rest
of the line off-by-one.

Fix: escape literal spaces in `w:` syllable tokens with `~`,
which is ABC's "space within a single syllable" marker. The
token stays attached to one note; renders with a visible space.

**One commit since the prior HANDOVER refresh, pushed:**
- `b59e743` — escape `' '` → `'~'` in `_syllable_for_w_line`

This handover is commit #2 after that.

Pipeline tests **166 → 167** (+1 covering the ~-escape). App
tests **616** unchanged. `ruff`, `mypy --strict`, `npm run lint`,
`npx tsc --noEmit` all clean.

## What Was Worked On & What Got Done

### Commit timeline since `7f0f04a`

| Commit    | What                                                                  |
|-----------|-----------------------------------------------------------------------|
| `b59e743` | Replace literal spaces with `~` in ABC `w:` syllable tokens          |
| (this)    | HANDOVER refresh                                                      |

### `b59e743` — ~-escape in ABC `w:`

**Bug** (`pipeline/zpevnik_pipeline/musicxml/convert.py`,
`_syllable_for_w_line`):
- Some proscholy.cz exports ship multi-token lyric texts on
  a single note: `<text>„V Bo</text>`, `<text>1. Mno</text>`,
  etc.
- ABC's `w:` directive treats a literal space as the syllable
  separator. The verbatim pass-through emitted `w: … „V Bo- hu …`
  → abcjs read this as `„V`, `Bo-`, `hu` — three separate
  syllables anchored to three consecutive notes. Off-by-one
  shift for the rest of the measure.

**Fix**:
```python
escaped = text.replace(" ", "~")
if syllabic in ("begin", "middle"):
    return escaped + "-"
return escaped
```
ABC `~` renders as a literal space but doesn't advance to the
next note. `„V~Bo-` now sits under one note, with the trailing
`-` joining "hu" onto the same word as before.

**Side note**: the `1. Mno` glue is already stripped at parse
time by the verse-marker logic (commit `621ee55`), so that
particular pattern doesn't actually hit this code path — but
the user-visible `„V Bo` on song 008 did.

**Test**: `TestLyricSpacesInsideSyllable.test_space_in_lyric_text_becomes_tilde_in_w_line`
emits the synthetic two-note XML and asserts `w: „V~Bo- hu`
ends up in the body (and `"„V Bo-"` does NOT).

**Re-emit**: `musicxml-batch --ids 1-50 --force` + singular
`musicxml` for song 004. Visual on song 008 confirms the bottom
staff's `„V Bo-hu` now anchors to the first note and the rest
of the line aligns behind it.

**ChordPro untouched**: the lyric body of song.cho passes
through with literal spaces because ChordPro has no special
meaning for `' '` in lyric text — only `[…]` brackets are
parsed.

## What Worked and What Didn't

### Worked

- **`~` as the ABC literal-space marker.** Standard ABC. abcjs
  renders it as a visible space without breaking the syllable.
- **Per-emitter fix.** Only the `w:` path needs the escape;
  the ChordPro body emitter is unaffected because its lyric
  text doesn't have a space-as-separator convention.
- **Tight test on the exact bug shape.** The user's `„V Bo`
  example is preserved verbatim in the test so future
  refactors that lose the `~`-escape will fail loudly.

### Failed approaches / things I had to redo

None this turn — clean single-edit fix.

### Blocked

- **Voltas** still not testable (none in the 44-song corpus).
- **Other XML-text-with-spaces edge cases** — only `„V Bo` is
  in the current corpus. If a future song ships `<text>foo bar
  baz</text>` (three words on one note), the same `~`-escape
  handles it transparently (`foo~bar~baz` → space, space).

## Key Decisions Made and Why

1. **Escape only on the `w:` path, not on ChordPro emission.**
   ChordPro lyric body is verbatim text; literal spaces there
   are fine. Surgically narrow change keeps the parity-tested
   reviewer JS modules unaffected.

2. **`~` over alternative ABC encodings.** ABC also accepts
   underscore `_` for "blank syllable" but it's a different
   semantic (linking syllable across multiple notes). `~` is
   exactly "literal space inside ONE syllable" — what the
   source data is communicating.

3. **No XML side-channel.** Could have hand-tuned the parser
   to split multi-word `<text>` into separate syllables — but
   the XML's `<syllabic>begin</syllabic>` says it IS one
   syllable. The engraver's intent (single note, single
   syllable, displayed with a space) is what the `~` escape
   preserves.

## Lessons Learned & Gotchas

- **ABC `w:` uses space as a syllable separator.** When the
  source data carries spaces inside a single syllable text
  (Czech engraver convention: `„V Bo`, `1. Mno`), the `~`
  escape is the right tool. Same trap exists for the title
  heuristic and verse-marker handling, both already addressed
  in prior commits.

- **proscholy.cz songs use the low quote `„`** at the start of
  quoted speech (Czech convention). It's UTF-8 0xE2809E,
  shows up as `„` everywhere and is harmless — just visually
  distinct from `"` in the song.cho output.

- **Browser cache STILL bites.** From the prior refresh: when
  the user reports "no change", diff disk vs HTTP response
  before debugging code. Reflected in HANDOVER's reproduction
  commands.

- **Dev server still running** in the background (id
  `b0lt4m7b3`); kill via TaskStop or session end.

## Current State

**Working right now:**

- **Reader on :8081** — all 48 songs render. Detail page for
  any song shows the full chord chart with chords above, notes
  on the staff (system-grouped, repeat barlines visible),
  lyrics aligned per measure (now also for multi-word-per-note
  lyric tokens).

- **Reviewer** — unchanged.

- **Pipeline CLI** — same surface as prior HANDOVERs:
  `zpevnik musicxml <file>` (auto-fetches kytara if `--source`
  is a proscholy URL), `zpevnik musicxml-batch --ids …
  [--force]` (auto-fetches kytara per id), `zpevnik review`.

**Test counts:**
- Pipeline: **167 passed** (was 166 at this commit's start; +1
  for `TestLyricSpacesInsideSyllable`).
- App: **616 passed** (unchanged).
- `ruff check .` / `mypy --strict zpevnik_pipeline tests` /
  `npm run lint` / `npx tsc --noEmit`: all clean.

**Repo:**
- Working tree: dirty only by this HANDOVER refresh.
- `main` at `b59e743` before this commit.
- `origin/main` matches.

**Corpus:**
- 48 song directories, 0 duplicates.
- Re-emitted post-fix; songs with multi-word lyric tokens
  (only song 008 in the current corpus, per `„V Bo`) now
  align correctly.

**Known limitations carried forward:**

- **Voltas (`<ending number="1,2"/>`)** not handled — none in
  corpus to test against. Sketched in prior HANDOVER.
- **Chord positions in kytara PDFs not extracted** — would
  need text-positioning work. Not blocked, just open.
- **Note-level highlight web-only on native** (item #7).
- **Native asset bundling unfixed** (item #4).
- **Lyric search loads all 48 .cho files on app boot** — not
  measured this turn.

**No temporary hacks in committed code.**

## Clear Next Steps

Carried forward from prior HANDOVER, unchanged:

1. **Voltas (`<ending number="1,2"/>`)** — sketch:
   - Parser: `Measure.volta: int | None`. Set from
     `<ending number="N">` inside a barline.
   - Emitter: `[1` / `[2` / `[3` markers in the ABC body
     before the measure's notes. abcjs renders the bracket;
     TimingCallbacks plays through them.
   - Test: synthetic XML with two `<ending>` blocks around a
     `:|` repeat barline.
   - Not testable end-to-end until the corpus contains a song
     with voltas.

2. **Chord-position extraction from kytara PDF** — open. Would
   give chord charts to songs whose XML lacks `<harmony>`.

3. **Native asset bundling (#4)** — device-blocked.

4. **Native note-highlight via WebView+postMessage (#7).** —
   device-blocked.

5. **Lyric-search performance at 48 songs.** Measure first.

6. **Reviewer auth model / deployment target.** Deployment-
   context decisions.

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                                  ★ this file
│
├── pipeline/
│   ├── Dockerfile                               ◇ unchanged (slim)
│   ├── tests/
│   │   └── test_musicxml.py                     ★ +1 test this turn (~-escape)
│   └── zpevnik_pipeline/
│       ├── cli.py                               ◇ unchanged this turn
│       ├── musicxml/
│       │   ├── __init__.py                      ◇ unchanged
│       │   ├── parser.py                        ◇ unchanged this turn
│       │   ├── convert.py                       ★ _syllable_for_w_line: ~-escape
│       │   └── extra_verses.py                  ◇ unchanged this turn
│       └── review/                              ◇ unchanged
│
├── app/                                         ◇ unchanged this turn
│
└── songs/                                       ★ re-emitted (44 batch + 004)
```

★ = touched in this turn.
◇ = unchanged this turn (relevant context — see prior HANDOVER
refreshes at `7f0f04a`, `72a8e38`, `f31c408`, `a9b75a6` for
their detailed state).

**Git status before this commit:** dirty only by HANDOVER.md.

**Memory updates this session:** none. `feedback_autonomy.md`
and `project_zpevnik.md` still apply.

**Reproduction commands** (unchanged from prior refresh):

```bash
# Pipeline
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 167 passed; ruff clean; mypy clean.

# App
cd /Users/ondrej.maxa/Projects/zpevnik/app
npm test && npm run lint && npx tsc --noEmit
# expect: 616 passed; eslint clean; tsc clean.

# Reader
cd /Users/ondrej.maxa/Projects/zpevnik/app
lsof -i :8081 2>/dev/null
npx expo start --web --port 8081

# Reviewer (slim entrypoint)
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.review --songs ../songs

# MusicXML — singular (auto-fetches kytara when --source is a proscholy URL)
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.cli musicxml \
    /tmp/299.xml --title "Chválu, dík" --number 299 \
    --source "https://zpevnik.proscholy.cz/soubor/299.xml" \
    --id 004 --force --songs ../songs

# MusicXML — batch (idempotent; --force cleans up stale slugs)
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.cli musicxml-batch \
    --ids 1-50 --force --songs ../songs

# Visual smoke-test a single song
/Users/ondrej.maxa/Projects/zpevnik/pipeline/.venv/bin/python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 1280, 'height': 1600})
    page.goto('http://localhost:8081/song/008', wait_until='networkidle')
    page.wait_for_timeout(3000)
    page.screenshot(path='/tmp/song-008.png', full_page=True)
    b.close()
"
```

**When the user reports "no change" after a converter update,
diff first**:

```bash
diff <(cat /Users/ondrej.maxa/Projects/zpevnik/songs/<id-slug>/song.cho) \
     <(curl -s http://localhost:8081/songs/<id-slug>/song.cho)
# Identical → it's a browser cache issue (Cmd+Shift+R).
# Different → server-side problem worth debugging.
```
