"""Lightweight API smoke tests."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    res = client.get("/api/lsp/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_import_and_topology_and_compute() -> None:
    fixtures = Path(__file__).resolve().parent / "fixtures"
    nes = fixtures / "minimal_nes.csv"
    links = fixtures / "minimal_links.csv"
    files = {
        "nes_file": ("minimal_nes.csv", nes.read_bytes(), "text/csv"),
        "links_file": ("minimal_links.csv", links.read_bytes(), "text/csv"),
    }
    res = client.post("/api/lsp/import", files=files)
    assert res.status_code == 200, res.text
    topo = client.get("/api/lsp/topology")
    assert topo.status_code == 200
    body = topo.json()
    assert len(body["nodes"]) == 3

    comp = client.post(
        "/api/lsp/compute",
        json={
            "source_ne_id": "A",
            "destination_ne_id": "C",
            "required_bw_mbps": None,
            "max_hops": 32,
            "mode": "rsvp_te",
            "failed_ne_ids": [],
            "failed_link_keys": [],
        },
    )
    assert comp.status_code == 200, comp.text
    data = comp.json()
    assert data["primary"]["nodes"] == ["A", "B", "C"]
