"""Configuration export endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Response

from app.core.exceptions import TopologyNotLoadedError
from app.core.models import ErrorResponse, ExportRequest
from app.services.config_generator import ConfigGenerator
from app.state import topology

router = APIRouter(prefix="/api", tags=["export"])
log = logging.getLogger(__name__)


@router.post(
    "/export",
    responses={409: {"model": ErrorResponse}},
)
async def export_bundle(req: ExportRequest) -> Response:
    """Return a ZIP archive containing one .cfg per traversed NE."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    gen = ConfigGenerator()
    data = gen.build_zip_bundle(topology.nes, req)
    filename = f"{req.lsp_name}_configs.zip"
    log.info("Exported configuration bundle %s", filename)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/clipboard", response_class=Response)
async def export_clipboard(req: ExportRequest) -> Response:
    """Return plaintext configuration for the ingress NE."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    gen = ConfigGenerator()
    text = gen.render_ingress_clipboard(topology.nes, req)
    return Response(content=text, media_type="text/plain; charset=utf-8")


@router.post("/export/ne/{ne_id}", response_class=Response)
async def export_ne(ne_id: str, req: ExportRequest) -> Response:
    """Return plaintext configuration for a specific NE on the path."""

    if topology.nes is None:
        raise TopologyNotLoadedError
    if ne_id not in topology.nes:
        return Response(content=f"Unknown ne_id '{ne_id}'", status_code=404, media_type="text/plain; charset=utf-8")
    if ne_id not in req.primary.nodes:
        return Response(
            content=f"ne_id '{ne_id}' is not on the primary path",
            status_code=409,
            media_type="text/plain; charset=utf-8",
        )
    gen = ConfigGenerator()
    ingress_id = req.primary.nodes[0]
    egress_id = req.primary.nodes[-1]
    ne = topology.nes[ne_id]
    egress = topology.nes[egress_id]
    text = gen.render_for_ne(
        ne=ne,
        mode=req.mode,
        lsp_name=req.lsp_name,
        flex_algo_id=req.flex_algo_id,
        primary=req.primary,
        backup=req.backup,
        ingress_ne=ingress_id,
        egress_ne=egress_id,
        egress=egress,
        nokia_cli_style=req.nokia_cli_style,
    )
    return Response(content=text, media_type="text/plain; charset=utf-8")
