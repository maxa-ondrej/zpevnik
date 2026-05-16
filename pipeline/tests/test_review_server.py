"""Tests for the FastAPI review server."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from zpevnik_pipeline.models import SongMeta
from zpevnik_pipeline.output.writer import write_index, write_song
from zpevnik_pipeline.review.server import create_app


def _meta(**overrides: object) -> SongMeta:
    base: dict[str, object] = dict(
        id="001",
        slug="test-song",
        title="Test Song",
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


def _seed(songs_dir: Path, metas_and_cho: list[tuple[SongMeta, str]]) -> None:
    metas: list[SongMeta] = []
    for meta, chordpro in metas_and_cho:
        write_song(songs_dir, meta=meta, chordpro=chordpro)
        metas.append(meta)
    write_index(songs_dir, metas)


@pytest.fixture
def client(tmp_path: Path) -> tuple[TestClient, Path]:
    songs_dir = tmp_path / "songs"
    _seed(
        songs_dir,
        [
            (_meta(), "{title: Test Song}\n[C]hello\n"),
            (_meta(id="002", slug="other", title="Other", number=2), "{title: Other}\n"),
        ],
    )
    return TestClient(create_app(songs_dir)), songs_dir


def test_health(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_list_songs_returns_both(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.get("/api/songs")
    assert r.status_code == 200
    body = r.json()
    ids = [s["id"] for s in body["songs"]]
    assert ids == ["001", "002"]


def test_get_song_includes_chordpro_and_stave_urls(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.get("/api/songs/001")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["id"] == "001"
    assert "[C]hello" in body["chordpro"]
    assert body["staveUrls"] == []  # staveCount=0 in the fixture


def test_get_song_404_when_missing(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    assert c.get("/api/songs/999").status_code == 404


def test_put_song_updates_meta_and_chordpro(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    r = c.put(
        "/api/songs/001",
        json={"title": "Edited", "chordpro": "{title: Edited}\nnew lyrics\n"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta"]["title"] == "Edited"
    assert "new lyrics" in body["chordpro"]

    # Persisted on disk
    meta_path = songs_dir / "001-test-song" / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["title"] == "Edited"
    cho = (songs_dir / "001-test-song" / "song.cho").read_text(encoding="utf-8")
    assert "new lyrics" in cho


def test_put_song_promotes_auto_to_flagged_on_edit(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put("/api/songs/001", json={"title": "Edited"})
    assert r.status_code == 200
    assert r.json()["meta"]["reviewStatus"] == "flagged"


def test_put_song_explicit_review_status_wins(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put("/api/songs/001", json={"reviewStatus": "approved"})
    assert r.status_code == 200
    assert r.json()["meta"]["reviewStatus"] == "approved"


def test_put_song_force_overrides_approved_sticky(client: tuple[TestClient, Path]) -> None:
    """write_song(force=True) is invoked by the server so the human can keep
    editing even after they've marked the song approved."""
    c, _ = client
    c.put("/api/songs/001", json={"reviewStatus": "approved"})
    r = c.put("/api/songs/001", json={"title": "Touched again"})
    assert r.status_code == 200
    assert r.json()["meta"]["title"] == "Touched again"
    # status preserved (we passed only title, so reviewStatus stayed approved)
    assert r.json()["meta"]["reviewStatus"] == "approved"


def test_index_refreshes_after_put(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    c.put("/api/songs/001", json={"title": "Idx Sync"})
    body = json.loads((songs_dir / "index.json").read_text(encoding="utf-8"))
    titles = {s["id"]: s["title"] for s in body["songs"]}
    assert titles["001"] == "Idx Sync"


def test_static_songs_mount_serves_song_cho(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.get("/songs/001-test-song/song.cho")
    assert r.status_code == 200
    assert "[C]hello" in r.text
