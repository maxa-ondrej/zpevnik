# Pipeline

Offline tool that converts a songbook PDF into a structured `songs/` tree
(ChordPro + cropped staff PNGs + `meta.json`).

## Install

```bash
cd pipeline
uv venv && source .venv/bin/activate
uv pip install -e ".[dev,review]"
```

Tesseract must be installed at the OS level with the Czech language pack:

```bash
brew install tesseract tesseract-lang
```

## Use

```bash
# Run the full pipeline for a PDF using a named profile
zpevnik run path/to/songbook.pdf --profile pipeline/profiles/zpevnik-2019.yaml

# Inspect / validate a profile
zpevnik profile validate pipeline/profiles/zpevnik-2019.yaml

# Launch the review UI (FastAPI + static frontend)
zpevnik review --songs ../songs
```

## Layout

```
pipeline/
├── pyproject.toml
├── profiles/                 # YAML — per-PDF layout hints
└── zpevnik_pipeline/
    ├── __init__.py
    ├── cli.py                # Typer entry — `zpevnik …`
    ├── models.py             # Pydantic models matching schema/*.schema.json
    ├── config.py             # Profile loading + validation
    ├── extract/              # Stage 1–2: normalize, classify
    ├── parse/                # Stage 3–10: segment, layout, OCR, align, crop
    ├── output/               # Stage 11–12: ChordPro emit, meta + index
    └── review/               # FastAPI app for the manual-review UI
```

## Properties

- **Idempotent** — re-running on unchanged input produces unchanged output.
- **Incremental** — pages are hashed; only changed pages are re-processed.
- **Multi-PDF** — multiple profiles can run against one `songs/` tree.
- **Approved songs never overwritten** — `reviewStatus = approved` is sticky.
