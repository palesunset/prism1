"""Configuration export endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Response

from app.core.exceptions import TopologyNotLoadedError
from app.core.models import ErrorResponse, ExportRequest
from app.core.models import Mode
from app.services.config_generator import ConfigGenerator
from app.state import topology

router = APIRouter(prefix="/api", tags=["export"])
log = logging.getLogger(__name__)


@router.post(
    "/export",
    responses={409: {"model": ErrorResponse}},
)
async def export_bundle(req: ExportRequest) -> Response:
    """Return monolithic plaintext configuration (legacy forward+reverse)."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    gen = ConfigGenerator()
    # Legacy monolithic is RSVP-TE only; force rendering even if UI mode is SR/SRv6.
    forced = req.model_copy(update={"mode": Mode.rsvp_te})
    text = gen.generate_ingress_combo(topology.nes, forced)
    return Response(content=text, media_type="text/plain; charset=utf-8")


@router.post("/export/clipboard", response_class=Response)
async def export_clipboard(req: ExportRequest) -> Response:
    """Return plaintext monolithic configuration (same as /api/export)."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    gen = ConfigGenerator()
    forced = req.model_copy(update={"mode": Mode.rsvp_te})
    text = gen.render_ingress_clipboard(topology.nes, forced)
    return Response(content=text, media_type="text/plain; charset=utf-8")


@router.post("/export/monolithic", response_class=Response)
async def export_monolithic(req: ExportRequest) -> Response:
    """Explicit monolithic export endpoint (legacy forward+reverse)."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    gen = ConfigGenerator()
    forced = req.model_copy(update={"mode": Mode.rsvp_te})
    text = gen.generate_ingress_combo(topology.nes, forced)
    return Response(content=text, media_type="text/plain; charset=utf-8")


