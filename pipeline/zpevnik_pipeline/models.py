"""Pydantic models mirroring schema/*.schema.json.

The JSON Schemas in `schema/` are the canonical contract. Keep these models
in sync — when a schema changes, update both this file and the TS types in
`app/shared/types/`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Language = Literal["cs", "en", "la", "sk"]
ReviewStatus = Literal["auto", "flagged", "approved"]
SegmentationStrategy = Literal["one-per-page", "numbered-heading", "separator"]


class SongMeta(BaseModel):
    """Per-song sidecar — `songs/<id>-<slug>/meta.json`."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[0-9]{3,}$")
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=1)
    key: str | None = None
    tempo: int | None = Field(default=None, ge=20, le=300)
    language: Language
    tags: list[str] = Field(default_factory=list)
    sourcePdf: str
    sourcePages: list[int] = Field(min_length=1)
    hasStaffImages: bool
    reviewStatus: ReviewStatus


class SongIndex(BaseModel):
    """Repo-root `index.json`."""

    model_config = ConfigDict(extra="forbid")

    version: int = 1
    generatedAt: datetime
    songs: list[SongMeta]


class ProfileSegmentation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: SegmentationStrategy
    numberingRegex: str | None = None
    pageRange: tuple[int, int] | None = None


class ProfileLayout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chordRowFontHints: list[str] = Field(default_factory=list)
    lyricRowFontHints: list[str] = Field(default_factory=list)
    staffLineThicknessPx: int | None = None
    syllableHyphen: str = "-"


class ProfileOcr(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tesseractLang: str = "ces"
    psm: int | None = Field(default=None, ge=0, le=13)


class SongbookProfile(BaseModel):
    """Per-PDF layout profile — `pipeline/profiles/<name>.yaml`."""

    model_config = ConfigDict(extra="forbid")

    name: str
    pdf: str
    language: Language
    dpi: int = 300
    pageInverted: bool | Literal["auto"] = "auto"
    segmentation: ProfileSegmentation
    layout: ProfileLayout = Field(default_factory=ProfileLayout)
    ocr: ProfileOcr = Field(default_factory=ProfileOcr)
