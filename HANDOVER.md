# Session Handover — 2026-05-26

## Summary
Three big arcs since the last handover. **(1) Dark-mode debugging on web** — five commits chasing the actual root cause of "system dark mode renders the light theme on prod." Final fix: SSR-safe `useState('light')` + post-mount `setScheme` in `useTheme`, plus a pre-hydration `<script>` in `app/+html.tsx`, plus pinning `color: black` on the AbcView wrapper to neutralise the side effect of `<meta name="color-scheme" content="light dark">` on abcjs's SVG fills. **(2) EAS native-build scaffolding** — bundle id renamed to `com.majksa.zpevnik`, eas.json with development/preview/production profiles, project linked to `@majksa/zpevnik` on EAS. Apple Developer enrollment is pending; first build will come after that. **(3) Songs corpus ingestion from proscholy.cz** — went from 45 hand-curated songs to 733 via the pipeline's `musicxml-batch`. Local id now equals proscholy's soubor id so `/song/004` lines up with `/soubor/004.xml`. Titles fetched from proscholy GraphQL's `externals(media_type:"file/xml")` map (`{ media_id → song_lyric.name }`) since `/soubor/N.xml` and `song_lyric.id N` live in different id spaces.

## What Was Worked On & What Got Done

Chronological, every commit since `10d93e3` (prior HANDOVER):

1. **`1f11617` Karaoke: replace `noteIndex` prop with `hasFirstEvent`.** After the time-derived highlight rewrite, the numeric `noteIndex` was vestigial — only consumed by the song-start anchor effect and the paused-state snap target. Cosmetic API cleanup; no functional change. `currentBeat` now derives from `displayedActiveIdx` (already -1 in paused state).
2. **`9309783` Nginx: 404 for missing `/songs/*`.** `location /`'s `try_files … /index.html` SPA fallback was catching nonexistent `/songs/<id>/<file>` requests and serving them 200 with the SPA HTML, which the client then mis-parsed. Dedicated `location /songs/ { try_files $uri =404; }` block keeps the existing static files served normally and returns a real 404 for missing ones.
3. **`afd2063` Scripts: `scripts/pull-prod-songs.sh`.** HTTP-fetches the prod reviewer's volume back into the repo so reader builds can pick up curated edits. Uses HTTP Basic; iterates over `/songs/index.json`; pulls meta + chordpro + melody per song. Tested against prod; idempotent.
4. **`0936693` CI: also skip publish.yml when only `scripts/**` change.** scripts/ aren't COPY'd into either Dockerfile, so a no-op deploy was wasted CI.
5. **`06f3383` Dark mode v1: theme-aware modal scrim + web body bg sync.** Added `theme.backdrop` field (rgba(0,0,0,0.35) light / 0.55 dark); used in song/[id].tsx's BottomBar backdrop and AddToSetlistSheet. Added a useEffect in `_layout.tsx` that syncs `document.body.style.backgroundColor` to `theme.bg` so dark mode covers the rubber-band/overscroll area. **Insufficient — see (8)–(11).**
6. **`10ae401` Dark mode v2: pre-hydration paint + `Appearance.addChangeListener`.** Added `app/+html.tsx` (Expo Router HTML override) with `<meta name="color-scheme" content="light dark">` and a tiny inline script that reads `zpevnik-settings` localStorage + `prefers-color-scheme` and paints `<html>` bg before React boots. Replaced `useColorScheme()` with a custom hook that subscribes to `Appearance.addChangeListener`. Still incomplete.
7. **`ac384b0` Dark mode v3: matchMedia directly on web.** Replaced the `Appearance.getColorScheme()` initialiser with `window.matchMedia('(prefers-color-scheme: dark)').matches` to sidestep an RN-web hydration-timing issue. Still wrong.
8. **`d1fd8a9` Dark mode v4: SSR-safe initial state.** The actual root cause. Playwright probe revealed React 18 was silently keeping the SSR's LIGHT inline styles whenever the client-side hook returned `'dark'` on first render — hydration mismatches in production don't auto-update DOM. Fix: force `useState<'light' | 'dark'>('light')` unconditionally on first render (matching SSR), then `setScheme` to the real value via `useEffect` after mount. The state change triggers a real re-render that updates the DOM.
9. **`cd63ab6` AbcView (web): pin `color: black`.** ABC notation text in staves + karaoke views was invisible in dark mode — black-on-dark. Cause: the `<meta name="color-scheme" content="light dark">` from (6) makes the browser pick WHITE as the default text color in dark mode; abcjs's SVG text inherits via `currentColor` and renders white; the invert filter then flips to black; black on dark bg = invisible. Fix: pin `color: black` on the AbcView wrapper so abcjs always paints in black regardless of page color-scheme. The filter then does its original job in dark mode.
10. **`1832a15` Bundle id rename.** `com.ondrejmaxa.zpevnik` → `com.majksa.zpevnik`. iOS + Android only; web build unaffected. Safe at this point because nothing is published to either store yet.
11. **`1345311` CI: also skip publish.yml on `app.json`-only changes.** app.json edits are usually native-only (bundle id, infoPlist) and don't affect the web export.
12. **`da9f7a1` EAS scaffold.** New `app/eas.json` with `development` / `preview` / `production` profiles. `EXPO_PUBLIC_SONGS_BASE_URL: https://zpevnik.majksa.net` baked into preview + production so native fetches songs from the public reader endpoint. `autoIncrement: true` on production, `appVersionSource: "remote"` so EAS owns build numbers. Submit profile empty until Apple credentials land.
13. **`f951ad9` EAS init.** Ran `eas init --non-interactive --force`; project created at `https://expo.dev/accounts/majksa/projects/zpevnik` (id `24cac7e9-2204-438f-b5f7-314f497a9337`). `extra.eas.projectId` and `owner` written into app.json.
14. **`26fe1f3` EAS prep fixes.** Added `ITSAppUsesNonExemptEncryption: false` to iOS infoPlist (Apple wants explicit declaration; we don't use custom crypto) and dropped the `channel:` lines from eas.json profiles since `expo-updates` isn't installed.
15. **`fa74fa1` Drop the three hand-authored demos.** 001/002/003 were placeholders with no `notes[]` in melody.json; fell back to the staff cut-out in karaoke mode while the 45 real songs showed the pitch-bar. Removed dirs + regenerated index.
16. **`1de61f1` Ingest 688 new songs (first batch).** `musicxml-batch --ids 1-789 --force`; 733 songs landed; 56 skipped (53 are .xml 404s, 3 have non-numeric measure IDs the parser rejects, e.g. `'X1'`). Title source was the `/pisen/N` HTML page's `<h1>` scrape. **Titles were wrong for two reasons**, see (17) + (18).
17. **`b9830c8` Local id == proscholy soubor id + GraphQL titles.** Changed `musicxml-batch` so `local_id = f"{rid:03d}"` (deterministic from rid, no allocation). Replaced HTML scrape with a GraphQL query `{ song_lyric(id: rid) { name } }` since the /pisen/ HTML is JS-rendered for some songs (their static body just says `načítám…`). Confirmed all envs serve `001 → soubor 1`. Still wrong: GraphQL's `song_lyric.id` is a different id space from `/soubor/N.xml`'s file id.
18. **`2ddf7a2` Titles via externals map.** Final fix. `/soubor/N.xml` and `song_lyric.id N` live in DIFFERENT id spaces — file 4 ≠ song_lyric 4. The actual canonical title for `/soubor/4.xml` ("Jen Ty, Pane můj") lives on song_lyric 309, reachable only via the External attachment whose media_id is "4.xml". Replaced `_fetch_proscholy_title` with `_fetch_proscholy_xml_titles`: one GraphQL query `externals(media_type:"file/xml") { media_id song_lyric { name } }` builds a `{ media_id → name }` map (697 entries) which the batch then looks up per rid. Map cached at `<cache>/xml-externals.json`. Re-ingested the full corpus.

## What Worked and What Didn't

### Worked
- **Playwright as a debugging tool for the dark-mode bug.** A real headless browser with `colorScheme: 'dark'` emulation surfaced the actual symptom (body bg dark via pre-hydration script, but React-rendered fills LIGHT) that I couldn't reproduce via curl alone. The smoking gun was matrix-testing three permutations (system-dark / explicit-dark+system-dark / explicit-dark+system-light) and finding only the last one rendered correctly — pointing straight at the SSR-CSR hydration mismatch.
- **The `useState('light')` + post-mount `setScheme` pattern.** Standard React-18 SSR-safe theme detection. Forces CSR's first render to match SSR's, then forces an explicit state change to trigger a real re-render. Cleared the bug definitively.
- **GraphQL introspection to find the proscholy data model.** `{ __schema { queryType { fields { … } } } }` listed every query field; `{ __type(name:"SongLyric") { fields { … } } }` listed every column. Without introspection I'd have been guessing endpoints. The hint that solved the title-mapping puzzle was the `externals` relation on SongLyric.
- **GraphQL externals map as a one-shot fetch.** 697 entries in a single 60s roundtrip; cached locally; per-rid lookup is then a free dict get. Massively faster than per-rid HTTP, and the single response is the ground truth (file ↔ song mapping in one place).
- **Local id == proscholy soubor id.** Deterministic mapping; no allocation logic; song detail URLs (`/song/004`) now line up with the source (`/soubor/004.xml`, `/pisen/4`).

### Didn't (failed paths)
- **HTML scrape for titles (`<h1 class="text-2xl font-custom-medium">`).** Worked for songs whose page was server-rendered with a real title. Failed silently for songs whose page is JS-rendered (static body shows `načítám…`). Replaced with GraphQL.
- **`song_lyric(id: <rid>)` as the title source.** Assumed file id == song_lyric id. Wrong — they're separate id spaces. File 4 (= /soubor/4.xml content "Jen Ty, Pane můj") maps to song_lyric 309, not song_lyric 4 ("Abba Otče"). Replaced with the externals map.
- **`song_lyric_songbook_number(number)` lookup.** Returns null for every ez_number tested. Not the right lookup for our case; the externals map turned out to be the canonical path.
- **`Appearance.getColorScheme()` in the initialiser.** Worked on native; on web RN-web's bridge returned light even when the actual `matchMedia` reported dark. Switched to reading matchMedia directly on web.
- **Returning `'dark'` from the initialiser when matchMedia said dark.** Caused the original hydration mismatch — SSR rendered LIGHT, CSR first render returned DARK, React 18 silently kept the SSR DOM. Reverted to always-`'light'` initial, post-mount `setScheme`.
- **Five-million-mile guesses about where the title lives.** Spent time inspecting the varhany / kytara PDFs for a printed title (PDFs are music sheets — no title text, no `/Title` metadata). The user's "titles from PDF" instinct was off, but the underlying intent ("titles from the canonical source, however we get there") was right; GraphQL is that source.

### Punted
- **Real-device test on iPhone in Expo Go.** The dark-mode fix verified on web; haven't re-confirmed on native. Should be fine since the new useTheme hook works on both platforms, but worth eyeballing.
- **Apple Developer Program enrollment.** User has it pending. First `eas build --platform ios --profile preview` blocks on this.
- **Reviewer-side songs sync.** Adding 733 songs to the repo doesn't propagate to the prod reviewer's `songs-data` named volume (Docker only seeds the volume on first creation). Reader image rebuilds and picks them up; reviewer keeps its original 45-song snapshot. If you want the reviewer to see them, SSH the Coolify host and rotate/copy.
- **Whisper auto-scroll v2 feature.** Untouched. Mic permission is declared in app.json's infoPlist (`NSMicrophoneUsageDescription`); the corresponding feature isn't built.

## Key Decisions Made and Why

- **`useState('light')` unconditional initial value, not the matchMedia value.** Tradeoff: a brief flash of light theme on dark systems before useEffect re-renders. Accepted because the pre-hydration script in `app/+html.tsx` already paints `<html>` background dark before React boots, masking the worst of it. The alternative — initialising with matchMedia — caused the silent hydration mismatch that motivated this whole arc.

- **GraphQL externals map over per-rid GraphQL calls.** ~697 song↔title mappings in one roundtrip vs. 789 separate roundtrips. Faster and produces one cached file (`xml-externals.json`) we can re-read instead of replaying.

- **`local_id = f"{rid:03d}"` (deterministic).** No allocation logic. The local id is exactly the proscholy soubor id; `/song/004` ↔ `/soubor/004.xml`. The earlier sequential allocation produced an arbitrary mapping (local 005 → soubor 1, local 008 → soubor 4, etc.) that nobody could remember.

- **Pin `color: black` on the AbcView wrapper instead of removing the invert filter.** Removing the filter would make notes invisible in dark mode (abcjs paints black notes on a transparent canvas). Pinning the inherited color preserves the original `filter: invert` strategy and is the minimum surgical fix.

- **Add `<meta name="color-scheme" content="light dark">` despite the side effect.** It's what makes browser-native UI (form controls, scrollbars, system menus) themed correctly in dark mode. The side effect on abcjs is fixable with the color pin; the absence of the meta tag was visible everywhere.

- **Drop demos rather than keep them as staff-cutout fallbacks.** 3 placeholder songs falling back to a different karaoke view next to 45 real songs with the pitch-bar read as inconsistent UX, not as a graceful degradation.

- **`paths-ignore` for markdown / scripts / app.json / eas.json.** All four are operator-edits that don't change the web build's output. Each addition saved a redundant publish + Coolify roll.

- **`appVersionSource: "remote"` in eas.json.** EAS owns the build number counter; no manual bumps to app.json on every build. `autoIncrement: true` on the production profile does the rest.

- **Drop the `channel:` lines from eas.json**. Channels gate which OTA-update build you receive — but `expo-updates` (the runtime that consumes channels) isn't installed. EAS warned and channels would have been no-ops anyway. Easy to add back when OTA becomes a thing.

## Lessons Learned & Gotchas

- **React 18 silently keeps SSR DOM on hydration mismatch in production.** The standard pattern (read system prefs in useState initialiser) creates a mismatch on dark systems; React then keeps the SSR's light styles forever. The SSR-safe pattern is `useState(serverValue)` + post-mount `setState(clientValue)`. The state CHANGE is what forces React to actually update the DOM. Without an explicit state change after mount, the wrong styles persist.

- **`<meta name="color-scheme" content="light dark">` changes browser-default text colors.** In dark mode the default `color` becomes white (not black). SVG elements that paint via `currentColor` (abcjs `<text>` fills) inherit this. Anywhere you rely on the SVG-default-black assumption, pin the color explicitly.

- **Proscholy.cz has TWO id spaces.** `/soubor/N.xml` uses one id; `song_lyric(id:N)` uses another. The bridge is the `externals` relation, which lists every attachment's `media_id` and the song_lyric it belongs to. If you assume the IDs match (I did, twice), you get wrong titles.

- **Proscholy /pisen/N is Nuxt SSR'd inconsistently.** Some songs have their `<h1>` server-rendered; others have `načítám…` ("loading…") and only get the title via client-side JS. HTML scrapes catch the first set, miss the second. GraphQL is the underlying source — always populated.

- **`song_lyric_songbook_number` ≠ ez_number.** Returns null for every ez_number tested. The lookup we wanted was `externals(media_type:"file/xml")` keyed on media_id.

- **EAS `--non-interactive` won't create a new project without `--force`.** `eas init --non-interactive` errors with "Project does not exist; Use --force flag to create this project." Add `--force` for first-time creation.

- **EAS `--non-interactive` fails at the credentials gate.** First `eas build --platform ios` needs interactive prompts to register / generate an Apple Distribution certificate and provisioning profile. Won't fall through gracefully in non-interactive mode.

- **The proscholy GraphQL `song_lyric(id:1)` returns HTTP 500.** Some IDs crash the server (likely deleted records with broken relations). Catch the error and fall through; first-phrase fallback is fine here.

- **`<meta name="color-scheme">` and `font-custom-medium` in selectors are stable in proscholy's HTML.** The h1 hook I used initially was stable enough for the server-rendered songs.

- **`pdfplumber.open()` on a non-PDF crashes with `PDFSyntaxError: No /Root object`.** Some proscholy soubor IDs return HTML 404 pages with PDF extensions. Best to check content-type before opening, or wrap in try/except.

- **`pivot SongbookRecordPivot` is the relation between `Songbook` and `SongLyric` records.** Useful if you want to enumerate the canonical EZ corpus (id 58 = Evangelický zpěvník); records list maps `number → song_lyric`. We didn't end up using it because the externals map covers our needs.

- **Apple wants `ITSAppUsesNonExemptEncryption` in infoPlist explicitly.** Without it, you'll get prompted for the encryption-export-compliance answer on every App Store Connect submission. Set to `false` if you don't use custom crypto.

- **Coolify's named volume doesn't update with image rebuilds.** Volume content is seeded ONCE on first creation; subsequent image builds with different `COPY` content don't re-seed (that would lose user data). Reviewer's 45-song snapshot is preserved; reader rebuilds independently.

- **Cloudflare cache lag after rollout: 3–5 attempts.** Standard pattern is to poll with a cache-bust query param (`?cb=$(date +%s%N)`) until the new bundle hash shows up. ~20–30s typical.

## Current State

### Working right now
- **Deployed services**, both on commit `2ddf7a2`:
  - https://zpevnik-dev.majksa.net + https://zpevnik-review-dev.majksa.net (dev)
  - https://zpevnik.majksa.net + https://zpevnik-review.majksa.net (prod)
- **Corpus**: 733 songs at `/songs/index.json`; local id ↔ proscholy soubor id; titles from the externals map (with first-phrase fallback for ~36 orphan files).
- **Dark mode** correct on web: system pref detected reliably, no flash on hard refresh, modal scrim adapts, ABC notation legible in both modes.
- **EAS project** linked: `https://expo.dev/accounts/majksa/projects/zpevnik`. Build profile ready (`preview` for internal distribution, `production` for store-bound).
- **CI**: publish.yml skips on markdown / scripts / app.json / eas.json-only commits.

### Reviewer credentials (current)
- dev: `admin / 3ZTlX4Uf8cDpMhwnb3zRscaA`
- prod: `admin / J8tuXeRPVrS5G6mSC7Mssaj0`
- (Both rotated mid-session; saved encrypted in `majksa-ops:config/zpevnik/api/secrets.{dev,prod}.enc.yaml`.)

### Pending user actions
- **Apple Developer Program enrollment** (24–48h). Required for the first `eas build --platform ios --profile preview` to get past the credentials step. After that we can ship a TestFlight build.
- **Reviewer prod volume sync.** New songs (post-batch) live in the repo and on the reader image but NOT in the prod reviewer's `songs-data` volume. Manual Coolify-side action required if you want them in the reviewer.

### Temporary hacks / TODOs in code
- `app/Dockerfile` still has the `sed -i 's|<script src="…entry-….js" defer></script>|<script type="module" …` workaround for Expo SDK 54's static-export `import.meta` bug. Watch for SDK upgrades.
- AbcView's `color: black` pin uses a `ViewStyle` cast because ViewStyle's TS type doesn't include `color` (that's a Text-only prop on native; RN-web passes it through to the underlying div as CSS).
- `eas.json` submit profiles are empty stubs; needs Apple ID / ascAppId / appleTeamId before `eas submit` works.

### Songs without canonical titles
~36 of the 733 songs have an `.xml` file but no externals attachment record. Their titles fall back to `first_phrase_title(song)`. They're indistinguishable from real titles in the UI — short ones look truncated, longer ones look fine. Not a blocker for shipping.

## Clear Next Steps

In rough priority:

1. **Wait for Apple Developer Program activation, then `eas build --platform ios --profile preview`.** First build interactively walks you through certificate + provisioning profile generation. Output is a TestFlight build (if you've already created an App Store Connect app) or an `.ipa` to sideload.

2. **iPhone real-device test on the latest commit.** Quickest signal: pitch-bar smoothness on a song with section transitions (e.g. `004-jen-ty-pane-muj`), dark mode on/off, search across 733 songs, setlist operations.

3. **Decide whether to drop or implement Whisper auto-scroll.** The `NSMicrophoneUsageDescription` in infoPlist will be reviewed by Apple. If Whisper isn't shipping with the first store build, REMOVE the mic permission to avoid Apple rejecting for unused permissions.

4. **Reviewer volume sync.** If you ever curate songs via the prod reviewer, the diff doesn't reach the reader image without the `scripts/pull-prod-songs.sh` flow. Document the loop somewhere obvious (probably in scripts/README.md).

5. **Apple submission assets.** Screenshots for 6.7" + 5.5" iPhone (+ iPad since `supportsTablet: true`). Privacy policy URL (must mention what data the app collects; for you that's "nothing leaves the device"). App description + keywords.

6. **`expo-updates` if you want OTA.** Adds the channel-based runtime that the dropped `channel:` lines in eas.json would activate. Useful for shipping fixes without a full TestFlight cycle for JS-only changes.

7. **Optional polish:**
   - The 36 orphan-titled songs could be backfilled with proscholy's `search_song_lyrics(search_params:<first-phrase>)` heuristic.
   - Whisper auto-scroll proper.
   - Maybe a `pull-prod-songs.sh` cron in the deploy chain.

## Important Files Map

### Created or significantly modified this session

- **`app/+html.tsx`** — Expo Router root HTML override. `<meta name="color-scheme">` + inline pre-hydration script that paints `<html>` background from localStorage / matchMedia before React boots.
- **`app/eas.json`** — EAS build profiles. development / preview / production. `EXPO_PUBLIC_SONGS_BASE_URL` pinned to `https://zpevnik.majksa.net` for native builds. `appVersionSource: "remote"` so EAS owns build numbers.
- **`scripts/pull-prod-songs.sh`** — HTTP-fetches the prod reviewer corpus back into the local repo (uses HTTP Basic; `REVIEWER_USER` / `REVIEWER_PASS` env vars).
- **`pipeline/zpevnik_pipeline/cli.py`** — `musicxml-batch` rewritten: `local_id = f"{rid:03d}"`, title comes from `_fetch_proscholy_xml_titles` (`externals(media_type:"file/xml")` GraphQL query, cached as `xml-externals.json`), no pre-scan / allocation. Final 733-song ingest used this.
- **`app/src/shared/store/theme.ts`** — `useSystemColorScheme` rewritten: SSR-safe `useState('light')` initial + post-mount `setScheme` via `matchMedia` (web) / `Appearance.addChangeListener` (native). `Theme` gains `backdrop` field for modal scrims.
- **`app/src/shared/components/AbcView.tsx`** — Web branch pins `color: black` on the wrapper (cast as ViewStyle) so abcjs paints black regardless of the browser's color-scheme default.
- **`app/src/shared/components/KaraokeView.tsx`** — Passes `hasFirstEvent` to PitchTimelineView instead of `noteIndex`.
- **`app/src/shared/components/PitchTimelineView.tsx`** — `noteIndex` prop replaced with `hasFirstEvent: boolean`; `currentBeat` derives from `displayedActiveIdx`.
- **`app/app.json`** — Bundle id `com.majksa.zpevnik`, `ITSAppUsesNonExemptEncryption: false`, EAS projectId, owner.
- **`app/app/_layout.tsx`** — `useEffect` to sync `document.body.style.backgroundColor` to `theme.bg` on web.
- **`app/app/song/[id].tsx`** — BottomBar backdrop reads `theme.backdrop`.
- **`app/src/shared/components/AddToSetlistSheet.tsx`** — Modal scrim reads `theme.backdrop`.
- **`app/nginx.conf`** — `location /songs/ { try_files $uri =404; }` to return real 404s for missing assets.
- **`.github/workflows/publish.yml`** — `paths-ignore: ['**.md', 'scripts/**', 'app/app.json', 'app/eas.json']`.
- **`songs/`** — 733 song directories (`001-…` through `789-…` with gaps for proscholy 404s). Each dir has `meta.json` / `song.cho` / `melody.json`.

### Unchanged but load-bearing
- **`pipeline/zpevnik_pipeline/musicxml/convert.py`** — `convert_musicxml` is the main entry; `first_phrase_title` is the fallback for songs without external title mapping.
- **`pipeline/zpevnik_pipeline/musicxml/extra_verses.py`** — Pulls verses 2/3+ from the kytara PDF.
- **`majksa-ops:config/zpevnik/{web,api}/service.{dev,prod}.yml`** — Coolify Application config. Tag is auto-bumped by majksa-ops's deploy.yml on each repository_dispatch from publish.yml.

### Test + ops runners
- App: `npx --prefix app tsc --noEmit -p app/tsconfig.json`, `npm --prefix app run lint`, `npm --prefix app test`.
- Pipeline: `pipeline/.venv/bin/python -m pytest pipeline/tests -q`.
- Pipeline ingest (dry test on a few IDs): `pipeline/.venv/bin/python -m zpevnik_pipeline.cli musicxml-batch --ids 1,2,4 --songs /tmp/test --cache /tmp/zpevnik-musicxml-cache`.
- Pipeline ingest (full corpus): `pipeline/.venv/bin/python -m zpevnik_pipeline.cli musicxml-batch --ids 1-789 --songs songs --cache /tmp/zpevnik-musicxml-cache --force`.
- Title-map refresh: delete `/tmp/zpevnik-musicxml-cache/xml-externals.json` then re-run the batch.
- Trigger a dev deploy: push to main; publish.yml does the rest.
- Promote dev → prod: `gh workflow run sync_env.yml -R maxa-ondrej/majksa-ops -f from=dev -f to=prod -f app=zpevnik` → merge the env/prod PR sync_config opens.
- First EAS build: `cd app && eas build --platform ios --profile preview` (interactive, needs Apple Developer Program enrolled).
