# Zpěvník app

React Native + Expo + RN Web. Single TypeScript codebase compiling to iOS,
Android, and a static web build.

## Install

```bash
cd app
npm install
```

## Develop

```bash
npm run web      # browser
npm run ios      # iOS simulator
npm run android  # Android emulator
```

## Layout

```
app/
├── app.json              # Expo config
├── package.json
├── tsconfig.json
├── app/                  # expo-router routes
│   ├── _layout.tsx
│   ├── index.tsx         # song list
│   └── song/[id].tsx     # song viewer
└── src/
    ├── shared/
    │   ├── components/   # SongList, SongViewer, ChordLine, …
    │   ├── chordpro/     # parser + transposer + Czech/English notation
    │   ├── search/       # in-memory index over index.json + lyrics
    │   ├── store/        # zustand: settings, favourites, recents
    │   └── types/        # mirror of schema/*.schema.json
    ├── screens/          # screen-level composition
    ├── navigation/       # navigation helpers
    └── theme/            # colours, spacing, typography, dark mode
```

## Where the songs come from

The build copies `../songs/**` and `../index.json` into `assets/songs/` so
the bundle ships every song. (v2: replace with a remote update channel.)
