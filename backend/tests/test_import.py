"""CSV import validation tests."""

from __future__ import annotations

import pytest

from app.algorithms.graph_builder import parse_links_csv, parse_nes_csv
from app.core.exceptions import ImportValidationError


def test_import_csv_missing_required_column() -> None:
    bad = "ne_id,site\nNYC-01,US\n"
    with pytest.raises(ImportValidationError):
        parse_nes_csv(bad)


def test_import_roundtrip_minimal() -> None:
    nes_csv = "ne_id,loopback_ipv4,site,vendor,role\nA,10.0.0.1,lab,nokia,core\nB,10.0.0.2,lab,huawei,edge\n"
    links_csv = "source,target,latency_ms,bandwidth_mbps\nA,B,1,1000\n"
    nes = parse_nes_csv(nes_csv)
    mg, links = parse_links_csv(nes, links_csv)
    assert len(nes) == 2
    assert mg.number_of_edges() == 1
    assert len(links) == 1
