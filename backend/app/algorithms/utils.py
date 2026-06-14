"""Small helpers for graph and path manipulation."""

from __future__ import annotations

import heapq
from collections.abc import Iterable
from itertools import islice

import networkx as nx
from networkx import shortest_simple_paths


def cumulative_latency(latencies: Iterable[float]) -> float:
    """Sum edge latencies."""

    return float(sum(latencies))


def link_node_id(u: str, v: str, key: int) -> str:
    """Stable synthetic node id for a physical link in the expanded graph."""

    a, b = (u, v) if u < v else (v, u)
    return f"__LN:{a}|{b}|{key}"


def dijkstra_shortest_path(
    g: nx.Graph,
    source: str,
    target: str,
    weight: str = "weight",
) -> tuple[list[str], float] | None:
    """Dijkstra shortest path with non-negative weights; returns node list and cost."""

    if source not in g or target not in g:
        return None
    dist: dict[str, float] = {source: 0.0}
    pred: dict[str, str | None] = {source: None}
    pq: list[tuple[float, str]] = [(0.0, source)]
    visited: set[str] = set()
    while pq:
        d, u = heapq.heappop(pq)
        if u in visited:
            continue
        visited.add(u)
        if u == target:
            path: list[str] = []
            cur: str | None = target
            while cur is not None:
                path.append(cur)
                cur = pred[cur]
            path.reverse()
            return path, d
        for _, v, data in g.edges(u, data=True):
            w = float(data.get(weight, 1.0))
            nd = d + w
            if v not in dist or nd < dist[v]:
                dist[v] = nd
                pred[v] = u
                heapq.heappush(pq, (nd, v))
    return None


def k_shortest_paths(
    graph: nx.Graph,
    source: str,
    target: str,
    weight: str = "weight",
    max_paths: int = 16,
) -> list[tuple[list[str], float]]:
    """Return up to ``max_paths`` loopless shortest paths (NetworkX Yen iterator)."""

    if source not in graph or target not in graph:
        return []
    results: list[tuple[list[str], float]] = []
    try:
        path_iter = shortest_simple_paths(graph, source, target, weight=weight)
        for path in islice(path_iter, max_paths):
            cost = 0.0
            for u, v in zip(path[:-1], path[1:], strict=True):
                cost += float(graph[u][v][weight])
            results.append((path, cost))
    except nx.NetworkXNoPath:
        pass
    return results


def yen_k_shortest_paths_simple(
    graph: nx.Graph,
    source: str,
    target: str,
    weight: str = "weight",
    max_paths: int = 16,
) -> list[tuple[list[str], float]]:
    """
    Yen's algorithm for K shortest loopless paths (non-negative edge weights).

    Operates on graph copies for spur path calculations.
    """

    def path_cost(g: nx.Graph, path: list[str]) -> float:
        total = 0.0
        for u, v in zip(path[:-1], path[1:], strict=True):
            total += float(g[u][v][weight])
        return total

    first = dijkstra_shortest_path(graph, source, target, weight=weight)
    if first is None:
        return []
    p1, c1 = first
    results: list[tuple[list[str], float]] = [(p1, c1)]
    candidates: list[tuple[float, tuple[str, ...]]] = []

    for _ in range(1, max_paths):
        last_path = results[-1][0]
        for i in range(len(last_path) - 1):
            spur_node = last_path[i]
            root_path = last_path[: i + 1]
            g_copy = graph.copy()
            for p, _ in results:
                if len(p) > i and p[: i + 1] == root_path:
                    u, v = p[i], p[i + 1]
                    if g_copy.has_edge(u, v):
                        g_copy.remove_edge(u, v)
            for node in root_path[:-1]:
                if node != spur_node and node in g_copy:
                    g_copy.remove_node(node)
            spur_path_result = dijkstra_shortest_path(g_copy, spur_node, target, weight=weight)
            if spur_path_result is None:
                continue
            spur_path, _spur_cost = spur_path_result
            total_path = root_path[:-1] + spur_path
            if len(set(total_path)) != len(total_path):
                continue
            cost = path_cost(graph, total_path)
            heapq.heappush(candidates, (cost, tuple(total_path)))
        found = False
        while candidates:
            cost, cand_t = heapq.heappop(candidates)
            cand = list(cand_t)
            if cand in [p for p, _ in results]:
                continue
            results.append((cand, cost))
            found = True
            break
        if not found:
            break
    return results
