"""Path computation endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.algorithms.cspf import compute_paths
from app.core.exceptions import TopologyNotLoadedError
from app.core.models import ComputeRequest, ComputeResponse, ErrorResponse
from app.state import topology

router = APIRouter(prefix="/api", tags=["compute"])
log = logging.getLogger(__name__)


def _parse_failed_links(keys: list[str]) -> set[tuple[str, str, int]]:
    out: set[tuple[str, str, int]] = set()
    for raw in keys:
        parts = raw.split("|")
        if len(parts) != 3:
            continue
        a, b, k = parts[0], parts[1], int(parts[2])
        out.add((a, b, k))
    return out


@router.post(
    "/compute",
    response_model=ComputeResponse,
    responses={409: {"model": ErrorResponse}},
)
async def compute(req: ComputeRequest) -> ComputeResponse:
    """Run CSPF for primary and strict node-disjoint backup paths."""

    if topology.multigraph is None or topology.nes is None:
        raise TopologyNotLoadedError

    failed_ne = set(req.failed_ne_ids)
    failed_links = _parse_failed_links(req.failed_link_keys)
    primary, backup, ecmp_paths, rejected, pruned, warnings, opt_lat, trade_applied = compute_paths(
        topology.multigraph,
        topology.nes,
        source=req.source_ne_id,
        destination=req.destination_ne_id,
        required_bw_mbps=req.required_bw_mbps,
        max_hops=req.max_hops,
        mode=req.mode.value,
        enforce_srlg_diversity=req.enforce_srlg_diversity,
        time_hour=req.time_hour,
        failed_ne_ids=failed_ne,
        failed_link_keys=failed_links,
        enforce_roles=req.enforce_roles,
        tradeoff_mode=req.tradeoff_mode,
        tradeoff_value=req.tradeoff_value,
    )
    log.info(
        "Computed paths %s -> %s (primary=%s, backup=%s)",
        req.source_ne_id,
        req.destination_ne_id,
        "ok" if primary else "none",
        "ok" if backup else "none",
    )
    return ComputeResponse(
        primary=primary,
        backup=backup,
        ecmp_paths=ecmp_paths,
        rejected_paths=rejected,
        pruned_edges=pruned,
        warnings=warnings,
        mode=req.mode,
        optimal_latency_ms=opt_lat,
        tradeoff_applied_ms=trade_applied,
    )
