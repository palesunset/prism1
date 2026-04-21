"""Sample topology import endpoints (bundled sample CSV)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import APIRouter

from app.algorithms.csv_lenient import parse_links_csv_lenient, parse_nes_csv_lenient
from app.core.exceptions import ImportValidationError
from app.core.models import ErrorResponse, ImportSummary
from app.state import topology

router = APIRouter(prefix="/api", tags=["sample"])
log = logging.getLogger(__name__)


def _sample_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "sample_data"  # type: ignore[attr-defined]
    here = Path(__file__).resolve().parent.parent.parent.parent
    return here / "sample_data"


@router.post(
    "/import/sample",
    response_model=ImportSummary,
    responses={422: {"model": ErrorResponse}},
)
async def import_sample() -> ImportSummary:
    """Load the bundled sample_nes.csv / sample_links.csv into the active topology."""

    sdir = _sample_dir()
    nes_path = sdir / "sample_nes.csv"
    links_path = sdir / "sample_links.csv"
    if not nes_path.is_file() or not links_path.is_file():
        raise ImportValidationError("Sample CSV files not found in bundle")

    nes_text = nes_path.read_text(encoding="utf-8-sig")
    links_text = links_path.read_text(encoding="utf-8-sig")
    nes, nes_issues = parse_nes_csv_lenient(nes_text)
    if not nes:
        raise ImportValidationError("Sample NE file produced no valid nodes")
    mg, links, link_issues = parse_links_csv_lenient(nes, links_text)
    if not links:
        raise ImportValidationError("Sample links file produced no valid links")

    invalid_rows = [*nes_issues, *link_issues]
    warnings: list[str] = []
    if invalid_rows:
        warnings.append(f"{len(invalid_rows)} row(s) skipped or adjusted in sample import.")

    topology.nes = nes
    topology.links = links
    topology.multigraph = mg
    sites = sorted({n.site for n in nes.values()})
    log.info("Imported sample topology: %d NEs, %d links", len(nes), len(links))
    return ImportSummary(
        ne_count=len(nes),
        link_count=len(links),
        sites=sites,
        invalid_rows=invalid_rows,
        warnings=warnings,
    )

