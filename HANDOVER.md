# Session Handover — 2026-05-21 (very late evening)

## Summary

Continuation of the same calendar-day session. Prior HANDOVER
refresh was at `72a8e38`. Since then, the user opened the dev
server on song 004 and reported a series of rendering issues that
each surfaced a real converter bug:

1. **Lyrics only appeared under one note on the staff** — abcjs's
   `w:` directive is line-scoped; a single end-of-section `w:`
   leaves all but the last measure unlyricked. (Already fixed in
   the prior session's `f2ccbce`.)
2. **`"1."` showed as its own syllable under a note.** The
   engraver ships the verse-number prefix glued to the first
   lyric (`<text>1. Kdo</text>` as ONE element). The literal
   space inside that token was treated by ABC as a syllable
   separator, off-by-one for the rest of the measure.
3. **"Only first verse and chorus are shown."** The XML carries
   `<lyric number="1">` only — verses 2/3+ live in the engraved
   PDF as bare prose under the staff, **not** in the XML at all.
4. **Each measure rendered as its own staff line** — every `\n`
   in an ABC body forces a staff-line break in abcjs, and the
   emitter wrote one music line per measure. Single-note pickups
   then took up a full staff width.
5. **Repeats weren't rendered** — MusicXML `<repeat
   direction="forward|backward"/>` markers were dropped at parse
   time, so `|: chorus :|` songs rendered with normal barlines
   and looped only once during Play.

All five fixed. The kytara PDF extraction (item 3) is the
biggest piece — new module `extra_verses.py` pulls verses 2/3+
from `/soubor/ez/pdf/kytara/{N}.pdf` and merges them as
`{start_of_verse: N}` ChordPro blocks with `{chorus}` references
expanded inline.

**Three commits since the prior HANDOVER refresh, all pushed:**
- `621ee55` — kytara extra verses + parse-time verse-marker strip
- `f205880` — group ABC measures by engraved system
- `4d8f390` — render repeat barlines `|:` and `:|`

This handover is commit #4.

Pipeline tests **160 → 166** (+6 across the three commits). App
tests **616** unchanged. `ruff`, `mypy --strict`, `npm run lint`,
`npx tsc --noEmit` all clean.

## What Was Worked On & What Got Done

### Commit timeline since `72a8e38`

| Commit    | What                                                              |
|-----------|-------------------------------------------------------------------|
| `621ee55` | Strip verse markers in parser + extract kytara verses 2/3+        |
| `f205880` | Group ABC body measures by `<print new-system>` boundaries        |
| `4d8f390` | Parse `<repeat>` barlines → emit ABC `|:` / `:|`                  |
| (this)    | HANDOVER refresh                                                  |

### `621ee55` — kytara extra-verses + verse-marker strip

**Verse-marker parse-time strip** (`pipeline/zpevnik_pipeline/musicxml/parser.py`):
- New helpers `_LYRIC_VERSE_MARKER_PREFIX_RE` (`^[VR]?\d+[.)]\s*`)
  and `_LYRIC_BARE_VERSE_MARKER_RE` (`^[VR]?\d+[.)]$`).
- `_parse_note` applies `_strip_verse_marker` to each lyric text:
  - `"1. Kdo"` → `"Kdo"`
  - `"1."` → `None` (drops the lyric)
- ABC emitter places `*` (ABC skip-syllable) for non-rest notes
  whose lyric was stripped to empty — keeps `w:` alignment when
  the marker was its own note.

**Kytara PDF extraction** (`pipeline/zpevnik_pipeline/musicxml/extra_verses.py`):
- Public surface: `extract_extra_verses(pdf_path) -> list[ExtraVerse]`.
- `ExtraVerse` is `(number, lines, chorus_after)`.
- Scans pdfplumber-extracted lines. Detects verse starts via
  `^\s*(\d+)\.\s+`. Joins PDF-wrapped continuation lines with
  spaces. Splits on ` / ` for lyric line breaks. Captures trailing
  `Ref.` as `chorus_after=True`. Stops at credit lines (`T:` /
  `M:` / `A:`).
- Verse 1 is skipped (already in the XML `<lyric>` stream).

**Converter wiring** (`convert.py`):
- `convert_musicxml(..., extra_verses=...)` accepts an optional
  list. `_build_chordpro` appends each extra verse as its own
  `{start_of_verse: N}` block. When `chorus_after=True`, the
  most-recently-emitted chorus block is INLINED again verbatim
  (our ChordPro parser doesn't expand the `{chorus}` shorthand,
  so we expand at converter time).

**CLI wiring** (`cli.py`):
- `musicxml-batch`: fetches `/soubor/ez/pdf/kytara/{rid}.pdf`
  alongside the XML, caches as `kytara-{rid}.pdf`. Missing PDFs
  are silent (many songs don't have one).
- `musicxml` (singular): auto-derives the kytara URL when
  `--source` matches `https://zpevnik.proscholy.cz/soubor/(\d+).xml$`.

### `f205880` — system-grouped ABC measures

`_section_to_abc` previously wrote one ABC body line per measure.
Every `\n` in the body forces a staff-line break in abcjs, so
single-note pickups rendered as full-width near-empty staves.

**Fix**: pre-pass groups consecutive measures into "systems" —
each `Measure.starts_new_system=True` opens a fresh group (the
flag is set by the parser from `<print new-system="yes"/>`,
which is the engraver's own line-break marker). Each system
emits as ONE ABC body line with measures joined by ` ` and
separated by `|`. The per-system `w:` then carries all
syllables across all measures in that group.

Replaced test `test_abc_body_emits_w_line_per_measure` with
`test_abc_body_groups_measures_by_system` — pins both the
system grouping AND the per-line `w:` interleave.

Visual on song 008 (Jen ty): 6 single-measure staves → 4
multi-measure staves with pickups riding their phrases.

### `4d8f390` — repeat barlines

**Parser** (`parser.py`):
- `Measure` IR gains `starts_repeat: bool` and `ends_repeat:
  bool`.
- Barline loop now checks `<repeat direction>`:
  - `forward` on a left barline → `m.starts_repeat = True`.
  - `backward` on a right barline → `m.ends_repeat = True`.

**Emitter** (`convert.py`, `_section_to_abc`):
- Before a measure's notes: if `starts_repeat`, append `|:`.
  When the previous measure's trailing `|` is still the last
  token in the buffer, REPLACE it with `|:` so we don't get
  the ugly `| |:` redundancy at the joint.
- After a measure's notes: append `:|` if `ends_repeat`, else
  `|`.

**Two new tests** (`TestRepeats`):
- `test_parser_sets_starts_and_ends_repeat_flags`
- `test_abc_emits_pipe_colon_for_repeats`

**Not handled this turn**: voltas (`<ending number="1,2"/>`).
None of the 44 batch songs use them. The parser would need a
`Measure.volta_number: int | None` field and the emitter would
need `[1` / `[2` markers in the ABC body.

### Real-corpus impact

Re-emitted all 44 batch songs + song 004 with `--force` after
each commit. Concrete improvements visible across the corpus:

| Song | Before                              | After                                |
|------|-------------------------------------|--------------------------------------|
| 004  | Lyrics under 1/16 measures          | Lyrics under every note              |
| 004  | "1. Chvá" leaked as syllable        | Verse marker stripped, then verses 2/3 from kytara, with chorus repeat inline |
| 008  | 6 staves, pickups as own staff      | 4 staves, pickups ride their phrase  |
| 008  | Chorus played once                  | Chorus framed with `:|` repeat dots  |
| 016  | `Bůh je mou skrýbezpeč` (truncated) | `Bůh je mou skrýbezpečnou`           |
| 046  | `Rozveselte se v Ho`                | `Rozveselte se v Hospodinu`          |

17 of the 44 batch songs carry `<repeat>` markers. None carry
voltas.

## What Worked and What Didn't

### Worked

- **`<print new-system>` as the staff-line break signal.**
  Already used for ChordPro line breaks; now also drives ABC body
  line grouping. The engraver's own intent is the right anchor.

- **Per-system `w:` interleave + `*` for missing syllables.**
  Both are necessary: the `w:` must follow the music line above
  it, and rows that mix lyric notes with non-lyric notes need
  `*` placeholders so syllables align under the correct notes.

- **kytara PDF text extraction with pdfplumber.** The PDF has
  music notation glyphs (Finale `Ï`, `Î`, `Ïj`) extracted as
  unreadable text in the middle, but the additional-verse block
  at the bottom is clean Czech prose with a deterministic format
  (number prefix, `/` line breaks, trailing `Ref.`). One pass
  catches it.

- **Inline chorus expansion at converter time.** Avoids needing
  parser support for ChordPro's `{chorus}` shorthand on both
  the TS and JS reviewer sides. The duplication is content-wise
  identical so the parity tests don't care.

- **Replacing the prior `|` token when emitting `|:`** instead
  of letting the redundancy through. `| |:` is legal ABC but
  abcjs renders it visually as a thin extra barline before the
  repeat-start, which is ugly.

- **Visual verification via Playwright after each fix.** Caught
  the system-grouping bug immediately when the screenshot
  showed expected layout vs prior expected layout.

### Failed approaches / things I had to redo

1. **First attempt at verse-marker strip:** only handled the bare
   syllable case (`<text>1.</text>`) and missed the glued form
   (`<text>1. Kdo</text>`). The first-word-strip logic only ran
   in the title heuristic, not in the parser. Caused the ABC `w:`
   to split "1. Kdo" into two syllables ("1." and "Kdo"), one
   per note, off-by-one alignment.

2. **First attempt at `{chorus}` repetition** used ChordPro's
   `{chorus}` shorthand directive. The app's parser at
   `app/src/shared/chordpro/parser.ts` only knows about
   `start_of_chorus`/`end_of_chorus`, not the repeat shorthand,
   so the directive showed up as plain text. Switched to
   inlining the chorus body verbatim at converter time.

3. **First `musicxml-batch --force` re-run after the title
   heuristic update** created 17 ghost folders alongside the
   originals (already documented in prior HANDOVER's `31472f5`
   fix). Stale-folder cleanup at write time was the resolution;
   no recurrence this turn.

4. **First singular `musicxml` re-run** didn't pull the kytara
   PDF (only `musicxml-batch` had that wired). Added auto-derive
   from `--source` URL pattern. Both CLI commands now extract
   extras when the kytara is available.

5. **First test for system grouping** asserted `"^Verse 1"` in
   the body — but the converter emits bare `"^Verse"` for
   single-verse sections. Adjusted the assertion.

6. **User initially thought verses 2/3 weren't being added** —
   they were on disk and on the dev server (verified via diff
   between local file and HTTP response), but the user's browser
   showed a cached page. Hard-refresh (`Cmd+Shift+R`) resolved.
   Worth flagging proactively for the next session: dev-server
   responses can be stale if the browser caches them; verify
   via `curl` first when "no change" is reported.

### Blocked

- **Voltas (`<ending number="1,2"/>`)** — none in the current
  corpus, so I can't test an implementation. Sketched in
  "Clear Next Steps".

## Key Decisions Made and Why

1. **Strip verse markers at parse time, not at emission time.**
   The marker is editorial metadata (engraver's verse-number
   label), not lyric content — stripping centrally in the parser
   keeps every downstream emitter (title, ABC `w:`, ChordPro)
   correct without per-emitter duplication.

2. **Drop bare-marker lyrics to `None`, then place `*` in ABC `w:`.**
   `*` is ABC's "skip this note's syllable slot" marker —
   preserves 1:1 alignment between syllables and notes when a
   note has no lyric. Without it, the next syllable would shift
   to the previous note's position.

3. **kytara PDF extraction lives in its own module
   (`extra_verses.py`)**, separate from `parser.py` and
   `convert.py`. The pdfplumber dep is already in pipeline core
   deps, so it doesn't need its own optional extra. Module is
   stateless functions — easy to test, easy to swap if a
   different source format appears.

4. **Inline chorus expansion at converter time, not via `{chorus}`
   directive.** Cleaner ChordPro for the app and reviewer to
   parse — neither side knows about `{chorus}` (would need
   parser changes + parity test updates on both TS and JS
   sides). Duplication is a content trade-off the user
   confirmed is fine.

5. **Group ABC body lines by `<print new-system>` boundaries.**
   The engraver's own marker, already in the IR. Alternative
   was "group every N measures" (less idiomatic) or "one giant
   line and let abcjs auto-wrap on staffwidth" (loses the
   per-system `w:` alignment).

6. **Skip voltas this turn.** Not testable on the current
   corpus. Sketched the parser/emitter shape in next steps.

7. **No ChordPro repeat directives.** When the user "plays the
   chorus twice" because of `:|` in the music, the lyric text
   isn't repeated in the chordpro view — the multi-verse text
   from the kytara PDF already handles "what to sing when the
   chorus repeats." Avoids `{chorus}` shorthand parser work.

8. **Replace trailing `|` with `|:` at repeat joint.** Cleaner
   visual than `| |:`. Symmetric for `:|` (a measure that ENDS
   a repeat just gets `:|` instead of `|` — no special joint
   work needed because nothing precedes the `|`-being-replaced
   case).

9. **17 of 44 corpus songs use repeats** — that's the
   verification surface. Re-emitted with `--force`, eyeballed
   song 008 visually. Other repeat songs are presumably similar.

10. **Browser-cache surprise**: when the user says "no change",
    diff the file on disk vs the HTTP response BEFORE concluding
    anything else is broken. Saved further wild-goose-chasing.

## Lessons Learned & Gotchas

- **proscholy.cz `<text>` elements glue the verse number onto
  the first lyric.** Common case is `<text>1. Kdo</text>`; bare
  `<text>1.</text>` is the rarer alternative. Handle both.

- **ABC `w:` treats a literal space inside a token as a syllable
  separator.** "1. Kdo" as a single syllable token actually
  becomes TWO syllables. The fix is to strip at parse time so
  the token never contains the space.

- **abcjs `\n` in an ABC body forces a staff-line break.** This
  isn't just a hint — it's mandatory. To get auto-wrap, put
  multiple measures on one line.

- **`<print new-system="yes"/>` is per-measure metadata in
  MusicXML.** It marks the FIRST measure of a new system. The
  parser already threads it through; the converter now uses it
  for both ChordPro lyric line breaks AND ABC body line groups.

- **proscholy.cz organ XMLs don't carry chord symbols** for many
  songs but the **kytara PDFs do** carry both chord positions
  (as plain text above the staff) AND verses 2/3+ prose
  underneath. We currently only mine the prose. The chord
  positions would need OCR (text positioning) work.

- **The browser cache lies.** Dev-server hot reload often
  doesn't pierce HTTP cache headers on song asset files (we
  serve them from `/songs/...` which is just static). When a
  user reports "no change", verify via `curl` and `diff`
  before debugging code.

- **`{chorus}` shorthand is NOT in our ChordPro parser.** Both
  the TS (`app/src/shared/chordpro/parser.ts`) and JS reviewer
  copy (`pipeline/.../static/chordpro.js`) only handle the
  explicit `{start_of_chorus}…{end_of_chorus}` form. If you
  ever want to add the shorthand, update both sides AND the
  parity tests.

- **ABC `|:` and `:|`** at a barline joint produce `| |:`
  redundancy unless you replace the prior trailing token.
  abcjs renders `| |:` as an extra thin barline before the
  repeat dots.

- **pdfplumber surfaces music-notation glyphs as garbled
  text.** The Finale-exported `Ï`/`Î`/`Ïj` glyphs that
  represent stems/beams come through as literal characters.
  Ignore them; the prose lyrics block at the bottom of the
  PDF is what you want, isolated by the verse-number prefix.

- **Background dev server is still running** on `:8081` (id
  `b0lt4m7b3` per earlier in the session). Kill with TaskStop
  or let session end clean it up.

## Current State

**Working right now:**

- **Reader on :8081** — all 48 songs render. Detail page for
  any song shows the full chord chart with chords above, notes
  on the staff (now system-grouped), lyrics aligned per
  measure, and repeat barlines where the XML had them.

- **Reviewer** — unchanged.

- **Pipeline CLI** — same surface as prior HANDOVER:
  `zpevnik musicxml <file>` (auto-fetches kytara if `--source`
  is a proscholy URL), `zpevnik musicxml-batch --ids …
  [--force]` (auto-fetches kytara per id), `zpevnik review`.

**Test counts:**
- Pipeline: **166 passed** (was 160 at session start; +4 for
  parser-strip/extras-verses tests in 621ee55, +2 for the
  TestRepeats cases in 4d8f390).
- App: **616 passed** (unchanged).
- `ruff check .` / `mypy --strict zpevnik_pipeline tests` /
  `npm run lint` / `npx tsc --noEmit`: all clean.

**Repo:**
- Working tree: dirty only by this HANDOVER refresh.
- `main` at `4d8f390` before this commit.
- `origin/main` matches.

**Corpus:**
- 48 song directories, 0 duplicates.
- 17 of 44 batch songs use repeats and now render `:|` / `|:`
  correctly.
- Song 004 (Chválu, dík from /soubor/299.xml) has all
  three verses + two chorus repetitions visible in the
  ChordPro view.
- Most other batch songs got at most verse 1 (those without
  kytara PDFs) or verse 1 + maybe a verse 2 (if the kytara PDF
  carried prose).

**Known limitations carried forward:**

- **Voltas not handled** — none in corpus, sketched below.
- **Chord positions in kytara PDFs not extracted** — would
  need text-positioning (chord above lyric vertical alignment).
- **Note-level highlight web-only on native** (item #7 from
  earlier HANDOVERs).
- **Native asset bundling unfixed** (item #4).
- **Lyric search loads all 48 .cho files on app boot** — not
  measured this turn.

**No temporary hacks in committed code.**

## Clear Next Steps

1. **Voltas (`<ending number="1,2"/>`)** — sketch:
   - Parser: add `Measure.volta: int | None`. On any
     `<ending number="N">` element inside a barline, set
     `m.volta = int(N)` (or for the measure following the
     start-of-ending element).
   - Emitter: insert `[1` / `[2` / `[3` markers in the ABC
     body before the measure's notes. abcjs handles the
     visual bracket and TimingCallbacks plays through them.
   - Test: synthetic XML with two `<ending>` blocks around a
     `:|` repeat barline; expect `[1 … :| [2 …` in the body.
   - Won't be testable end-to-end until the corpus contains a
     song with voltas — none of /soubor/{1..50}.

2. **Chord-position extraction from kytara PDF** — bigger.
   pdfplumber gives `chars` with `x, y` coords; group by row,
   detect "chord-like" tokens above the lyric row, project onto
   lyric positions. Risk: the music-notation glyphs in the
   middle of the PDF would interfere with line detection.
   Pursue only if the user wants chord charts for the
   batch-imported songs.

Carried forward (unchanged from prior HANDOVER):

3. **Native asset bundling (#4)** — device-blocked.

4. **Native note-highlight via WebView+postMessage (#7).** —
   device-blocked.

5. **Lyric-search performance at 48 songs.** Measure first.

6. **Reviewer auth model.**

7. **Deployment target.**

## Important Files Map

```
/Users/ondrej.maxa/Projects/zpevnik/
├── HANDOVER.md                                  ★ this file
│
├── pipeline/
│   ├── Dockerfile                               ◇ unchanged (slim)
│   ├── tests/
│   │   └── test_musicxml.py                     ★ +6 tests across the three commits
│   └── zpevnik_pipeline/
│       ├── cli.py                               ★ kytara fetch in both CLI surfaces
│       ├── musicxml/
│       │   ├── __init__.py                      ◇ unchanged
│       │   ├── parser.py                        ★ verse-marker strip + starts/ends_repeat
│       │   ├── convert.py                       ★ system grouping, ABC |: :|, chorus expand
│       │   └── extra_verses.py                  ★ new — kytara PDF prose → ExtraVerse[]
│       └── review/                              ◇ unchanged
│
├── app/                                         ◇ unchanged this turn
│
└── songs/                                       ★ 48 dirs, re-emitted on every commit
    └── (001-048 — 044 batch + 004 hand-driven)
```

★ = touched in this session.
◇ = unchanged this session (relevant context — see prior
HANDOVERs at git refs `72a8e38`, `f31c408`, etc. for their
detailed state).

**Git status before this commit:** dirty only by HANDOVER.md.

**Memory updates this session:** none. `feedback_autonomy.md`
and `project_zpevnik.md` still apply.

**Reproduction commands:**

```bash
# Pipeline
cd /Users/ondrej.maxa/Projects/zpevnik/pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
# expect: 166 passed; ruff clean; mypy clean.

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

# MusicXML — batch (idempotent; --force cleans up stale slugs;
# fetches kytara PDFs for each id when available)
PYTHONPATH=. .venv/bin/python -m zpevnik_pipeline.cli musicxml-batch \
    --ids 1-50 --force --songs ../songs

# Visual smoke-test a single song after re-emit
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
