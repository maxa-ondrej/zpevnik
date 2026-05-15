"""FastAPI app for the manual-review UI. Skeleton only."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI


def create_app(songs_dir: Path) -> FastAPI:
    api = FastAPI(title="Zpěvník Review", version="0.1.0")

    @api.get("/health")
    def health() -> dict[str, str | bool]:
        return {"ok": True, "songs": str(songs_dir.resolve())}

    # TODO: GET /songs, GET /songs/{id}, PUT /songs/{id}, POST /songs/{id}/approve
    return api
