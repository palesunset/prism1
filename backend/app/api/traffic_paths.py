"""IGP path explorer for Scenario Builder (k-shortest paths)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.algorithms.traffic_simulator import FailedElement
from app.core.exceptions import TopologyNotLoadedError
from app.state import topology

router = APIRouter(prefix="/api/lsp", tags=["traffic-paths"])


class FailedElementIn(BaseModel):
    type: Literal["link", "node"]
    id: str


class TrafficPathsRequest(BaseModel):
    source_ne_id: str
    dest_ne_id: str
    failed_elements: list[FailedElementIn] = Field(default_factory=list)
    k: int = Field(default=5, ge=1, le=20)


@router.post("/traffic-paths")
async def traffic_paths(req: TrafficPathsRequest) -> dict[str, object]:
    if topology.multigraph is None or topology.nes is None:
        raise TopologyNotLoadedError

    from app.algorithms.traffic_simulator import _build_edge_id_map, _build_igp_graph, _path_to_edge_ids, _remove_failed
    from app.algorithms.role_validator import validate_path_roles
    import networkx as nx

    mg = nx.MultiGraph(topology.multigraph)
    mg.remove_edges_from([])
    edge_id_map = _build_edge_id_map(topology.multigraph)
    failed = [FailedElement(type=f.type, id=f.id) for f in req.failed_elements]
    _remove_failed(mg, failed)
    igp = _build_igp_graph(mg)
    role_map = {ne_id: rec.role for ne_id, rec in topology.nes.items()}

    out: list[dict[str, object]] = []
    try:
        it = nx.shortest_simple_paths(igp, req.source_ne_id, req.dest_ne_id, weight="weight")
    except Exception:
        return {"paths": []}

    for nodes in it:
        path_nodes = [str(x) for x in nodes]
        # Scenario Builder: show only role-policy-compliant paths (DRRTR/P_RTR/PERTR/PECRT rules).
        if not validate_path_roles(path_nodes, role_map, req.dest_ne_id).is_valid:
            continue
        try:
            path_edges, lat = _path_to_edge_ids(mg, path_nodes, edge_id_map=edge_id_map)
        except Exception:
            continue
        out.append({"path_nodes": path_nodes, "path_edges": path_edges, "total_latency_ms": float(lat)})
        if len(out) >= int(req.k):
            break

    return {"paths": out}

