# Zpěvník

Cross-platform Christian songbook with chords, lyrics, and live auto-scroll.

See [`zpevnik-spec.md`](./zpevnik-spec.md) for the full planning specification.

## Layout

```
zpevnik/
├── pipeline/   # Python — PDF → ChordPro + staff PNGs (offline)
├── songs/      # Output — one folder per song (source of truth: song.cho)
├── schema/     # Canonical JSON schemas shared by pipeline + app
├── app/        # React Native + Expo + RN Web reader
└── audio/      # v2 — Whisper-based live score follower
```

## Status

Phase 0 — Foundations. Pipeline and app scaffolds are being laid down.

## Roadmap

| Phase | Scope |
|---|---|
| 0 | Foundations: monorepo, stack lock-in, profile schema |
| 1 | Pipeline prototype on 5–10 sample songs + review UI |
| 2 | Full conversion of the complete songbook |
| 3 | App v1: list, search, viewer, transpose, manual scroll, settings, offline |
| 4 | App v2: microphone + on-device Whisper + lyric alignment for live auto-scroll |
| 5 | App Store, Play Store, web deploy, song-DB update channel |

## Quick start

Pipeline:

```bash
cd pipeline
uv sync                # or: pip install -e .
zpevnik --help
```

App:

```bash
cd app
npm install
npx expo start
```
