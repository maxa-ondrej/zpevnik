"""Profile loading and validation."""

from __future__ import annotations

from pathlib import Path

import yaml

from .models import SongbookProfile


def load_profile(path: str | Path) -> SongbookProfile:
    """Load and validate a YAML profile file."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Profile not found: {p}")
    with p.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return SongbookProfile.model_validate(raw)
