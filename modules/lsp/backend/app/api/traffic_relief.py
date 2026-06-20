"""Traffic congestion relief planning endpoint (suggest alternative paths)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.algorithms.traffic_simulator import FailedElement, suggest_relief_paths
from app.core.exceptions import TopologyNotLoadedError
from app.state import topology

router = APIRouter(prefix="/api/lsp", tags=["traffic-relief"])


class FailedElementIn(BaseModel):
    type: Literal["link", "node"]
    id: str


class TrafficReliefRequest(BaseModel):
    failed_elements: list[FailedElementIn] = Field(default_factory=list)
    congestion_threshold_pct: float = Field(default=80.0, ge=0.0, le=100.0)
    max_extra_latency_ms: float = Field(default=10.0, ge=0.0, le=10_000.0)
    max_suggestions_per_link: int = Field(default=3, ge=1, le=10)
    enforce_roles: bool = Field(default=False, description="When true, apply NE role transition rules to relief paths.")


@router.post("/traffic-relief")
async def traffic_relief(_req: TrafficReliefRequest) -> dict[str, object]:
    if topology.multigraph is None or topology.nes is None:
        raise TopologyNotLoadedError
    failed = [FailedElement(type=f.type, id=f.id) for f in _req.failed_elements]
    role_map = {ne_id: rec.role for ne_id, rec in topology.nes.items()}
    res = suggest_relief_paths(
        topology.multigraph,
        failed,
        congestion_threshold=_req.congestion_threshold_pct,
        max_extra_latency_ms=_req.max_extra_latency_ms,
        max_suggestions_per_link=_req.max_suggestions_per_link,
        enforce_roles=_req.enforce_roles,
        role_map=role_map,
    )
    return res  # json-serializable

