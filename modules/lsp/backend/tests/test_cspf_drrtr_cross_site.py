"""CSPF across DRRTR sites with PRTR role aliases (real-network naming)."""

from __future__ import annotations

import networkx as nx

from app.algorithms.cspf import compute_paths
from app.core.models import NERecord, Vendor


def _ne(ne_id: str, role: str) -> NERecord:
    return NERecord(
        ne_id=ne_id,
        loopback_ipv4="10.0.0.1",
        site=ne_id.split("-")[0],
        vendor=Vendor.nokia,
        role=role,
    )


def _link(g: nx.MultiGraph, a: str, b: str, k: int, lat: float) -> None:
    g.add_edge(
        a,
        b,
        key=k,
        latency_ms=lat,
        bandwidth_mbps=10_000,
        reservable_bw_mbps=10_000,
        weight=lat,
        csv_source=a,
        csv_target=b,
    )


def test_drrtr_to_drrtr_via_core_with_prtr_csv_roles() -> None:

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-002",
        "DAVCLS-P_RTR-001",
        "ORMOC1-P_RTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {
        "DAVCLS-DRRTR-002": "DRRTR",
        "DAVCLS-P_RTR-002": "PRTR",
        "DAVCLS-P_RTR-001": "PRTR",
        "ORMOC1-P_RTR-002": "PRTR",
        "ORMOC1-P_RTR-001": "PRTR",
        "LAHUG1-P_RTR-001": "PRTR",
        "LAHUG1-DRRTR-002": "DRRTR",
    }
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    edges = [
        ("DAVCLS-DRRTR-002", "DAVCLS-P_RTR-002", 1),
        ("DAVCLS-P_RTR-002", "ORMOC1-P_RTR-002", 2),
        ("ORMOC1-P_RTR-002", "ORMOC1-P_RTR-001", 3),
        ("ORMOC1-P_RTR-001", "LAHUG1-P_RTR-001", 4),
        ("LAHUG1-P_RTR-001", "LAHUG1-DRRTR-002", 5),
    ]
    for idx, (a, b, k) in enumerate(edges):
        _link(g, a, b, k, float(idx + 1))

    primary, backup, _ecmp, rejected, _pruned, warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="DAVCLS-DRRTR-002",
        destination="LAHUG1-DRRTR-002",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None, f"expected primary, rejected={rejected}, warnings={warnings}"
    assert primary.nodes[0] == "DAVCLS-DRRTR-002"
    assert primary.nodes[-1] == "LAHUG1-DRRTR-002"


def test_maramag_transit_path_rejected_prefers_core_via_ormoc() -> None:
    """Short MARAMAG-DRRTR shortcut must lose to valid all-core ORMOC route."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-002",
        "DAVCLS-P_RTR-001",
        "MARAMAG-DRRTR-001",
        "ALWANA-P_RTR-002",
        "ORMOC1-P_RTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PRTR") for n in nodes}
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    edges = [
        ("DAVCLS-DRRTR-002", "DAVCLS-P_RTR-002", 1),
        ("DAVCLS-P_RTR-002", "DAVCLS-P_RTR-001", 2),
        ("DAVCLS-P_RTR-001", "MARAMAG-DRRTR-001", 3),
        ("MARAMAG-DRRTR-001", "ALWANA-P_RTR-002", 4),
        ("ALWANA-P_RTR-002", "LAHUG1-P_RTR-002", 5),
        ("DAVCLS-P_RTR-002", "ORMOC1-P_RTR-002", 6),
        ("ORMOC1-P_RTR-002", "ORMOC1-P_RTR-001", 7),
        ("ORMOC1-P_RTR-001", "LAHUG1-P_RTR-001", 8),
        ("LAHUG1-P_RTR-001", "LAHUG1-DRRTR-002", 9),
    ]
    for idx, (a, b, k) in enumerate(edges):
        _link(g, a, b, k, float(idx + 1))

    primary, _backup, _ecmp, rejected, _pruned, warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="DAVCLS-DRRTR-002",
        destination="LAHUG1-DRRTR-002",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None, f"expected primary, rejected={rejected}, warnings={warnings}"
    assert "ORMOC1-P_RTR-002" in primary.nodes
    assert "MARAMAG-DRRTR-001" not in primary.nodes


def test_cspf_yen_primary_when_dijkstra_violates_roles() -> None:
    """Transit PERTR shortcut is excluded from the role-aware graph; core path wins via Dijkstra."""

    nes = {
        "A": _ne("A", "DRRTR"),
        "X": _ne("X", "PERTR"),
        "P": _ne("P", "P_RTR"),
        "C": _ne("C", "DRRTR"),
    }
    g = nx.MultiGraph()
    _link(g, "A", "X", 0, 1.0)
    _link(g, "X", "C", 1, 1.0)
    _link(g, "A", "P", 2, 10.0)
    _link(g, "P", "C", 3, 10.0)

    primary, backup, _ecmp, rejected, _pruned, _warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="A",
        destination="C",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None
    assert primary.nodes == ["A", "P", "C"]
    assert "X" not in primary.nodes


def test_transit_access_allowed_when_enforce_roles_disabled() -> None:
    """With role rules off, CSPF may use transit access shortcuts present in links.csv."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-001",
        "MARAMAG-DRRTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PRTR") for n in nodes}
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    for idx, (a, b, k) in enumerate(
        [
            ("DAVCLS-DRRTR-002", "DAVCLS-P_RTR-001", 1),
            ("DAVCLS-P_RTR-001", "MARAMAG-DRRTR-001", 2),
            ("MARAMAG-DRRTR-001", "LAHUG1-P_RTR-001", 3),
            ("LAHUG1-P_RTR-001", "LAHUG1-DRRTR-002", 4),
        ]
    ):
        _link(g, a, b, k, float(idx + 1))

    primary, _backup, _ecmp, _rejected, _pruned, _warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="DAVCLS-DRRTR-002",
        destination="LAHUG1-DRRTR-002",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=False,
    )
    assert primary is not None
    assert "MARAMAG-DRRTR-001" in primary.nodes


def test_pertr_transit_shortcut_rejected_prefers_core() -> None:
    """Transit PERTR shortcut must lose to a valid all-core route."""

    nodes = [
        "SITEA-DRRTR-001",
        "SITEA-P_RTR-001",
        "SITEB-PERTR-001",
        "SITEC-P_RTR-001",
        "SITEC-P_RTR-002",
        "SITEC-DRRTR-001",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PERTR" if "PERTR" in n else "PRTR") for n in nodes}
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    edges = [
        ("SITEA-DRRTR-001", "SITEA-P_RTR-001", 1),
        ("SITEA-P_RTR-001", "SITEB-PERTR-001", 2),
        ("SITEB-PERTR-001", "SITEC-P_RTR-001", 3),
        ("SITEC-P_RTR-001", "SITEC-DRRTR-001", 4),
        ("SITEA-P_RTR-001", "SITEC-P_RTR-002", 5),
        ("SITEC-P_RTR-002", "SITEC-DRRTR-001", 6),
    ]
    for idx, (a, b, k) in enumerate(edges):
        _link(g, a, b, k, float(idx + 1))

    primary, _backup, _ecmp, _rejected, _pruned, warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="SITEA-DRRTR-001",
        destination="SITEC-DRRTR-001",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None, f"expected primary, warnings={warnings}"
    assert "SITEB-PERTR-001" not in primary.nodes
    assert "SITEC-P_RTR-002" in primary.nodes


def test_dest_site_multi_hop_drrtr_tail_via_cspf() -> None:
    """CSPF must accept destination-site DRRTR peering before the final NE."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PRTR") for n in nodes}
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    edges = [
        ("DAVCLS-DRRTR-002", "DAVCLS-P_RTR-001", 1),
        ("DAVCLS-P_RTR-001", "LAHUG1-P_RTR-001", 2),
        ("LAHUG1-P_RTR-001", "LAHUG1-DRRTR-001", 3),
        ("LAHUG1-DRRTR-001", "LAHUG1-DRRTR-002", 4),
    ]
    for idx, (a, b, k) in enumerate(edges):
        _link(g, a, b, k, float(idx + 1))

    primary, _backup, _ecmp, _rejected, _pruned, warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="DAVCLS-DRRTR-002",
        destination="LAHUG1-DRRTR-002",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None, f"expected primary, warnings={warnings}"
    assert primary.nodes == [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-001",
        "LAHUG1-DRRTR-002",
    ]


def test_user_manual_ormoc_path_when_links_exist() -> None:
    """Exact manual ORMOC core chain must compute when those links are in the CSV."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-002",
        "DAVCLS-P_RTR-001",
        "ORMOC1-P_RTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
        "MARAMAG-DRRTR-001",
        "ALWANA-P_RTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PRTR") for n in nodes}
    nes = {n: _ne(n, roles[n]) for n in nodes}
    g = nx.MultiGraph()
    edges = [
        ("DAVCLS-DRRTR-002", "DAVCLS-P_RTR-002", 1),
        ("DAVCLS-P_RTR-002", "ORMOC1-P_RTR-002", 2),
        ("ORMOC1-P_RTR-002", "ORMOC1-P_RTR-001", 3),
        ("ORMOC1-P_RTR-001", "LAHUG1-P_RTR-001", 4),
        ("LAHUG1-P_RTR-001", "LAHUG1-DRRTR-002", 5),
        ("DAVCLS-P_RTR-001", "MARAMAG-DRRTR-001", 6),
        ("MARAMAG-DRRTR-001", "ALWANA-P_RTR-002", 7),
        ("ALWANA-P_RTR-002", "LAHUG1-P_RTR-001", 8),
        ("DAVCLS-P_RTR-002", "DAVCLS-P_RTR-001", 9),
    ]
    for idx, (a, b, k) in enumerate(edges):
        _link(g, a, b, k, float(idx + 1))

    primary, _backup, _ecmp, rejected, _pruned, warnings, _opt, _trade = compute_paths(
        g,
        nes,
        source="DAVCLS-DRRTR-002",
        destination="LAHUG1-DRRTR-002",
        required_bw_mbps=None,
        max_hops=32,
        mode="rsvp_te",
        enforce_srlg_diversity=False,
        time_hour=None,
        failed_ne_ids=set(),
        failed_link_keys=set(),
        enforce_roles=True,
    )
    assert primary is not None, f"expected primary, rejected={rejected}, warnings={warnings}"
    assert primary.nodes == [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-002",
        "ORMOC1-P_RTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
    ]
