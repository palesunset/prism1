"""Pytest fixtures."""

from __future__ import annotations

import networkx as nx

from app.core.models import NERecord, Vendor


def build_triangle_topology() -> tuple[nx.MultiGraph, dict[str, NERecord]]:
    """Simple 3-node triangle for CSPF tests."""

    g: nx.MultiGraph = nx.MultiGraph()
    nes: dict[str, NERecord] = {}
    for ne_id, vendor in (
        ("A", Vendor.nokia),
        ("B", Vendor.huawei),
        ("C", Vendor.cisco_xr),
    ):
        nes[ne_id] = NERecord(
            ne_id=ne_id,
            loopback_ipv4="10.0.0." + str(ord(ne_id) - ord("A") + 1),
            site="lab",
            vendor=vendor,
            role="P_RTR",
        )
        g.add_node(ne_id)
    g.add_edge(
        "A",
        "B",
        key=0,
        latency_ms=5.0,
        bandwidth_mbps=10000,
        reservable_bw_mbps=10000,
        interface_src="A:eth1",
        interface_dst="B:eth1",
        next_hop_ipv4_src="10.1.1.2",
        next_hop_ipv4_dst="10.1.1.1",
        csv_source="A",
        csv_target="B",
    )
    g.add_edge(
        "B",
        "C",
        key=0,
        latency_ms=9.0,
        bandwidth_mbps=10000,
        reservable_bw_mbps=10000,
        interface_src="B:eth2",
        interface_dst="C:eth2",
        next_hop_ipv4_src="10.2.2.2",
        next_hop_ipv4_dst="10.2.2.1",
        csv_source="B",
        csv_target="C",
    )
    g.add_edge(
        "A",
        "C",
        key=0,
        latency_ms=50.0,
        bandwidth_mbps=10000,
        reservable_bw_mbps=10000,
        interface_src="A:eth3",
        interface_dst="C:eth3",
        next_hop_ipv4_src="10.3.3.2",
        next_hop_ipv4_dst="10.3.3.1",
        csv_source="A",
        csv_target="C",
    )
    return g, nes
