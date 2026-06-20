"""CSPF path computation (primary + strict node-disjoint backup)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Literal

import networkx as nx

from app.algorithms.graph_builder import (
    build_ne_cspf_graph,
    ne_path_to_edge_sequence,
)
from app.algorithms.role_utils import resolve_ne_role, role_aware_allowed_ne_ids
from app.algorithms.role_validator import validate_path_roles
from app.algorithms.utils import dijkstra_shortest_path, k_shortest_paths
from app.core.models import HopDetail, NERecord, PathResult, PrunedEdge, RejectedPath

log = logging.getLogger(__name__)

K_SHORTEST_MAX_PATHS = 16
"""K-shortest candidates for backup / trade-off scans."""

K_SHORTEST_PRIMARY_SCAN = 32
"""K-shortest candidates for primary selection (role-filtered)."""

MAX_REJECTED_PATHS = 30
"""Cap rejected-path payload size returned to the UI."""

TradeoffMode = Literal["percent", "absolute"]


def _apply_role_graph_prune(
    h: nx.Graph,
    *,
    nes: dict[str, NERecord],
    role_map: dict[str, str],
    source: str,
    destination: str,
    enforce_roles: bool,
) -> nx.Graph:
    """Drop transit access NEs so Dijkstra prefers valid core routes (e.g. ORMOC not MARAMAG)."""

    if not enforce_roles:
        return h
    allowed = role_aware_allowed_ne_ids(nes, role_map, source, destination)
    allowed.add(source)
    allowed.add(destination)
    keep = [n for n in h.nodes if n in allowed]
    return h.subgraph(keep).copy()


def tradeoff_max_latency_ms(
    optimal_latency: float, tradeoff_mode: TradeoffMode, tradeoff_value: float
) -> float:
    """
    Return maximum allowed primary latency (ms) for the best valid primary
    and user tolerance. When ``optimal_latency`` is infinite, returns it unchanged.
    """
    o = float(optimal_latency)
    v = float(tradeoff_value)
    if o == float("inf") or o != o:
        return o
    if v <= 0.0:
        return o
    if tradeoff_mode == "absolute":
        return o + v
    return o * (1.0 + v / 100.0)


def find_primary_with_backup_tradeoff(
    _mg: nx.MultiGraph,
    k_paths: list[tuple[list[str], float]],
    destination: str,
    max_hops: int,
    enforce_roles: bool,
    role_map: dict[str, str],
    optimal_ref_ms: float,
    cap_ms: float,
    build_primary: Callable[[list[str], float], PathResult],
    try_backup: Callable[[PathResult, bool], tuple[PathResult | None, list[RejectedPath]]],
) -> tuple[PathResult | None, PathResult | None, float, list[RejectedPath]]:
    """
    Search K shortest primaries in order; return the first (primary, backup) pair
    with primary cost <= ``cap_ms`` and a valid node-disjoint backup.
    This is the trade-off K-shortest pass used from :func:`compute_paths`.
    """
    return _scan_tradeoff(
        k_paths,
        optimal_ref_ms,
        cap_ms,
        max_hops=max_hops,
        enforce_roles=enforce_roles,
        role_map=role_map,
        target=destination,
        build_primary=build_primary,
        try_backup=try_backup,
    )


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


def _node_disjoint_backup(
    mg: nx.MultiGraph,
    edge_lookup: dict[tuple[str, str, int], dict],
    nes: dict[str, NERecord],
    mode: str,
    *,
    source: str,
    destination: str,
    ne_primary: list[str],
    edge_primary: list[tuple[str, str, int]],
    required_bw_mbps: int | None,
    max_hops: int,
    failed_ne_ids: set[str],
    failed_link_keys: set[tuple[str, str, int]],
    time_hour: int | None,
    enforce_srlg_diversity: bool,
    enforce_roles: bool = True,
    quiet: bool = False,
) -> tuple[PathResult | None, list[str], list[RejectedPath], list[str]]:
    """
    Try strict node-disjoint backup. When ``quiet`` is True, Dijkstra/SRLG failure
    messages are omitted (for inner trade-off iterations).
    """
    messages: list[str] = []
    rejected: list[RejectedPath] = []
    extra_div: list[str] = []
    role_map: dict[str, str] = {nid: resolve_ne_role(rec.role, nid) for nid, rec in nes.items()}

    interior = set(ne_primary[1:-1])
    failed2 = set(failed_ne_ids) | interior

    primary_srlgs: set[str] = set()
    if enforce_srlg_diversity:
        for a, b, k in edge_primary:
            d = edge_lookup.get((a, b, k)) or edge_lookup.get((b, a, k)) or {}
            primary_srlgs |= set(d.get("srlg") or [])

    h2 = build_ne_cspf_graph(
        mg,
        required_bw=required_bw_mbps,
        failed_ne_ids=failed2,
        failed_link_keys=failed_link_keys,
        excluded_srlgs=primary_srlgs if primary_srlgs else None,
        time_hour=time_hour,
    )
    h2 = _apply_role_graph_prune(
        h2,
        nes=nes,
        role_map=role_map,
        source=source,
        destination=destination,
        enforce_roles=enforce_roles,
    )
    # Important: the single shortest node-disjoint backup can violate role rules even though
    # a slightly longer valid backup exists. Scan multiple backup candidates.
    backup_candidates: list[tuple[list[str], float]] = []
    first_backup = dijkstra_shortest_path(h2, source, destination, weight="weight")
    if first_backup is not None:
        backup_candidates.append(first_backup)

    backup: PathResult | None = None
    for ne_backup, backup_cost in backup_candidates:
        hops_count = len(ne_backup) - 1
        if hops_count > max_hops:
            rejected.append(
                RejectedPath(
                    nodes=list(ne_backup),
                    reason=f"Exceeds max hops: {hops_count} > {max_hops}",
                    total_latency_ms=float(backup_cost),
                    hop_count=hops_count,
                )
            )
            continue
        br = validate_path_roles(ne_backup, role_map, destination)
        if not br.is_valid:
            rejected.append(
                RejectedPath(
                    nodes=list(ne_backup),
                    reason=br.reason,
                    total_latency_ms=float(backup_cost),
                    hop_count=hops_count,
                )
            )
            continue
        edge_backup = ne_path_to_edge_sequence(h2, ne_backup)
        backup = PathResult(
            nodes=list(ne_backup),
            edges=edge_backup,
            hops=_build_hops(edge_backup, edge_lookup, nes, mode),
            total_latency_ms=float(backup_cost),
            hop_count=hops_count,
        )
        break

    if backup is None:
        k_backups = k_shortest_paths(
            h2, source, destination, weight="weight", max_paths=K_SHORTEST_MAX_PATHS
        )
        seen_backup: set[tuple[str, ...]] = {tuple(p) for p, _ in backup_candidates}
        for path, cost in k_backups:
            key = tuple(path)
            if key in seen_backup:
                continue
            seen_backup.add(key)
            ne_backup = path
            backup_cost = cost
            hops_count = len(ne_backup) - 1
            if hops_count > max_hops:
                rejected.append(
                    RejectedPath(
                        nodes=list(ne_backup),
                        reason=f"Exceeds max hops: {hops_count} > {max_hops}",
                        total_latency_ms=float(backup_cost),
                        hop_count=hops_count,
                    )
                )
                continue
            br = validate_path_roles(ne_backup, role_map, destination)
            if not br.is_valid:
                rejected.append(
                    RejectedPath(
                        nodes=list(ne_backup),
                        reason=br.reason,
                        total_latency_ms=float(backup_cost),
                        hop_count=hops_count,
                    )
                )
                continue
            edge_backup = ne_path_to_edge_sequence(h2, ne_backup)
            backup = PathResult(
                nodes=list(ne_backup),
                edges=edge_backup,
                hops=_build_hops(edge_backup, edge_lookup, nes, mode),
                total_latency_ms=float(backup_cost),
                hop_count=hops_count,
            )
            break

    if backup is None:
        if not quiet:
            if primary_srlgs and enforce_srlg_diversity:
                messages.append("No SRLG-diverse backup path exists for the chosen primary.")
            messages.append("No strict node-disjoint backup path exists for the chosen primary.")
            return None, messages, rejected, extra_div
        return None, ["role"], rejected, extra_div

    sites_p = {nes[n].site for n in ne_primary[1:-1] if n in nes}
    sites_b = {nes[n].site for n in backup.nodes[1:-1] if n in nes}
    shared_sites = sites_p & sites_b
    if shared_sites:
        extra_div.append(
            "Diversity (SRLG-lite): primary and backup both traverse site(s): " + ", ".join(sorted(shared_sites))
        )
    pri_pairs = {tuple(sorted((a, b))) for a, b, _k in edge_primary}
    bak_pairs = {tuple(sorted((a, b))) for a, b, _k in backup.edges}
    if pri_pairs & bak_pairs:
        extra_div.append(
            "Diversity: primary and backup share at least one physical adjacency (same endpoint pair)."
        )
    return backup, [], rejected, extra_div


def _primary_from_ne_path(
    ne_path: list[str],
    cost: float,
    h: nx.Graph,
    edge_lookup: dict[tuple[str, str, int], dict],
    nes: dict[str, NERecord],
    mode: str,
) -> PathResult:
    edge_primary = ne_path_to_edge_sequence(h, ne_path)
    hop_details = _build_hops(edge_primary, edge_lookup, nes, mode)
    return PathResult(
        nodes=list(ne_path),
        edges=edge_primary,
        hops=hop_details,
        total_latency_ms=float(cost or 0.0),
        hop_count=len(ne_path) - 1,
    )


def _scan_tradeoff(
    k_paths: list[tuple[list[str], float]],
    optimal_ref_ms: float,
    cap_ms: float,
    *,
    max_hops: int,
    enforce_roles: bool,
    role_map: dict[str, str],
    target: str,
    build_primary: Callable[[list[str], float], PathResult],
    try_backup: Callable[[PathResult, bool], tuple[PathResult | None, list[RejectedPath]]],
) -> tuple[PathResult | None, PathResult | None, float, list[RejectedPath]]:
    """Return first (primary, backup) within cap_ms whose backup exists."""

    more_rejected: list[RejectedPath] = []
    for path, cost in k_paths:
        if cost > cap_ms + 1e-9:
            break
        ne_path = path
        hops_count = len(ne_path) - 1
        if hops_count > max_hops:
            continue
        if enforce_roles and not validate_path_roles(ne_path, role_map, target).is_valid:
            continue
        p_res = build_primary(path, float(cost))
        b, rj = try_backup(p_res, True)
        more_rejected.extend(rj)
        if b is not None and abs(float(cost) - optimal_ref_ms) > 1e-6:
            log.debug("Trade-off: optimal %.3f ms, selected %.3f ms", optimal_ref_ms, cost)
        if b is not None:
            return p_res, b, float(cost) - optimal_ref_ms, more_rejected
    return None, None, 0.0, more_rejected


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
    enforce_roles: bool = True,
    tradeoff_mode: TradeoffMode = "percent",
    tradeoff_value: float = 0.0,
) -> tuple[
    PathResult | None,
    PathResult | None,
    list[PathResult],
    list[RejectedPath],
    list[PrunedEdge],
    list[str],
    float | None,
    float | None,
]:
    """
    Compute primary path and strict node-disjoint backup.

    The last tuple fields are reference optimal primary latency and extra primary
    latency (ms) vs that reference when a non-optimal primary was chosen to obtain a backup.
    """
    warnings: list[str] = []
    pruned = _collect_bandwidth_pruned_edges(mg, required_bw_mbps)
    edge_lookup = _edge_lookup(mg)

    if source not in nes or destination not in nes:
        return None, None, [], [], pruned, ["Unknown source or destination NE id"], None, None
    if source == destination:
        return None, None, [], [], pruned, ["Source and destination must differ"], None, None

    h = build_ne_cspf_graph(
        mg,
        required_bw=required_bw_mbps,
        failed_ne_ids=failed_ne_ids,
        failed_link_keys=failed_link_keys,
        time_hour=time_hour,
    )
    role_map: dict[str, str] = {nid: resolve_ne_role(rec.role, nid) for nid, rec in nes.items()}
    h = _apply_role_graph_prune(
        h,
        nes=nes,
        role_map=role_map,
        source=source,
        destination=destination,
        enforce_roles=enforce_roles,
    )
    target = destination
    primary_ne: list[str] | None = None
    primary_cost: float | None = None
    rejected: list[RejectedPath] = []
    k_paths: list[tuple[list[str], float]] = []

    first = dijkstra_shortest_path(h, source, destination, weight="weight")
    if first is not None:
        ne_path, cost = first
        hops_count = len(ne_path) - 1
        role_ok = not enforce_roles or validate_path_roles(ne_path, role_map, target).is_valid
        if hops_count <= max_hops and role_ok:
            primary_ne = ne_path
            primary_cost = cost

    if primary_ne is None:
        k_paths = k_shortest_paths(
            h, source, destination, weight="weight", max_paths=K_SHORTEST_PRIMARY_SCAN
        )
        for ne_path, cost in k_paths:
            hops_count = len(ne_path) - 1
            if hops_count > max_hops:
                if len(rejected) < MAX_REJECTED_PATHS:
                    rejected.append(
                        RejectedPath(
                            nodes=ne_path,
                            reason=f"Exceeds max hops: {hops_count} > {max_hops}",
                            total_latency_ms=float(cost),
                            hop_count=hops_count,
                        )
                    )
                continue
            if enforce_roles:
                role_res = validate_path_roles(ne_path, role_map, target)
                if not role_res.is_valid:
                    if len(rejected) < MAX_REJECTED_PATHS:
                        rejected.append(
                            RejectedPath(
                                nodes=ne_path,
                                reason=role_res.reason,
                                total_latency_ms=float(cost),
                                hop_count=hops_count,
                            )
                        )
                    continue
            primary_ne = ne_path
            primary_cost = cost
            break

    if primary_ne is None:
        if not k_paths and first is None:
            warnings.append("No feasible path after pruning failures and bandwidth constraints.")
        else:
            warnings.append(
                "No feasible primary path under current constraints (max hops"
                + (", role rules" if enforce_roles else "")
                + ", and link metrics).",
            )
        return None, None, [], rejected, pruned, warnings, None, None

    assert primary_cost is not None
    optimal_ref_ms = float(primary_cost)
    first_primary = _primary_from_ne_path(primary_ne, float(primary_cost), h, edge_lookup, nes, mode)

    def try_one_backup(
        p_res: PathResult, quiet: bool
    ) -> tuple[PathResult | None, list[RejectedPath]]:
        b, m, r, div = _node_disjoint_backup(
            mg,
            edge_lookup,
            nes,
            mode,
            source=source,
            destination=destination,
            ne_primary=p_res.nodes,
            edge_primary=p_res.edges,
            required_bw_mbps=required_bw_mbps,
            max_hops=max_hops,
            failed_ne_ids=failed_ne_ids,
            failed_link_keys=failed_link_keys,
            time_hour=time_hour,
            enforce_srlg_diversity=enforce_srlg_diversity,
            enforce_roles=enforce_roles,
            quiet=quiet,
        )
        if not quiet and b is None and m:
            for msg in m:
                if msg and msg not in warnings:
                    warnings.append(msg)
        if b is not None and div:
            warnings.extend(div)
        return b, r

    b0, m0, r0, d0 = _node_disjoint_backup(
        mg,
        edge_lookup,
        nes,
        mode,
        source=source,
        destination=destination,
        ne_primary=first_primary.nodes,
        edge_primary=first_primary.edges,
        required_bw_mbps=required_bw_mbps,
        max_hops=max_hops,
        failed_ne_ids=failed_ne_ids,
        failed_link_keys=failed_link_keys,
        time_hour=time_hour,
        enforce_srlg_diversity=enforce_srlg_diversity,
        enforce_roles=enforce_roles,
        quiet=False,
    )
    rejected.extend(r0)
    if b0 is not None and d0:
        warnings.extend(d0)
    primary: PathResult = first_primary
    backup: PathResult | None = b0
    tradeoff_applied_ms = 0.0
    use_tradeout = float(tradeoff_value) > 0.0

    if b0 is None and not use_tradeout and m0:
        warnings.extend(m0)

    if b0 is None and use_tradeout and (k_paths or first is not None):
        if not k_paths and first is not None:
            k_paths = [first]
        cap = tradeoff_max_latency_ms(optimal_ref_ms, tradeoff_mode, float(tradeoff_value))
        p2, b2, delta, more_rej = find_primary_with_backup_tradeoff(
            mg,
            k_paths,
            destination,
            max_hops,
            enforce_roles,
            role_map,
            optimal_ref_ms,
            cap,
            build_primary=lambda pth, c: _primary_from_ne_path(pth, c, h, edge_lookup, nes, mode),
            try_backup=try_one_backup,
        )
        rejected.extend(more_rej)
        if p2 is not None and b2 is not None:
            primary, backup = p2, b2
            tradeoff_applied_ms = float(delta)
        else:
            if m0:
                warnings.extend(m0)
            warnings.append("No disjoint backup found within trade-off tolerance")
    p_cost = primary.total_latency_ms
    eps = 1e-6
    ecmp_paths: list[PathResult] = [primary] if primary else []
    for ne_path, cost in k_paths:
        if len(ne_path) - 1 > max_hops:
            continue
        if enforce_roles and not validate_path_roles(ne_path, role_map, target).is_valid:
            continue
        if abs(float(cost) - p_cost) > eps:
            continue
        if ne_path == primary.nodes:
            continue
        e = ne_path_to_edge_sequence(h, ne_path)
        ecmp_paths.append(
            PathResult(
                nodes=ne_path,
                edges=e,
                hops=_build_hops(e, edge_lookup, nes, mode),
                total_latency_ms=float(cost),
                hop_count=len(ne_path) - 1,
            )
        )
        if len(ecmp_paths) >= 6:
            break
    if not ecmp_paths and primary:
        ecmp_paths = [primary]
    opt_out: float = optimal_ref_ms
    ta_out = tradeoff_applied_ms if backup is not None else 0.0
    if abs(primary.total_latency_ms - optimal_ref_ms) < eps:
        ta_out = 0.0
    return primary, backup, ecmp_paths, rejected, pruned, warnings, opt_out, ta_out
