# Reviewer HTTP service (FastAPI + uvicorn).
#
# Build context MUST be the repo root, not pipeline/:
#   docker build -f pipeline/Dockerfile -t zpevnik-review .
#
# Run with the corpus mounted as a volume:
#   docker run --rm -p 8765:8765 -v "$(pwd)/songs:/data/songs" zpevnik-review
#
# The reviewer reads AND writes song.cho / melody.json under /data/songs, so
# the volume mount must be read-write. Bind-mount the repo's `songs/` while
# editing locally; mount a copy for a sandboxed review session.

FROM python:3.11-slim AS runtime

# System deps required by the pipeline package (which the reviewer imports
# transitively via the CLI entry point):
#   tesseract-ocr     — pytesseract runtime binary
#   libgl1            — opencv-python (non-headless) shared lib
#   libglib2.0-0      — opencv-python dep
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libgl1 \
        libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in just the pipeline package so the build cache survives unrelated
# repo edits (app/, songs/, schema/, …).
COPY pipeline/pyproject.toml pipeline/README.md ./
COPY pipeline/zpevnik_pipeline ./zpevnik_pipeline

# `.[review]` adds fastapi + uvicorn on top of the core pipeline deps.
RUN pip install --no-cache-dir ".[review]"

ENV PYTHONUNBUFFERED=1
EXPOSE 8765
VOLUME ["/data/songs"]

# `zpevnik` console script is registered by pyproject.toml.
CMD ["zpevnik", "review", "--songs", "/data/songs", "--host", "0.0.0.0", "--port", "8765"]
