"""Pipeline run manifest — output of stages 0–2.

Each pipeline run writes a single JSON document summarizing what was
rasterized, normalized, and classified. Downstream stages (segmentation,
OCR, …) consume this file rather than re-running rasterization, and the
review UI surfaces its contents to help triage problem pages.

The manifest is also the substrate for the incremental cache: when the
pipeline re-runs, pages whose ``hash`` matches the previous manifest can be
skipped from stages 1+ entirely (modulo the ``--force`` flag).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PageKind = Literal["text", "scanned", "notation_heavy"]


class PageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(ge=1)
    hash: str
    kind: PageKind
    textExtractable: bool
    notationDensity: float = Field(ge=0.0, le=1.0)
    detectedStaffLines: int = Field(ge=0)
    inverted: bool
    skewDeg: float


class RunManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    generatedAt: datetime
    profile: str
    pdf: str
    dpi: int
    pages: list[PageRecord]


def write_manifest(path: Path, manifest: RunManifest) -> None:
    """Atomically write ``manifest`` as pretty-printed JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = manifest.model_dump(mode="json")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_manifest(path: Path) -> RunManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return RunManifest.model_validate(raw)


def now_utc() -> datetime:
    return datetime.now(UTC)
