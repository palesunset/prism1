"""Build NetworkX MultiGraph from a project-file JSON topology."""

from __future__ import annotations

from typing import Any

import networkx as nx

from app.core.models import LinkRecord, NERecord, ProjectImportRequest


def build_from_project(req: ProjectImportRequest) -> tuple[dict[str, NERecord], nx.MultiGraph, list[LinkRecord]]:
    """Convert project JSON into NE map + MultiGraph + LinkRecord list."""

    nes: dict[str, NERecord] = {}
    for ne in req.nes:
        nes[ne.ne_id] = NERecord(**ne.model_dump())

    g: nx.MultiGraph = nx.MultiGraph()
    for ne_id in nes:
        g.add_node(ne_id)

    records: list[LinkRecord] = []
    pair_counters: dict[tuple[str, str], int] = {}

    for link in req.links:
        if link.source not in nes or link.target not in nes or link.source == link.target:
            continue
        a, b = (link.source, link.target) if link.source < link.target else (link.target, link.source)
        key = pair_counters.get((a, b), 0)
        pair_counters[(a, b)] = key + 1

        reservable = link.reservable_bw_mbps if link.reservable_bw_mbps is not None else link.bandwidth_mbps

        edge_attrs: dict[str, Any] = {
            "latency_ms": float(link.latency_ms),
            "bandwidth_mbps": int(link.bandwidth_mbps),
            "reservable_bw_mbps": int(reservable),
            "srlg": list(link.srlg or []),
            "interface_src": link.interface_src,
            "interface_dst": link.interface_dst,
            "next_hop_ipv4_src": link.next_hop_ipv4_src,
            "next_hop_ipv4_dst": link.next_hop_ipv4_dst,
            "csv_source": link.source,
            "csv_target": link.target,
        }
        g.add_edge(link.source, link.target, key=key, **edge_attrs)
        records.append(
            LinkRecord(
                source=link.source,
                target=link.target,
                latency_ms=float(link.latency_ms),
                bandwidth_mbps=int(link.bandwidth_mbps),
                reservable_bw_mbps=int(reservable),
                srlg=list(link.srlg or []),
                interface_src=link.interface_src,
                interface_dst=link.interface_dst,
                next_hop_ipv4_src=link.next_hop_ipv4_src,
                next_hop_ipv4_dst=link.next_hop_ipv4_dst,
                edge_key=key,
            )
        )

    return nes, g, records

