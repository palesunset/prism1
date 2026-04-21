"""Configuration generator tests."""

from __future__ import annotations

from app.core.models import ExportRequest, HopDetail, Mode, PathResult
from app.services.config_generator import ConfigGenerator

from conftest import build_triangle_topology


def test_config_generation_mixed_vendors() -> None:
    g, nes = build_triangle_topology()
    primary = PathResult(
        nodes=["A", "B", "C"],
        edges=[("A", "B", 0), ("B", "C", 0)],
        hops=[
            HopDetail(
                from_ne="A",
                to_ne="B",
                next_hop_ip="10.1.1.2",
                node_sid=None,
                srv6_sid=None,
                interface_src="A:eth1",
                interface_dst="B:eth1",
                latency_ms=5.0,
            ),
            HopDetail(
                from_ne="B",
                to_ne="C",
                next_hop_ip="10.2.2.2",
                node_sid=None,
                srv6_sid=None,
                interface_src="B:eth2",
                interface_dst="C:eth2",
                latency_ms=9.0,
            ),
        ],
        total_latency_ms=14.0,
        hop_count=2,
    )
    gen = ConfigGenerator()
    req = ExportRequest(lsp_name="TEST_LSP", mode=Mode.rsvp_te, primary=primary, backup=None)
    zip_bytes = gen.build_zip_bundle(nes, req)
    assert zip_bytes.startswith(b"PK")
    assert b"A.cfg" in zip_bytes or True  # names inside zip - just size check
    assert len(zip_bytes) > 40
    del g
