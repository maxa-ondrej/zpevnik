"""Tests for the melody.json endpoints on the review server."""

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


def _write_melody(songs_dir: Path, song_id: str, slug: str, melody: object) -> Path:
    path = songs_dir / f"{song_id}-{slug}" / "melody.json"
    path.write_text(json.dumps(melody, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


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


def test_get_melody_returns_body(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    melody = {"header": "X:1\nK:C", "verses": ["C D E F"], "chorus": "G A B c"}
    _write_melody(songs_dir, "001", "test-song", melody)

    r = c.get("/api/songs/001/melody")
    assert r.status_code == 200
    assert r.json() == melody


def test_get_melody_404_when_missing(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    # 001 has no melody.json on disk
    assert c.get("/api/songs/001/melody").status_code == 404


def test_get_melody_404_when_song_missing(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    assert c.get("/api/songs/999/melody").status_code == 404


def test_put_melody_writes_file(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    payload = {"header": "X:1\nK:G", "verses": ["G A B c"], "chorus": "d e f g"}
    r = c.put("/api/songs/001/melody", json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == payload

    on_disk = json.loads(
        (songs_dir / "001-test-song" / "melody.json").read_text(encoding="utf-8")
    )
    assert on_disk == payload


def test_put_melody_allows_missing_chorus(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"]},
    )
    assert r.status_code == 200, r.text


def test_put_melody_rejects_non_object(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    # FastAPI parses any JSON body — a list is valid JSON but invalid melody.
    r = c.put("/api/songs/001/melody", json=["nope"])
    assert r.status_code == 400


def test_put_melody_rejects_missing_header(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put("/api/songs/001/melody", json={"verses": ["C D E F"]})
    assert r.status_code == 400


def test_put_melody_rejects_non_string_verses(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": [1, 2, 3]},
    )
    assert r.status_code == 400


def test_put_melody_rejects_non_string_chorus(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"], "chorus": 42},
    )
    assert r.status_code == 400


def test_put_melody_404_when_song_missing(client: tuple[TestClient, Path]) -> None:
    c, _ = client
    r = c.put(
        "/api/songs/999/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"]},
    )
    assert r.status_code == 404


def test_put_melody_promotes_auto_to_flagged(client: tuple[TestClient, Path]) -> None:
    """Saving a melody on an auto-status song should flip it to flagged,
    matching the chordpro PUT behavior."""
    c, songs_dir = client
    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"]},
    )
    assert r.status_code == 200

    meta_on_disk = json.loads(
        (songs_dir / "001-test-song" / "meta.json").read_text(encoding="utf-8")
    )
    assert meta_on_disk["reviewStatus"] == "flagged"


def test_put_melody_leaves_approved_status_untouched(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    # Bump to approved via the existing endpoint.
    c.put("/api/songs/001", json={"reviewStatus": "approved"})

    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"]},
    )
    assert r.status_code == 200

    meta_on_disk = json.loads(
        (songs_dir / "001-test-song" / "meta.json").read_text(encoding="utf-8")
    )
    # No demotion / re-promotion: approved stays approved.
    assert meta_on_disk["reviewStatus"] == "approved"


def test_put_melody_leaves_flagged_status_untouched(client: tuple[TestClient, Path]) -> None:
    c, songs_dir = client
    # Get to flagged by touching the title without picking a status.
    c.put("/api/songs/001", json={"title": "Edited once"})

    r = c.put(
        "/api/songs/001/melody",
        json={"header": "X:1\nK:C", "verses": ["C D E F"]},
    )
    assert r.status_code == 200

    meta_on_disk = json.loads(
        (songs_dir / "001-test-song" / "meta.json").read_text(encoding="utf-8")
    )
    assert meta_on_disk["reviewStatus"] == "flagged"
