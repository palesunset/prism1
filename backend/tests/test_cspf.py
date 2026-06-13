"""CSPF algorithm tests."""

from __future__ import annotations

from app.algorithms.cspf import compute_paths, tradeoff_max_latency_ms

from conftest import build_triangle_topology


def test_cspf_primary_lowest_latency() -> None:
    g, nes = build_triangle_topology()
    primary, backup, ecmp_paths, rejected, _pruned, warnings, _opt, _ta = compute_paths(
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
    primary, _b, _ecmp, _r, pruned, _w, _o, _t = compute_paths(
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
    primary, backup, _ecmp, _r, _p, _w, _o, _t = compute_paths(
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


def test_tradeoff_max_latency() -> None:
    assert abs(tradeoff_max_latency_ms(10.0, "percent", 0) - 10.0) < 1e-9
    assert abs(tradeoff_max_latency_ms(10.0, "percent", 50) - 15.0) < 1e-9
    assert abs(tradeoff_max_latency_ms(10.0, "absolute", 5) - 15.0) < 1e-9


def test_cspf_max_hops_rejects() -> None:
    g, nes = build_triangle_topology()
    if g.has_edge("A", "C", 0):
        g.remove_edge("A", "C", 0)
    primary, _b, _ecmp, rejected, _p, _w, _o, _t = compute_paths(
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


def test_cspf_rejects_same_source_dest() -> None:
    g, nes = build_triangle_topology()
    primary, backup, _ecmp, _r, _p, warnings, _o, _t = compute_paths(
        g,
        nes,
        source="A",
        destination="A",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is None
    assert backup is None
    assert any("must differ" in w.lower() for w in warnings)


def test_cspf_rejects_unknown_ne() -> None:
    g, nes = build_triangle_topology()
    primary, _b, _ecmp, _r, _p, warnings, _o, _t = compute_paths(
        g,
        nes,
        source="Z",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is None
    assert any("unknown" in w.lower() for w in warnings)


def test_cspf_failed_ne_reroutes() -> None:
    g, nes = build_triangle_topology()
    primary, _b, _ecmp, _r, _p, _w, _o, _t = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=True,
        time_hour=None,
        failed_ne_ids={"B"},
        failed_link_keys=set(),
    )
    assert primary is not None
    assert "B" not in primary.nodes


def test_tradeoff_infinite_latency() -> None:
    assert tradeoff_max_latency_ms(float("inf"), "percent", 50) == float("inf")


def test_cspf_enforce_roles_can_be_disabled() -> None:
    g, nes = build_triangle_topology()
    primary, backup, _ecmp, _r, _p, _w, _o, _t = compute_paths(
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
        enforce_roles=False,
    )
    assert primary is not None
    assert backup is not None


def test_tradeoff_nan_latency() -> None:
    import math

    assert math.isnan(tradeoff_max_latency_ms(float("nan"), "percent", 50))


def test_cspf_sr_mpls_mode() -> None:
    g, nes = build_triangle_topology()
    primary, backup, _ecmp, _r, _p, _w, _o, _t = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="sr_mpls",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
    )
    assert primary is not None
    assert len(primary.hops) >= 1
