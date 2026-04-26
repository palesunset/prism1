"""IGP traffic redistribution simulation (standalone, no LSPs required)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx
from app.algorithms.role_validator import validate_path_roles


def _edge_id(u: str, v: str, key: int) -> str:
    return f"{u}|{v}|{int(key)}"

def _build_edge_id_map(mg: nx.MultiGraph) -> dict[tuple[str, str, int], str]:
    """
    Build a lookup so traversals in either direction map to the *same* Cytoscape edge id.

    Cytoscape edge ids come from MultiGraph iteration order (u|v|key) and are not guaranteed
    to be sorted. This map ensures (u,v,key) and (v,u,key) both resolve to that stored id.
    """

    m: dict[tuple[str, str, int], str] = {}
    for u, v, k in mg.edges(keys=True):
        uu, vv, kk = str(u), str(v), int(k)
        eid = _edge_id(uu, vv, kk)
        m[(uu, vv, kk)] = eid
        m[(vv, uu, kk)] = eid
    return m


def _parse_edge_id(edge_id: str) -> tuple[str, str, int]:
    parts = edge_id.split("|")
    if len(parts) != 3:
        raise ValueError(f"Invalid link id '{edge_id}' (expected 'u|v|key')")
    u, v = parts[0].strip(), parts[1].strip()
    try:
        k = int(parts[2])
    except ValueError as exc:
        raise ValueError(f"Invalid link id '{edge_id}' (key must be int)") from exc
    if not u or not v:
        raise ValueError(f"Invalid link id '{edge_id}' (empty endpoints)")
    return u, v, k


def _edge_weight(data: dict[str, Any]) -> float:
    # IGP weight for simulation: prefer metric if present, otherwise latency_ms.
    if "metric" in data:
        try:
            return float(data.get("metric") or 0.0)
        except Exception:
            pass
    try:
        return float(data.get("latency_ms") or 0.0)
    except Exception:
        return 0.0


def _edge_util_mbps(data: dict[str, Any]) -> float:
    bw = float(data.get("bandwidth_mbps") or 0.0)
    raw = data.get("current_utilization_mbps", None)
    if raw is None:
        return 0.5 * bw
    try:
        return float(raw)
    except Exception:
        return 0.5 * bw


def _pick_best_parallel_edge(mg: nx.MultiGraph, a: str, b: str) -> tuple[int, dict[str, Any]]:
    ed = mg.get_edge_data(a, b)
    if not ed:
        raise nx.NetworkXNoPath
    best_key: int | None = None
    best_data: dict[str, Any] | None = None
    best_w: float | None = None
    for k, d in ed.items():
        w = _edge_weight(d)
        if best_w is None or w < best_w:
            best_w = w
            best_key = int(k)
            best_data = d
    if best_key is None or best_data is None:
        raise nx.NetworkXNoPath
    return best_key, best_data


@dataclass(frozen=True)
class FailedElement:
    type: str  # "link" | "node"
    id: str


@dataclass(frozen=True)
class ManualRedistribution:
    flow_id: str
    new_path: list[str]
    volume_mbps: float


@dataclass(frozen=True)
class InjectedFlow:
    id: str
    source_ne_id: str
    dest_ne_id: str
    volume_mbps: float


def _build_igp_graph(mg: nx.MultiGraph) -> nx.Graph:
    """Collapse MultiGraph into a simple undirected graph with best (lowest-latency) edge weight."""

    g = nx.Graph()
    for u, v, data in mg.edges(data=True):
        uu, vv = str(u), str(v)
        w = _edge_weight(data)
        if g.has_edge(uu, vv):
            if w < float(g[uu][vv].get("weight", 0.0)):
                g[uu][vv]["weight"] = w
        else:
            g.add_edge(uu, vv, weight=w)
    return g


def _first_valid_shortest_path(
    igp: nx.Graph,
    *,
    source: str,
    target: str,
    role_map: dict[str, str] | None,
    enforce_roles: bool,
    max_paths: int = 60,
) -> list[str] | None:
    """Find the first k-shortest path that passes role validation (if enabled)."""

    if not enforce_roles or role_map is None:
        try:
            return [str(x) for x in nx.shortest_path(igp, source=source, target=target, weight="weight")]
        except Exception:
            return None

    try:
        it = nx.shortest_simple_paths(igp, source, target, weight="weight")
    except Exception:
        return None
    tried = 0
    for nodes in it:
        tried += 1
        if tried > max_paths:
            break
        path_nodes = [str(x) for x in nodes]
        res = validate_path_roles(path_nodes, role_map, target)
        if res.is_valid:
            return path_nodes
    return None


def _has_any_path(igp: nx.Graph, *, source: str, target: str) -> bool:
    try:
        nx.shortest_path(igp, source=source, target=target, weight="weight")
        return True
    except Exception:
        return False


def _path_to_edge_ids(
    g: nx.MultiGraph,
    path_nodes: list[str],
    *,
    edge_id_map: dict[tuple[str, str, int], str] | None = None,
) -> tuple[list[str], float]:
    """Convert a node path to a concrete edge-id sequence using best parallel edge by weight."""

    if len(path_nodes) < 2:
        return [], 0.0
    edges: list[str] = []
    total_lat = 0.0
    for a, b in zip(path_nodes, path_nodes[1:], strict=False):
        k, d = _pick_best_parallel_edge(g, str(a), str(b))
        if edge_id_map is not None:
            edges.append(edge_id_map.get((str(a), str(b), int(k)), _edge_id(str(a), str(b), int(k))))
        else:
            edges.append(_edge_id(str(a), str(b), int(k)))
        try:
            total_lat += float(d.get("latency_ms") or 0.0)
        except Exception:
            pass
    return edges, total_lat


def _remove_failed(g: nx.MultiGraph, failed_elements: list[FailedElement]) -> tuple[set[str], list[tuple[str, str, int]]]:
    failed_nodes: set[str] = {f.id for f in failed_elements if f.type == "node"}
    failed_links: list[tuple[str, str, int]] = []
    for f in failed_elements:
        if f.type != "link":
            continue
        u, v, k = _parse_edge_id(f.id)
        failed_links.append((u, v, k))

    for n in failed_nodes:
        if g.has_node(n):
            g.remove_node(n)
    for u, v, k in failed_links:
        if g.has_edge(u, v, key=k):
            g.remove_edge(u, v, key=k)
    return failed_nodes, failed_links


def _added_mbps_from_flows(flows: list[dict[str, Any]]) -> dict[str, float]:
    added: dict[str, float] = {}
    for f in flows:
        vol = float(f.get("volume_mbps") or 0.0)
        for eid in f.get("path_edges") or []:
            added[str(eid)] = float(added.get(str(eid), 0.0)) + vol
        # Include manually overridden segment, if present (flow is moved from base path to manual path)
        if f.get("manual_override") and f.get("manual_new_path_edges") and f.get("manual_volume_mbps"):
            moved = float(f.get("manual_volume_mbps") or 0.0)
            for eid in f.get("path_edges") or []:
                added[str(eid)] = float(added.get(str(eid), 0.0)) - moved
            for eid in f.get("manual_new_path_edges") or []:
                added[str(eid)] = float(added.get(str(eid), 0.0)) + moved
    for k in list(added.keys()):
        if added[k] < 0:
            added[k] = 0.0
    return added


def suggest_relief_paths(
    topology: nx.MultiGraph,
    failed_elements: list[FailedElement],
    *,
    congestion_threshold: float = 80.0,
    max_extra_latency_ms: float = 10.0,
    max_suggestions_per_link: int = 3,
    enforce_roles: bool = False,
    role_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Suggest congestion relief by moving (some) flow traffic to alternate paths.

    Strategy:
    - Run the current post-failure simulation to get flows + congested links.
    - For each congested link, find flows traversing it.
    - For each such flow, generate k-shortest alternate paths (excluding current path) within max_extra_latency.
    - Accept candidates that keep all links below threshold after moving the flow volume.
    - Rank by extra latency, then by best min headroom.
    """

    # Baseline simulation (no manual redistributions at planning step)
    baseline = simulate_traffic_failure(topology, failed_elements, congestion_threshold=congestion_threshold)
    flows: list[dict[str, Any]] = list(baseline.get("flows") or [])
    congested_links: list[dict[str, Any]] = list(baseline.get("congested_links") or [])

    # Build working graphs with failures removed
    mg = nx.MultiGraph(topology)
    mg.remove_edges_from([])
    _remove_failed(mg, failed_elements)
    igp = _build_igp_graph(mg)
    edge_id_map = _build_edge_id_map(topology)

    # Recompute before/bw from topology (same as simulate)
    before_mbps: dict[str, float] = {}
    bw_mbps: dict[str, float] = {}
    for u, v, k, d in topology.edges(keys=True, data=True):
        eid = _edge_id(str(u), str(v), int(k))
        bw_mbps[eid] = float(d.get("bandwidth_mbps") or 0.0)
        before_mbps[eid] = _edge_util_mbps(d)

    added_mbps = _added_mbps_from_flows(flows)

    def after_pct(edge_id: str, added_override: dict[str, float] | None = None) -> float:
        bw = float(bw_mbps.get(edge_id, 0.0))
        if bw <= 0:
            return 0.0
        before = float(before_mbps.get(edge_id, 0.0))
        add = float((added_override or added_mbps).get(edge_id, 0.0))
        return ((before + add) / bw) * 100.0

    suggestions_out: list[dict[str, Any]] = []
    threshold = float(congestion_threshold)

    for cong in congested_links:
        cong_id = str(cong.get("edge_id") or "")
        if not cong_id:
            continue
        affected_flows = [f for f in flows if cong_id in set(map(str, f.get("path_edges") or []))]
        recs: list[dict[str, Any]] = []

        for f in affected_flows:
            flow_id = str(f.get("flow_id") or f.get("failed_link_id") or "")
            src = str(f.get("source") or "")
            dst = str(f.get("target") or "")
            vol = float(f.get("volume_mbps") or 0.0)
            current_nodes = [str(x) for x in (f.get("path_nodes") or [])]
            current_lat = float(f.get("path_latency_ms") or 0.0)
            if not flow_id or not src or not dst or vol <= 0 or len(current_nodes) < 2:
                continue

            # Candidate paths (k-shortest simple paths on the collapsed graph)
            try:
                paths_iter = nx.shortest_simple_paths(igp, src, dst, weight="weight")
            except Exception:
                continue

            tried = 0
            for cand_nodes in paths_iter:
                tried += 1
                if tried > 40:  # cap search effort
                    break
                cand_nodes = [str(x) for x in cand_nodes]
                if cand_nodes == current_nodes:
                    continue
                if enforce_roles and role_map is not None:
                    if not validate_path_roles(cand_nodes, role_map, dst).is_valid:
                        continue
                try:
                    cand_edges, cand_lat = _path_to_edge_ids(mg, cand_nodes, edge_id_map=edge_id_map)
                except Exception:
                    continue
                extra = float(cand_lat) - current_lat
                if extra < 0:
                    extra = 0.0
                if extra > float(max_extra_latency_ms):
                    continue

                # Apply "move" by overriding added_mbps
                next_added = dict(added_mbps)
                for eid in f.get("path_edges") or []:
                    e = str(eid)
                    next_added[e] = float(next_added.get(e, 0.0)) - vol
                for eid in cand_edges:
                    next_added[str(eid)] = float(next_added.get(str(eid), 0.0)) + vol
                for k in list(next_added.keys()):
                    if next_added[k] < 0:
                        next_added[k] = 0.0

                # Validate: no link exceeds threshold
                ok = True
                min_headroom = None
                new_util_map: dict[str, float] = {}
                for eid, bw in bw_mbps.items():
                    if bw <= 0:
                        continue
                    pct = after_pct(eid, next_added)
                    if pct >= threshold:
                        ok = False
                        break
                    headroom = 100.0 - pct
                    min_headroom = headroom if min_headroom is None else min(min_headroom, headroom)
                if not ok:
                    continue

                # Only include utils for links touched by the candidate (plus congested link)
                for eid in set([*map(str, cand_edges), cong_id]):
                    new_util_map[eid] = after_pct(eid, next_added)

                reason = "Alternate path provides more headroom with minimal extra latency."
                recs.append(
                    {
                        "flow_id": flow_id,
                        "volume_mbps": vol,
                        "current_path": current_nodes,
                        "new_path": cand_nodes,
                        "extra_latency_ms": extra,
                        "new_utilization": new_util_map,
                        "reason": reason,
                        "_rank_headroom": float(min_headroom or 0.0),
                    }
                )

                if len(recs) >= int(max_suggestions_per_link):
                    break

        # Rank: extra latency then best min headroom
        recs.sort(key=lambda r: (float(r.get("extra_latency_ms") or 0.0), -float(r.get("_rank_headroom") or 0.0)))
        for r in recs:
            r.pop("_rank_headroom", None)

        suggestions_out.append(
            {
                "congested_link_id": cong_id,
                "original_utilization_pct": float(cong.get("after_util_pct") or cong.get("after_util_pct") or 0.0),
                "recommendations": recs[: int(max_suggestions_per_link)],
            }
        )

    return {"suggestions": suggestions_out}

def simulate_traffic_failure(
    topology: nx.MultiGraph,
    failed_elements: list[FailedElement],
    *,
    congestion_threshold: float = 80.0,
    manual_redistributions: list[ManualRedistribution] | None = None,
    injected_flows: list[InjectedFlow] | None = None,
    enforce_roles: bool = False,
    role_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Simulate failures and redistribute *existing* traffic via shortest path (IGP).

    - Failed nodes are removed from the graph.
    - Failed links (u,v,key) are removed; their pre-failure traffic is re-routed from u to v.
    - Traffic is added to each traversed physical edge on the new path (best parallel edge by weight).
    """

    g: nx.MultiGraph = nx.MultiGraph(topology)  # shallow copy
    g.remove_edges_from([])  # no-op; keeps static checkers calm
    _failed_nodes, failed_links = _remove_failed(g, failed_elements)
    igp = _build_igp_graph(g)
    edge_id_map = _build_edge_id_map(topology)

    # Snapshot "before" utilization (from original topology, not the modified copy).
    before_mbps: dict[str, float] = {}
    bw_mbps: dict[str, float] = {}
    for u, v, k, d in topology.edges(keys=True, data=True):
        eid = _edge_id(str(u), str(v), int(k))
        bw = float(d.get("bandwidth_mbps") or 0.0)
        bw_mbps[eid] = bw
        before_mbps[eid] = _edge_util_mbps(d)

    added_mbps: dict[str, float] = {}
    flows: list[dict[str, Any]] = []
    disconnected: list[dict[str, Any]] = []

    for u, v, k in failed_links:
        failed_id = _edge_id(u, v, k)
        # If the failed link didn't exist in the imported topology, report as disconnected.
        vol = before_mbps.get(failed_id, 0.0)
        if vol <= 0:
            disconnected.append({"failed_link_id": failed_id, "source": u, "target": v, "reason": "unknown_link"})
            continue

        if u not in g or v not in g:
            disconnected.append({"failed_link_id": failed_id, "source": u, "target": v, "reason": "endpoint_missing"})
            continue

        path_nodes = _first_valid_shortest_path(
            igp,
            source=u,
            target=v,
            role_map=role_map,
            enforce_roles=enforce_roles,
        )
        if not path_nodes:
            reason = "no_path"
            if enforce_roles and role_map is not None and _has_any_path(igp, source=u, target=v):
                reason = "role_rules"
            disconnected.append({"failed_link_id": failed_id, "source": u, "target": v, "reason": reason})
            continue

        path_edges, path_latency = _path_to_edge_ids(g, path_nodes, edge_id_map=edge_id_map)
        for e_id in path_edges:
            added_mbps[e_id] = float(added_mbps.get(e_id, 0.0)) + float(vol)

        flows.append(
            {
                "flow_id": failed_id,
                "failed_link_id": failed_id,
                "source": u,
                "target": v,
                "volume_mbps": float(vol),
                "path_nodes": path_nodes,
                "path_edges": path_edges,
                "path_latency_ms": float(path_latency),
            }
        )

    injected_results: list[dict[str, Any]] = []
    if injected_flows:
        for inj in injected_flows:
            fid = f"injected:{inj.id}"
            src = str(inj.source_ne_id)
            dst = str(inj.dest_ne_id)
            vol = float(inj.volume_mbps)
            if vol <= 0:
                continue
            if src not in g or dst not in g:
                injected_results.append(
                    {
                        "id": inj.id,
                        "source_ne_id": src,
                        "dest_ne_id": dst,
                        "volume_mbps": vol,
                        "disconnected": True,
                        "reason": "endpoint_missing",
                    }
                )
                continue
            path_nodes = _first_valid_shortest_path(
                igp,
                source=src,
                target=dst,
                role_map=role_map,
                enforce_roles=enforce_roles,
            )
            if not path_nodes:
                reason = "no_path"
                if enforce_roles and role_map is not None and _has_any_path(igp, source=src, target=dst):
                    reason = "role_rules"
                injected_results.append(
                    {
                        "id": inj.id,
                        "source_ne_id": src,
                        "dest_ne_id": dst,
                        "volume_mbps": vol,
                        "disconnected": True,
                        "reason": reason,
                    }
                )
                continue

            path_edges, path_latency = _path_to_edge_ids(g, path_nodes, edge_id_map=edge_id_map)
            for e_id in path_edges:
                added_mbps[e_id] = float(added_mbps.get(e_id, 0.0)) + vol
            injected_results.append(
                {
                    "id": inj.id,
                    "flow_id": fid,
                    "source_ne_id": src,
                    "dest_ne_id": dst,
                    "volume_mbps": vol,
                    "path_nodes": path_nodes,
                    "path_edges": path_edges,
                    "path_latency_ms": float(path_latency),
                    "disconnected": False,
                }
            )

    # Apply manual redistributions (move a subset of a flow to a new path).
    if manual_redistributions:
        flows_by_id = {str(f.get("flow_id")): f for f in flows}
        for mr in manual_redistributions:
            f = flows_by_id.get(mr.flow_id)
            if not f:
                continue
            vol = float(mr.volume_mbps)
            if vol <= 0:
                continue
            if vol > float(f.get("volume_mbps") or 0.0):
                vol = float(f.get("volume_mbps") or 0.0)
            current_edges = list(f.get("path_edges") or [])
            for e_id in current_edges:
                added_mbps[e_id] = float(added_mbps.get(e_id, 0.0)) - vol
            new_nodes = [str(x) for x in mr.new_path]
            try:
                new_edges, new_lat = _path_to_edge_ids(g, new_nodes, edge_id_map=edge_id_map)
            except Exception:
                # ignore invalid manual path
                for e_id in current_edges:
                    added_mbps[e_id] = float(added_mbps.get(e_id, 0.0)) + vol
                continue
            for e_id in new_edges:
                added_mbps[e_id] = float(added_mbps.get(e_id, 0.0)) + vol

            # Track that the flow was manually steered (for UI overlays)
            f["manual_override"] = True
            f["manual_volume_mbps"] = vol
            f["manual_new_path_nodes"] = new_nodes
            f["manual_new_path_edges"] = new_edges
            f["manual_extra_latency_ms"] = float(new_lat) - float(f.get("path_latency_ms") or 0.0)

        # Clamp small negatives from subtraction rounding
        for k in list(added_mbps.keys()):
            if added_mbps[k] < 0:
                added_mbps[k] = 0.0

    link_before_pct: dict[str, float] = {}
    link_after_pct: dict[str, float] = {}
    congested: list[dict[str, Any]] = []

    for eid, bw in bw_mbps.items():
        if bw <= 0:
            continue
        before = float(before_mbps.get(eid, 0.0))
        added = float(added_mbps.get(eid, 0.0))
        after = before + added
        before_pct = (before / bw) * 100.0
        after_pct = (after / bw) * 100.0
        link_before_pct[eid] = before_pct
        link_after_pct[eid] = after_pct
        if after_pct >= float(congestion_threshold):
            # Extra needed formula (per spec) with 20% headroom.
            extra_needed = max(0.0, (after_pct / 100.0 * bw) - (0.8 * bw)) * 1.2
            congested.append(
                {
                    "edge_id": eid,
                    "before_util_pct": before_pct,
                    "after_util_pct": after_pct,
                    "delta_mbps": added,
                    "extra_bandwidth_mbps": extra_needed,
                }
            )

    return {
        "flows": flows,
        "injected_flows": injected_results,
        "link_utilization_before_pct": link_before_pct,
        "link_utilization_after_pct": link_after_pct,
        "congested_links": sorted(congested, key=lambda x: float(x.get("after_util_pct", 0.0)), reverse=True),
        "disconnected_flows": disconnected,
    }

