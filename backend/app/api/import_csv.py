"""CSV import endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile

from app.algorithms.csv_lenient import parse_links_csv_lenient, parse_nes_csv_lenient
from app.core.exceptions import ImportValidationError
from app.core.models import ErrorResponse, ImportSummary
from app.state import topology

router = APIRouter(prefix="/api/lsp", tags=["import"])
log = logging.getLogger(__name__)


@router.post(
    "/import",
    response_model=ImportSummary,
    responses={422: {"model": ErrorResponse}},
)
async def import_topology(
    nes_file: UploadFile = File(..., description="nes.csv"),
    links_file: UploadFile = File(..., description="links.csv"),
) -> ImportSummary:
    """Parse and validate CSV uploads (lenient per-row validation), replacing the active topology."""

    try:
        nes_bytes = await nes_file.read()
        links_bytes = await links_file.read()
        nes_text = nes_bytes.decode("utf-8-sig")
        links_text = links_bytes.decode("utf-8-sig")
        nes, nes_issues = parse_nes_csv_lenient(nes_text)
        if not nes:
            detail = "; ".join(f"{i.file} row {i.row}: {i.message}" for i in nes_issues[:20])
            msg = "No valid NE rows in nes.csv"
            raise ImportValidationError(f"{msg}. {detail}".strip()) from None
        mg, links, link_issues = parse_links_csv_lenient(nes, links_text)
        if not links:
            detail = "; ".join(f"{i.file} row {i.row}: {i.message}" for i in link_issues[:20])
            msg = "No valid link rows in links.csv"
            raise ImportValidationError(f"{msg}. {detail}".strip()) from None
    except ImportValidationError:
        raise
    except UnicodeDecodeError as exc:
        msg = "CSV files must be UTF-8 encoded"
        log.exception("Import decode failure")
        raise ImportValidationError(msg) from exc

    invalid_rows = [*nes_issues, *link_issues]
    warnings: list[str] = []
    if invalid_rows:
        warnings.append(f"{len(invalid_rows)} row(s) were skipped or adjusted; see invalid_rows for details.")

    topology.nes = nes
    topology.links = links
    topology.multigraph = mg
    sites = sorted({n.site for n in nes.values()})
    log.info("Imported topology: %d NEs, %d links, %d issues", len(nes), len(links), len(invalid_rows))
    return ImportSummary(
        ne_count=len(nes),
        link_count=len(links),
        sites=sites,
        invalid_rows=invalid_rows,
        warnings=warnings,
    )
