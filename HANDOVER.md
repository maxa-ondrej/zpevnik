# Session Handover — 2026-05-22

## Summary
Continuation of the karaoke-mode build. This session replaced the abcjs-staff cut-out used inside karaoke mode with a **Simply-Sing-style pitch-bar timeline** — horizontal coloured rectangles whose height encodes pitch and width encodes duration, sliding leftward under a fixed playhead while lyric syllables scroll along underneath. That required emitting a structured per-note array (`notes[]`) from the MusicXML pipeline into `melody.json`, threading it through the app data layer, building a new `PitchTimelineView` component, and wiring it into `KaraokeView` while keeping the (now-hidden) `AbcView` mounted so it continues to drive the `TimingCallbacks` that tick the playhead. All app + pipeline tests are green; nothing is committed yet — the working tree is dirty across pipeline source, app source, the new component, and 45 re-emitted `melody.json` files.

## What Was Worked On & What Got Done

### Done in this session
- **Pipeline — emit `notes[]` in `melody.json`** ✅
  - Added `_STEP_TO_SEMITONE`, `_note_to_midi`, `_section_to_notes` in `pipeline/zpevnik_pipeline/musicxml/convert.py`.
  - `_build_melody` now appends `"notes": [...]` to each block alongside the existing ABC `body`.
  - 30 pipeline musicxml tests still pass.
  - Corpus re-emitted in the prior turn via `musicxml-batch --force` (+ targeted re-run for song 004) → 45 `melody.json` files modified, all carrying the new field.

- **App — `MelodyNote` type + optional `notes?` on `Block`** ✅
  - `app/src/shared/melody/assemble.ts` now exports `Syllabic` and `MelodyNote` and adds an optional `notes?: MelodyNote[]` to `Block`. Older melody files without the field still parse.

- **App — `PitchTimelineView` (NEW component)** ✅
  - File: `app/src/shared/components/PitchTimelineView.tsx`.
  - Fixed playhead at `PLAYHEAD_OFFSET_RATIO = 0.3` of container width; strip translates left as `noteIndex` advances.
  - Animated.Value `translateX`, snap-to-note transitions (`Animated.timing` 160 ms).
  - `PX_PER_BEAT = 80`, `BAR_HEIGHT = 14`, `BAR_AREA_HEIGHT = 200`.
  - Y-mapping: `pitchToY(pitch)` linearly maps the song's pitch range onto the bar area; rests pinned to the bottom row.
  - Per-note bar: `accent` if active or past, `borderSoft` if future or rest. Past bars get `opacity: 0.55` so the current bar pops.
  - Lyric row beneath the bars; appends `-` after `begin`/`middle` syllables.

- **App — `KaraokeView` wires the new view** ✅
  - When `abc && notes && notes.length > 0` → render `PitchTimelineView`; mount `AbcView` inside a `styles.hiddenTiming` 0×0 wrapper so its WebView keeps firing `onNoteEvent` / `onFollowEnd`.
  - When only `abc` is present (no per-note array, e.g. an older melody.json that wasn't re-emitted) → fall back to the previous staff-cut-out path.
  - When neither `abc` nor `notes` → fall back to the prev/current/next 3-line lyric strip.

- **App — song page passes `notes` through** ✅
  - `app/app/song/[id].tsx`: state `ready` now carries `melodyNotes`, built once with `melody.blocks.flatMap((b) => b.notes ?? [])`.

- **Verification** ✅
  - `npx tsc --noEmit` clean.
  - `npm run lint` clean.
  - `npm test` → 616/616 passing.
  - `pytest pipeline/tests/test_musicxml.py` → 30/30 passing.

### Carried over from previous session (in context only — already committed before /clear)
- Karaoke mode added as a third `viewMode` tri-state (zustand v1→v2 migration).
- Per-syllable cursor — `KaraokeLine` tokenises on `(\s+|-)`, ChordPro emits hyphens after `begin`/`middle` syllables.
- "Show only the active staff line" cut-out built (now superseded inside karaoke; remains available as the `viewMode: 'staves'` view).

### Pending / not yet done
- **Commit** — 50 files dirty (4 source files + 1 new component + 45 melody.json). User has not asked to commit yet.
- **Real-device test** — pitch timeline only verified via tsc/lint/tests; not yet eyeballed on the iPhone Expo Go session.
- **Smooth scrolling** — currently snap-to-note (160 ms tween). Likely follow-up: rAF-based smooth scroll driven by elapsed time from Play start.

## What Worked and What Didn't

### Worked
- **Putting per-note data in `melody.json` rather than reparsing ABC client-side.** The pipeline already has MusicXML notes in memory in `_section_to_chordpro_lines` — emitting a parallel structured array is much cleaner than asking the app to walk an ABC string. Pipeline tests caught no regressions.
- **Keeping `AbcView` mounted at 0×0 to drive timing.** `TimingCallbacks` lives in the WebView; unmounting it would have meant rebuilding the play engine. A `width:0; height:0; overflow:hidden; opacity:0` wrapper preserves the timing tick without taking space.
- **Animated.Value `translateX` over redoing the whole strip per frame.** Driving a single `useNativeDriver: true` transform is cheap; rerendering 100+ absolutely-positioned bars on every event would have been wasteful.

### Didn't try (so didn't fail this session)
- No fresh failures this session. The "gray rectangle on iOS" bug from the prior session — caused by `Animated.View + translateY` around `AbcView` — was already fixed before /clear by switching to `ScrollView` with `scrollEnabled={false}` + imperative `scrollTo`.

### Things deliberately punted
- **Smooth-time interpolation** (sliding *between* notes instead of snapping). The 160 ms tween masks the discreteness well enough for a first pass; rAF can come later when we measure.
- **Vertical pitch quantisation / staff-lines under the bars.** Simply Sing uses a clean ribbon — no staff. Stayed faithful.

## Key Decisions Made and Why

- **Pitch-bar height ENCODES pitch via a per-song normalised mapping**, not a fixed MIDI→y table.
  - Why: songs in this corpus span very different octaves; a fixed table would push some songs off-screen and others into a tiny band. Per-song min/max keeps the full melodic range visible regardless of key/octave.
  - Tradeoff: the visual "C" of one song is a different y-pixel from the "C" of another. Acceptable — the user reads CONTOUR, not absolute pitch.

- **Fixed playhead + scrolling strip** (vs. fixed strip + moving playhead).
  - Why: matches the Simply Sing reference the user shared; gives the active note a predictable on-screen position so the eye doesn't have to chase.
  - Confirmed in the previous session via `AskUserQuestion`: "Fixed playhead, notes scroll right-to-left (Recommended)".

- **Snap-to-note rather than smooth scroll for v1.**
  - Why: the timing source we have is *discrete* (`onNoteEvent` posts one event per played note). Smooth scrolling would need an independent clock + elapsed-beats accumulator. Easier to ship snap first and see if it feels off.
  - Mitigation: 160 ms `Animated.timing` tween softens the snap so it doesn't feel jumpy.

- **Three-way fallback inside `KaraokeView`.**
  - `notes[]` available → `PitchTimelineView`.
  - `abc` only → staff cut-out (covers melody.json files that haven't been re-emitted).
  - Neither → prev/current/next text strip.
  - Why: lets the new view land without regressing songs that don't have melody data, and avoids forcing a full corpus re-emit before merging.

- **Append `-` to `begin`/`middle` syllables in the lyric cells.**
  - Why: syllabic context — without it, `Chvá lu` reads as two words. With `Chvá- lu,` the hyphenation is visually preserved.

- **Hidden-but-mounted `AbcView` instead of extracting `TimingCallbacks` into a headless component.**
  - Why: minimal blast radius. `AbcView` already encapsulates the WebView + native abcjs init + event bridge. Extraction is a real refactor for marginal benefit.
  - Tradeoff: a small invisible WebView is sitting there. Won't cost much; we'll revisit if it shows up in profiling.

- **`melody.blocks.flatMap((b) => b.notes ?? [])` in `app/song/[id].tsx`.**
  - Why: simplest possible flat list. Block boundaries don't matter to the timeline — it just plays through.

## Lessons Learned & Gotchas

- **`display:none` may unmount the underlying WebView in some RN versions** — known to stop `TimingCallbacks`. Using `width:0; height:0; overflow:hidden; opacity:0` keeps the view in the tree.
- **`tsc --noEmit` runs silently when clean.** Don't mistake empty output for a hang — `echo $?` to confirm.
- **A user shell preexec hook in this environment swallows `cd` output and emits an `ls`-like listing instead.** Avoid `cd path && cmd`; pass absolute paths or use `--prefix` / `git -C`.
- **`pytest pipeline/tests/musicxml`** (directory) does not exist — the test file is `pipeline/tests/test_musicxml.py`.
- **The pipeline venv is at `pipeline/.venv`** (not a root-level `.venv`).
- **Animated.Value initial state matters.** Initialising `translateX` with the same expression used by the effect (`playheadX - currentBeat * PX_PER_BEAT`) means the first frame already shows the right slice — no flash at mount.
- **`numberOfLines={1}` on lyric `Text`** keeps a long syllable from wrapping and shoving the bar geometry. Width of the lyric cell is bounded by the note's `durationBeats * PX_PER_BEAT`.
- **The autonomy memory** says: skip "want me to continue?" prompts. Honoured.

## Current State

### Working right now (verified via tsc/lint/tests)
- Pipeline emits `notes[]` for every block; 45 corpus melody.json files updated.
- `MelodyNote` / `Syllabic` types exposed from `assemble.ts`.
- `PitchTimelineView` renders horizontal pitch bars, fixed playhead, lyrics beneath, `accent`/`borderSoft` colouring driven by past/active/future state.
- `KaraokeView` dispatches between PitchTimeline / staff-cutout / text-strip based on what data the song has.
- `AbcView` stays mounted in the karaoke pitch-bar path (0×0 hidden) so `TimingCallbacks` still feeds `noteIndex`.
- All 16 app vitest files / 616 tests green. All 30 pipeline musicxml tests green. ESLint clean.

### Not yet verified
- On-device behaviour of the pitch-bar strip (iPhone Expo Go). It compiles and types check, but I haven't seen it move.
- Visual feel of the snap-to-note transition — may need smooth scrolling.
- Whether `viewportWidth` defaults to 360 is wide enough in practice on iPhone. There's no `onLayout` measure yet; we fall back to the constant.

### Temporary hacks / TODOs in code
- `viewportWidth` is currently a prop that defaults to 360 — no `onLayout`. If the actual container is narrower (small phone) the playhead x will be off.
- `PX_PER_BEAT = 80` is a fixed scale — doesn't adapt to tempo or screen density.
- "Snap" transition is a 160 ms `Animated.timing` — if Play tempo is faster than that, transitions queue and visibly lag.
- Rest bars use `borderSoft` (looks like an empty gap) — fine for now, could change if rests need to be visually distinct.

### Uncommitted files (50 total)
- `app/app/song/[id].tsx` — threads `melodyNotes` from melody.json into `KaraokeView`.
- `app/src/shared/components/KaraokeView.tsx` — picks PitchTimeline vs staff vs text strip; new `hiddenTiming` style.
- `app/src/shared/melody/assemble.ts` — `Syllabic`, `MelodyNote`, optional `Block.notes`.
- `app/src/shared/components/PitchTimelineView.tsx` — **new file**.
- `pipeline/zpevnik_pipeline/musicxml/convert.py` — `_STEP_TO_SEMITONE`, `_note_to_midi`, `_section_to_notes`, `notes` field in each block.
- 45 × `songs/*/melody.json` — re-emitted with `notes[]`.

## Clear Next Steps

1. **Reload the Expo Go app on the phone and try Play in 🎤 Karaoke mode on a song with melody.json** (song 004 is a good first target).
   - If the bars move and the syllables track → ship it (commit).
   - If timing is laggy / off → next item.

2. **Smooth scroll if snap feels jumpy.**
   - Add a per-frame `Animated.Value` driven by `requestAnimationFrame` + elapsed time from Play start, instead of stepping on each `onNoteEvent`.
   - Suggested approach: keep `noteIndex` for the "active" highlight, but compute `currentBeat` as a fractional value:
     ```ts
     // pseudocode in PitchTimelineView
     const startedAtMs = useRef<number | null>(null);
     useEffect(() => {
       if (!isFollowing) { startedAtMs.current = null; return; }
       startedAtMs.current = Date.now();
       let raf = 0;
       const tick = () => {
         const elapsedSec = (Date.now() - startedAtMs.current!) / 1000;
         const beats = elapsedSec * (tempo / 60);
         translateX.setValue(playheadX - beats * PX_PER_BEAT);
         raf = requestAnimationFrame(tick);
       };
       raf = requestAnimationFrame(tick);
       return () => cancelAnimationFrame(raf);
     }, [isFollowing, tempo, ...]);
     ```
   - Caveat: this needs `tempo` threaded into the component.

3. **Measure container width with `onLayout`** instead of the 360 fallback. Drop `viewportWidth` prop or make it optional / overridable.

4. **Commit.** Suggested message structure (one logical change):
   - "Pipeline: emit per-note `notes[]` in melody.json"
   - "App: karaoke pitch-bar timeline (Simply-Sing style)"
   - or single combined commit: "Karaoke pitch-bar timeline + pipeline notes[] emission"

5. **Optional polish:**
   - Style: lighter "future" bars (lower opacity), tinted "past" bars (accent at 0.6) → currently a single `accent` colour with `opacity 0.55` for past+not-active.
   - Rest visualisation: subtle dashed/striped bar instead of a solid `borderSoft` block.
   - Tempo-aware `PX_PER_BEAT` so slow songs don't get a too-stretched timeline.
   - Show the chord change above the active bar (we have `note.chord` already).

## Important Files Map

### New files
- **`app/src/shared/components/PitchTimelineView.tsx`** — The Simply-Sing-style pitch-bar timeline. Self-contained; props: `notes`, `noteIndex`, optional `viewportWidth`. Header comment in the file describes the design.

### Modified — app
- **`app/src/shared/melody/assemble.ts`** — Added `Syllabic` union, `MelodyNote` interface, optional `notes?: MelodyNote[]` on `Block`. `assembleAbc()` unchanged.
- **`app/src/shared/components/KaraokeView.tsx`** — New `notes` prop; three-way branch (pitch-timeline / staff-cutout / text-strip). New `hiddenTiming` style keeps `AbcView` mounted off-screen on the pitch-bar path.
- **`app/app/song/[id].tsx`** — `State.ready` carries `melodyNotes`; built via `melody.blocks.flatMap((b) => b.notes ?? [])`. Passed through to `KaraokeView`.

### Modified — pipeline
- **`pipeline/zpevnik_pipeline/musicxml/convert.py`** — Three new helpers + `_build_melody` change. Relevant snippets:
  ```python
  _STEP_TO_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

  def _note_to_midi(step, octave, alter):
      if step is None or octave is None: return None
      base = _STEP_TO_SEMITONE.get(step.upper())
      if base is None: return None
      return (octave + 1) * 12 + base + alter

  def _section_to_notes(measures, divisions):
      out = []
      for m in measures:
          for note in m.notes:
              if note.is_chord_tone: continue
              pitch = None if note.rest else _note_to_midi(note.step, note.octave, note.alter)
              duration_beats = note.duration / divisions if divisions > 0 else 1.0
              out.append({
                  "pitch": pitch,
                  "durationBeats": duration_beats,
                  "lyric": note.lyric,
                  "syllabic": note.syllabic,
                  "chord": note.chord_above,
              })
      return out
  ```

### Unchanged but load-bearing (for context)
- **`app/src/shared/components/AbcView.tsx`** — Provides the timing engine. Already exposed `onNoteEvent` from prior session; we just keep mounting it.
- **`app/src/shared/components/BottomBar.tsx`** — Cycles `viewMode: karaoke → staves → lyrics`. No change needed.
- **`app/src/shared/store/settings.ts`** — `viewMode` tri-state + v1→v2 migrate. No change needed.
- **`pipeline/zpevnik_pipeline/musicxml/convert.py::_section_to_chordpro_lines`** — emits hyphens (`Pá-na`) for begin/middle syllables. Already in place from prior session.

### Test runners
- App: `npx tsc --noEmit -p app/tsconfig.json`, `npm run lint` (in `app/`), `npm test` (in `app/`).
- Pipeline: `pipeline/.venv/bin/python -m pytest pipeline/tests/test_musicxml.py -q`.

### Re-emit corpus
```
pipeline/.venv/bin/musicxml-batch --force      # all songs
pipeline/.venv/bin/musicxml songs/004-chvalu-dik   # single song
```
