"""Project topology import endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.algorithms.project_builder import build_from_project
from app.core.exceptions import ImportValidationError
from app.core.models import ErrorResponse, ImportSummary, ProjectImportRequest
from app.state import topology

router = APIRouter(prefix="/api/lsp/project", tags=["project"])
log = logging.getLogger(__name__)


@router.post(
    "/open",
    response_model=ImportSummary,
    responses={422: {"model": ErrorResponse}},
)
async def open_project(req: ProjectImportRequest) -> ImportSummary:
    """Load a saved project topology directly (no CSV)."""

    nes, mg, links = build_from_project(req)
    if not nes:
        raise ImportValidationError("Project contains no valid NEs")
    if not links:
        raise ImportValidationError("Project contains no valid links")

    topology.nes = nes
    topology.multigraph = mg
    topology.links = links
    from app.services.topology_store import save_topology

    save_topology(nes, links)

    sites = sorted({n.site for n in nes.values()})
    log.info("Opened project topology: %d NEs, %d links", len(nes), len(links))
    return ImportSummary(ne_count=len(nes), link_count=len(links), sites=sites, invalid_rows=[], warnings=[])

