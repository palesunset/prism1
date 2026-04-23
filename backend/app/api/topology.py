"""Topology serialization for the Cytoscape frontend."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core.exceptions import TopologyNotLoadedError
from app.core.models import ErrorResponse
from app.state import topology

router = APIRouter(prefix="/api", tags=["topology"])
log = logging.getLogger(__name__)


@router.get(
    "/topology",
    responses={409: {"model": ErrorResponse}},
)
async def get_topology() -> dict[str, list[dict[str, object]]]:
    """Return Cytoscape elements for the active topology."""

    if topology.multigraph is None or topology.nes is None:
        raise TopologyNotLoadedError

    nodes: list[dict[str, object]] = []
    edges: list[dict[str, object]] = []
    for ne_id, rec in topology.nes.items():
        nodes.append(
            {
                "data": {
                    "id": ne_id,
                    "label": ne_id,
                    "site": rec.site,
                    "vendor": rec.vendor.value,
                    "role": rec.role,
                    "loopback_ipv4": str(rec.loopback_ipv4),
                    "loopback_ipv6": str(rec.loopback_ipv6) if rec.loopback_ipv6 else "",
                    "node_sid": rec.node_sid,
                }
            }
        )

    seen_parallel: dict[tuple[str, str], int] = {}
    for u, v, key, data in topology.multigraph.edges(keys=True, data=True):
        pair = tuple(sorted((u, v)))
        idx = seen_parallel.get(pair, 0)
        seen_parallel[pair] = idx + 1
        edges.append(
            {
                "data": {
                    "id": f"{u}|{v}|{int(key)}",
                    "source": u,
                    "target": v,
                    "latency_ms": float(data.get("latency_ms", 0.0)),
                    "has_latency_24h": bool(isinstance(data.get("latency_24h"), list) and len(data.get("latency_24h")) == 24),
                    "bandwidth_mbps": int(data.get("bandwidth_mbps", 0)),
                    "reservable_bw_mbps": int(data.get("reservable_bw_mbps", 0)),
                    "srlg": data.get("srlg") or [],
                    "interface_src": data.get("interface_src") or "",
                    "interface_dst": data.get("interface_dst") or "",
                    "parallel_index": idx,
                }
            }
        )

    return {"nodes": nodes, "edges": edges}
