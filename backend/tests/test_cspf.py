"""CSPF algorithm tests."""

from __future__ import annotations

import networkx as nx

from app.algorithms.cspf import compute_paths
from app.core.models import NERecord, Role, Vendor

from conftest import build_triangle_topology


def test_cspf_primary_lowest_latency() -> None:
    g, nes = build_triangle_topology()
    primary, backup, ecmp_paths, rejected, _pruned, warnings = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is not None
    assert primary.nodes == ["A", "B", "C"]
    assert abs(primary.total_latency_ms - 14.0) < 1e-6
    assert backup is not None
    assert "B" not in backup.nodes[1:-1]
    assert len(ecmp_paths) >= 1


def test_cspf_bandwidth_pruning() -> None:
    g, nes = build_triangle_topology()
    primary, _b, _ecmp, _r, pruned, _w = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=20000,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is None
    assert any("Insufficient bandwidth" in p.reason for p in pruned)


def test_cspf_node_disjoint_backup() -> None:
    g, nes = build_triangle_topology()
    primary, backup, _ecmp, _r, _p, _w = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is not None
    assert backup is not None
    assert set(primary.nodes[1:-1]).isdisjoint(set(backup.nodes[1:-1]))


def test_cspf_max_hops_rejects() -> None:
    g, nes = build_triangle_topology()
    if g.has_edge("A", "C", 0):
        g.remove_edge("A", "C", 0)
    primary, _b, _ecmp, rejected, _p, _w = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=1,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is None
    assert any("max hops" in r.reason.lower() for r in rejected)
