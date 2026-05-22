# Reviewer HTTP service (FastAPI + uvicorn) — slim image.
#
# Build context MUST be the repo root, not pipeline/:
#   docker build -f pipeline/Dockerfile -t zpevnik-review .
#
# Run with the corpus mounted as a volume (read-write — reviewer edits):
#   docker run --rm -p 8765:8765 -v "$(pwd)/songs:/data/songs" zpevnik-review
#
# Skips the full pipeline install (opencv-python, pytesseract,
# pdfplumber, pymupdf, numpy, Pillow) because the reviewer only
# transitively imports:
#   zpevnik_pipeline.review.server  (fastapi + pydantic, no others)
#   zpevnik_pipeline.models         (pure stdlib + pydantic)
#   zpevnik_pipeline.output.writer  (pure stdlib + ..models)
#
# Result: image ~150 MB instead of ~700 MB. If the reviewer ever grows
# a dependency on a pipeline module that loads cv2/PIL/etc. at import
# time, this build will break and you'll need to either copy that
# module in or move back to the full `pip install .[review]` model.

FROM python:3.11-slim AS runtime

WORKDIR /app

# curl is for the Coolify healthcheck (the slim base has neither
# curl nor wget). Keep apt lists out of the final layer.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Just the reviewer's actual runtime deps.
RUN pip install --no-cache-dir \
        "fastapi>=0.110" \
        "uvicorn[standard]>=0.30" \
        "pydantic>=2.7"

# Copy only the package modules the reviewer transitively touches.
# Leaving sister modules (chordpro.py, staves.py, slug.py, sections.py)
# out of the image is what keeps cv2/PIL out — those modules import
# heavy deps at module load.
COPY pipeline/zpevnik_pipeline/__init__.py        ./zpevnik_pipeline/__init__.py
COPY pipeline/zpevnik_pipeline/models.py          ./zpevnik_pipeline/models.py
COPY pipeline/zpevnik_pipeline/output/__init__.py ./zpevnik_pipeline/output/__init__.py
COPY pipeline/zpevnik_pipeline/output/writer.py   ./zpevnik_pipeline/output/writer.py
COPY pipeline/zpevnik_pipeline/review             ./zpevnik_pipeline/review

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
EXPOSE 8765

# Seed the songs corpus. When this image is run with a NAMED VOLUME
# mounted at /data/songs (the production / Coolify path), Docker
# populates the empty volume from the image's content on first mount —
# so a fresh deploy starts with the curated corpus rather than an
# empty directory. Subsequent writes by the reviewer persist in the
# volume and the seed is ignored.
COPY songs /data/songs

VOLUME ["/data/songs"]

# Bypasses cli.py (which would force-import numpy/cv2/pytesseract).
CMD ["python", "-m", "zpevnik_pipeline.review", \
     "--songs", "/data/songs", \
     "--host", "0.0.0.0", \
     "--port", "8765"]
