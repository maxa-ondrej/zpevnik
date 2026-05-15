"""Smoke tests for profile loading + validation."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from zpevnik_pipeline.config import load_profile
from zpevnik_pipeline.models import SongbookProfile

PROFILES_DIR = Path(__file__).parent.parent / "profiles"


def test_example_profile_loads() -> None:
    profile = load_profile(PROFILES_DIR / "zpevnik-2019.yaml")
    assert isinstance(profile, SongbookProfile)
    assert profile.name == "zpevnik-2019"
    assert profile.language == "cs"
    assert profile.segmentation.strategy == "numbered-heading"
    # Default OCR + layout defaults populated
    assert profile.ocr.tesseractLang == "ces"
    assert profile.layout.syllableHyphen == "-"


def test_profile_rejects_unknown_fields(tmp_path: Path) -> None:
    bad = {
        "name": "x",
        "pdf": "x.pdf",
        "language": "cs",
        "segmentation": {"strategy": "one-per-page"},
        "totallyUnknownField": True,
    }
    p = tmp_path / "bad.yaml"
    p.write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(Exception):
        load_profile(p)


def test_profile_rejects_unknown_strategy(tmp_path: Path) -> None:
    bad = {
        "name": "x",
        "pdf": "x.pdf",
        "language": "cs",
        "segmentation": {"strategy": "magic"},
    }
    p = tmp_path / "bad.yaml"
    p.write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(Exception):
        load_profile(p)
