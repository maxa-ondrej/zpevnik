# Contributing

Thanks for your interest! This is a small project — keep changes
focused, ship one logical thing per PR.

## Layout

See [`README.md`](./README.md) for the directory tour and
[`HANDOVER.md`](./HANDOVER.md) for the current session state and
next-steps list. The HANDOVER is refreshed at the end of working
sessions and is the most accurate "where are we" reference.

## Before opening a PR

Both halves of the repo have their own test/lint/type pipelines.
Run the one(s) for the half you touched.

**Pipeline (Python):**

```bash
cd pipeline
PYTHONPATH=. .venv/bin/python -m pytest tests/
.venv/bin/ruff check .
.venv/bin/mypy zpevnik_pipeline tests
```

**App (Expo / RN Web):**

```bash
cd app
npm test
npm run lint
npx tsc --noEmit
```

CI runs both, plus a docker build for the reader + reviewer images.

## Conventions

- **Commit messages**: imperative, scoped prefix (`App: …`,
  `Reviewer: …`, `Pipeline: …`). Body explains *why* more than
  *what* — `git log` already shows what.
- **Co-author** the AI assistant if you used one
  (`Co-Authored-By: Claude Code`).
- **No comments that just restate the code.** Comments are for
  hidden constraints, invariants, or "why this surprising thing."
- **Don't add backwards-compat shims** when you can change the
  code. We have one main branch and no released package.

## Reviewer JS ↔ TS parity

The reviewer ships hand-ported plain-JS copies of three TS
modules so its static UI can run them in the browser without a
build step:

| Reviewer (JS)                                           | App (TS)                                           |
|---------------------------------------------------------|----------------------------------------------------|
| `pipeline/zpevnik_pipeline/review/static/assemble.js`   | `app/src/shared/melody/assemble.ts`                |
| `pipeline/zpevnik_pipeline/review/static/chord.js`      | `app/src/shared/chordpro/{notation,transpose}.ts`  |
| `pipeline/zpevnik_pipeline/review/static/chordpro.js`   | `app/src/shared/chordpro/parser.ts`                |

If you change either side, change the other in the same PR.
`app/src/__parity__/reviewer.test.ts` will fail loudly if they
drift.

## Docker

Both services are dockerized — `docker compose up --build` brings
up reader on :8080 and reviewer on :8765. Reviewer mounts
`./songs/` read-write; reader bakes the corpus in at build time.
See [`pipeline/Dockerfile`](./pipeline/Dockerfile) and
[`app/Dockerfile`](./app/Dockerfile) for the details.
