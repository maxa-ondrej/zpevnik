"""Unit tests for stages 11–12 (per-song writer + index.json)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from zpevnik_pipeline.models import SongMeta
from zpevnik_pipeline.output.slug import slugify
from zpevnik_pipeline.output.writer import (
    song_dir_name,
    write_index,
    write_song,
)


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Salve Regina", "salve-regina"),
        ("Já mám jen jednu věc", "ja-mam-jen-jednu-vec"),
        ("Bože, můj!", "boze-muj"),
        ("  spaces  around  ", "spaces-around"),
        ("---", "song"),  # falls back when nothing usable remains
        ("", "song"),
    ],
)
def test_slugify(title: str, expected: str) -> None:
    assert slugify(title) == expected


def _meta(**overrides: object) -> SongMeta:
    base: dict[str, object] = dict(
        id="001",
        slug="test",
        title="Test",
        number=1,
        language="cs",
        sourcePdf="x.pdf",
        sourcePages=[1],
        hasStaffImages=False,
        staveCount=0,
        reviewStatus="auto",
    )
    base.update(overrides)
    return SongMeta.model_validate(base)


def test_write_song_creates_song_dir_with_song_and_meta(tmp_path: Path) -> None:
    meta = _meta()
    song_dir, written = write_song(tmp_path, meta=meta, chordpro="{title: Test}\n")
    assert written is True
    assert song_dir == tmp_path / "001-test"
    assert (song_dir / "song.cho").read_text() == "{title: Test}\n"
    on_disk = json.loads((song_dir / "meta.json").read_text())
    assert on_disk["id"] == "001"
    assert on_disk["title"] == "Test"


def test_write_song_skips_approved_when_force_is_false(tmp_path: Path) -> None:
    meta = _meta(reviewStatus="approved", title="Original")
    write_song(tmp_path, meta=meta, chordpro="{title: Original}\n")
    # A subsequent run wants to overwrite with new content, but the on-disk
    # meta is approved.
    new_meta = _meta(reviewStatus="auto", title="Replaced")
    song_dir, written = write_song(
        tmp_path, meta=new_meta, chordpro="{title: Replaced}\n"
    )
    assert written is False
    assert (song_dir / "song.cho").read_text() == "{title: Original}\n"


def test_write_song_overwrites_approved_when_force_is_true(tmp_path: Path) -> None:
    meta = _meta(reviewStatus="approved", title="Original")
    write_song(tmp_path, meta=meta, chordpro="{title: Original}\n")
    new_meta = _meta(reviewStatus="auto", title="Replaced")
    _, written = write_song(
        tmp_path, meta=new_meta, chordpro="{title: Replaced}\n", force=True
    )
    assert written is True
    assert (tmp_path / "001-test" / "song.cho").read_text() == "{title: Replaced}\n"


def test_song_dir_name_combines_id_and_slug() -> None:
    assert song_dir_name(_meta(id="042", slug="hymn-of-praise")) == "042-hymn-of-praise"


def test_write_index_sorts_by_number_then_id(tmp_path: Path) -> None:
    metas = [
        _meta(id="003", slug="c", title="C", number=3),
        _meta(id="001", slug="a", title="A", number=1),
        _meta(id="002", slug="b", title="B", number=2),
        # Songs without a number sort after all numbered ones, by id.
        _meta(id="999", slug="z", title="Z", number=None),
    ]
    path = write_index(tmp_path, metas)
    doc = json.loads(path.read_text())
    assert doc["version"] == 1
    assert [s["id"] for s in doc["songs"]] == ["001", "002", "003", "999"]
    # generatedAt is a parseable ISO timestamp.
    datetime.fromisoformat(doc["generatedAt"].replace("Z", "+00:00"))
    assert isinstance(datetime.now(UTC), datetime)


def test_write_index_round_trips_through_pydantic(tmp_path: Path) -> None:
    metas = [_meta()]
    write_index(tmp_path, metas)
    from zpevnik_pipeline.models import SongIndex

    loaded = SongIndex.model_validate_json((tmp_path / "index.json").read_text())
    assert [m.id for m in loaded.songs] == ["001"]
