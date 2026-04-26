"""Traffic simulation endpoint (standalone what-if mode)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.algorithms.traffic_simulator import FailedElement, InjectedFlow, ManualRedistribution, simulate_traffic_failure
from app.core.exceptions import TopologyNotLoadedError
from app.state import topology

router = APIRouter(prefix="/api", tags=["traffic-sim"])


class FailedElementIn(BaseModel):
    type: Literal["link", "node"]
    id: str


class TrafficSimRequest(BaseModel):
    failed_elements: list[FailedElementIn] = Field(default_factory=list)
    injected_flows: list["InjectedFlowIn"] = Field(default_factory=list)
    congestion_threshold_pct: float = Field(default=80.0, ge=0.0, le=100.0)
    manual_redistributions: list["ManualRedistributionIn"] = Field(default_factory=list)
    enforce_roles: bool = Field(default=False, description="When true, apply NE role transition rules to traffic paths.")


class ManualRedistributionIn(BaseModel):
    flow_id: str
    new_path: list[str] = Field(min_length=2)
    volume_mbps: float = Field(gt=0.0)

class InjectedFlowIn(BaseModel):
    id: str
    source_ne_id: str
    dest_ne_id: str
    volume_mbps: float = Field(gt=0.0)


@router.post("/traffic-simulate")
async def traffic_simulate(req: TrafficSimRequest) -> dict[str, object]:
    if topology.multigraph is None or topology.nes is None:
        raise TopologyNotLoadedError
    failed = [FailedElement(type=f.type, id=f.id) for f in req.failed_elements]
    injected = [
        InjectedFlow(
            id=f.id,
            source_ne_id=f.source_ne_id,
            dest_ne_id=f.dest_ne_id,
            volume_mbps=f.volume_mbps,
        )
        for f in req.injected_flows
    ]
    manual = [ManualRedistribution(flow_id=m.flow_id, new_path=m.new_path, volume_mbps=m.volume_mbps) for m in req.manual_redistributions]
    role_map = {ne_id: rec.role for ne_id, rec in topology.nes.items()}
    # Scenario Builder injected traffic should follow role-transition policy by default.
    enforce_injected_roles = True if injected else req.enforce_roles
    res = simulate_traffic_failure(
        topology.multigraph,
        failed,
        congestion_threshold=req.congestion_threshold_pct,
        manual_redistributions=manual,
        injected_flows=injected,
        enforce_roles=enforce_injected_roles,
        role_map=role_map,
    )
    return res  # already json-serializable

