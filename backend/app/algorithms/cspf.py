"""CSPF path computation (primary + strict node-disjoint backup)."""

from __future__ import annotations

import networkx as nx

from app.algorithms.graph_builder import (
    build_expanded_graph,
    expanded_path_to_edge_sequence,
    expanded_path_to_ne_path,
)
from app.algorithms.utils import yen_k_shortest_paths_simple
from app.core.models import HopDetail, NERecord, PathResult, PrunedEdge, RejectedPath


def _edge_lookup(
    mg: nx.MultiGraph,
) -> dict[tuple[str, str, int], dict]:
    """Build (u,v,key) -> attrs with consistent orientation u<=v not required."""

    out: dict[tuple[str, str, int], dict] = {}
    for u, v, k, d in mg.edges(keys=True, data=True):
        out[(u, v, int(k))] = dict(d)
    return out


def _collect_bandwidth_pruned_edges(
    mg: nx.MultiGraph,
    required_bw: int | None,
) -> list[PrunedEdge]:
    """List edges removed by the bandwidth constraint (CSPF pruning)."""

    pruned: list[PrunedEdge] = []
    req = int(required_bw or 0)
    if req <= 0:
        return pruned
    for u, v, k, data in mg.edges(keys=True, data=True):
        avail = int(data.get("reservable_bw_mbps", 0))
        if avail < req:
            pruned.append(
                PrunedEdge(
                    source=u,
                    target=v,
                    edge_key=int(k),
                    reason=f"Insufficient bandwidth: required {req} Mbps, available {avail} Mbps",
                )
            )
    return pruned


def _build_hops(
    edge_seq: list[tuple[str, str, int]],
    edge_lookup: dict[tuple[str, str, int], dict],
    nes: dict[str, NERecord],
    mode: str,
) -> list[HopDetail]:
    """Create hop objects aligned with directed traversal along edge_seq."""

    hops: list[HopDetail] = []
    for from_ne, to_ne, ek in edge_seq:
        data = edge_lookup.get((from_ne, to_ne, ek)) or edge_lookup.get((to_ne, from_ne, ek)) or {}
        csv_src = str(data.get("csv_source", from_ne))
        csv_dst = str(data.get("csv_target", to_ne))
        if from_ne == csv_src:
            nh = data.get("next_hop_ipv4_src")
            local_iface = data.get("interface_src")
            peer_iface = data.get("interface_dst")
        elif from_ne == csv_dst:
            nh = data.get("next_hop_ipv4_dst")
            local_iface = data.get("interface_dst")
            peer_iface = data.get("interface_src")
        else:
            nh = data.get("next_hop_ipv4_src")
            local_iface = data.get("interface_src")
            peer_iface = data.get("interface_dst")
        lat = float(data.get("latency_ms", 0.0))
        dst_rec = nes.get(to_ne)
        node_sid = dst_rec.node_sid if dst_rec else None
        srv6_sid = None
        if dst_rec and dst_rec.loopback_ipv6 is not None and mode == "srv6":
            srv6_sid = str(dst_rec.loopback_ipv6)
        nh_s = str(nh) if nh is not None else None
        hops.append(
            HopDetail(
                from_ne=from_ne,
                to_ne=to_ne,
                next_hop_ip=nh_s,
                node_sid=node_sid,
                srv6_sid=srv6_sid,
                interface_src=str(local_iface) if local_iface else None,
                interface_dst=str(peer_iface) if peer_iface else None,
                latency_ms=lat,
            )
        )
    return hops


def compute_paths(
    mg: nx.MultiGraph,
    nes: dict[str, NERecord],
    *,
    source: str,
    destination: str,
    required_bw_mbps: int | None,
    max_hops: int,
    mode: str,
    enforce_srlg_diversity: bool,
    time_hour: int | None,
    failed_ne_ids: set[str],
    failed_link_keys: set[tuple[str, str, int]],
) -> tuple[
    PathResult | None,
    PathResult | None,
    list[PathResult],
    list[RejectedPath],
    list[PrunedEdge],
    list[str],
]:
    """
    Compute latency-minimal primary path and strict node-disjoint backup.

    ``mode`` is used for hop SID shaping only.
    """

    warnings: list[str] = []
    pruned = _collect_bandwidth_pruned_edges(mg, required_bw_mbps)
    edge_lookup = _edge_lookup(mg)

    if source not in nes or destination not in nes:
        return None, None, [], [], pruned, ["Unknown source or destination NE id"]
    if source == destination:
        return None, None, [], [], pruned, ["Source and destination must differ"]

    h, ln_map = build_expanded_graph(
        mg,
        required_bw=required_bw_mbps,
        failed_ne_ids=failed_ne_ids,
        failed_link_keys=failed_link_keys,
        time_hour=time_hour,
    )

    rejected: list[RejectedPath] = []

    # K candidates via Yen on expanded graph, then map to NE paths
    k_paths = yen_k_shortest_paths_simple(h, source, destination, weight="weight", max_paths=32)
    primary_exp: list[str] | None = None
    primary_cost: float | None = None
    for path, cost in k_paths:
        ne_path = expanded_path_to_ne_path(path)
        hops_count = len(ne_path) - 1
        if hops_count <= max_hops:
            primary_exp = path
            primary_cost = cost
            break
        rejected.append(
            RejectedPath(
                nodes=ne_path,
                reason=f"Exceeds max hops: {hops_count} > {max_hops}",
                total_latency_ms=float(cost),
                hop_count=hops_count,
            )
        )

    if primary_exp is None:
        if not k_paths:
            warnings.append("No feasible path after pruning failures and bandwidth constraints.")
        else:
            warnings.append("No path satisfies max hop constraint.")
        return None, None, [], rejected, pruned, warnings

    ne_primary = expanded_path_to_ne_path(primary_exp)
    edge_primary = expanded_path_to_edge_sequence(primary_exp, ln_map)
    hop_details = _build_hops(edge_primary, edge_lookup, nes, mode)
    primary = PathResult(
        nodes=ne_primary,
        edges=edge_primary,
        hops=hop_details,
        total_latency_ms=float(primary_cost or 0.0),
        hop_count=len(ne_primary) - 1,
    )

    # ECMP: collect other equal-cost shortest paths (same cost within epsilon)
    ecmp_paths: list[PathResult] = [primary]
    eps = 1e-6
    if primary_cost is not None:
        for path, cost in k_paths:
            if path == primary_exp:
                continue
            ne_path = expanded_path_to_ne_path(path)
            hops_count = len(ne_path) - 1
            if hops_count > max_hops:
                continue
            if abs(cost - primary_cost) <= eps:
                e = expanded_path_to_edge_sequence(path, ln_map)
                ecmp_paths.append(
                    PathResult(
                        nodes=ne_path,
                        edges=e,
                        hops=_build_hops(e, edge_lookup, nes, mode),
                        total_latency_ms=float(cost),
                        hop_count=hops_count,
                    )
                )
            if len(ecmp_paths) >= 6:
                break

    # Additional rejected shorter hop paths that are longer latency than primary
    for path, cost in k_paths:
        ne_path = expanded_path_to_ne_path(path)
        if path == primary_exp:
            continue
        hops_count = len(ne_path) - 1
        if hops_count <= max_hops and cost > (primary_cost or 0.0) + 1e-9:
            rejected.append(
                RejectedPath(
                    nodes=ne_path,
                    reason="Higher cumulative latency than selected primary",
                    total_latency_ms=float(cost),
                    hop_count=hops_count,
                )
            )

    interior = set(ne_primary[1:-1])
    failed2 = set(failed_ne_ids) | interior

    primary_srlgs: set[str] = set()
    if enforce_srlg_diversity:
        for a, b, k in edge_primary:
            d = edge_lookup.get((a, b, k)) or edge_lookup.get((b, a, k)) or {}
            primary_srlgs |= set(d.get("srlg") or [])

    h2, ln_map2 = build_expanded_graph(
        mg,
        required_bw=required_bw_mbps,
        failed_ne_ids=failed2,
        failed_link_keys=failed_link_keys,
        excluded_srlgs=primary_srlgs if primary_srlgs else None,
        time_hour=time_hour,
    )
    from app.algorithms.utils import dijkstra_shortest_path

    backup_exp_result = dijkstra_shortest_path(h2, source, destination, weight="weight")
    backup: PathResult | None = None
    if backup_exp_result is None:
        if primary_srlgs and enforce_srlg_diversity:
            warnings.append("No SRLG-diverse backup path exists for the chosen primary.")
        warnings.append("No strict node-disjoint backup path exists for the chosen primary.")
    else:
        backup_exp, backup_cost = backup_exp_result
        ne_backup = expanded_path_to_ne_path(backup_exp)
        edge_backup = expanded_path_to_edge_sequence(backup_exp, ln_map2)
        backup = PathResult(
            nodes=ne_backup,
            edges=edge_backup,
            hops=_build_hops(edge_backup, edge_lookup, nes, mode),
            total_latency_ms=float(backup_cost),
            hop_count=len(ne_backup) - 1,
        )

    if backup is not None:
        sites_p = {nes[n].site for n in ne_primary[1:-1] if n in nes}
        sites_b = {nes[n].site for n in backup.nodes[1:-1] if n in nes}
        shared_sites = sites_p & sites_b
        if shared_sites:
            warnings.append(
                "Diversity (SRLG-lite): primary and backup both traverse site(s): "
                + ", ".join(sorted(shared_sites))
            )
        pri_pairs = {tuple(sorted((a, b))) for a, b, _k in edge_primary}
        bak_pairs = {tuple(sorted((a, b))) for a, b, _k in backup.edges}
        if pri_pairs & bak_pairs:
            warnings.append(
                "Diversity: primary and backup share at least one physical adjacency (same endpoint pair)."
            )

    return primary, backup, ecmp_paths, rejected, pruned, warnings
