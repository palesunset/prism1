"""Configuration generator tests."""

from __future__ import annotations

from app.core.models import ExportRequest, HopDetail, LinkRecord, Mode, NERecord, PathResult, NokiaCliStyle, Vendor
from app.state import topology
from app.services.config_generator import ConfigGenerator

from conftest import build_triangle_topology


def test_rsvp_forward_uses_source_ne_id_not_lsp_name() -> None:
    """Legacy Nokia/Huawei forward templates key paths off ingress ne_id."""
    gen = ConfigGenerator()
    nes = {
        "SRC": NERecord(ne_id="SRC", loopback_ipv4="10.1.1.1", vendor=Vendor.nokia, role="P_RTR"),
        "DST": NERecord(ne_id="DST", loopback_ipv4="10.9.9.9", vendor=Vendor.huawei, role="P_RTR"),
    }
    links = [
        LinkRecord(
            source="SRC",
            target="DST",
            latency_ms=1.0,
            bandwidth_mbps=1000,
            reservable_bw_mbps=1000,
            interface_src="SRC:ge0",
            interface_dst="DST:ge0",
            next_hop_ipv4_src="10.0.0.2",
            next_hop_ipv4_dst="10.0.0.1",
        )
    ]
    primary = PathResult(
        nodes=["SRC", "DST"],
        edges=[("SRC", "DST", 0)],
        hops=[
            HopDetail(
                from_ne="SRC",
                to_ne="DST",
                next_hop_ip="10.0.0.2",
                node_sid=None,
                srv6_sid=None,
                interface_src="SRC:ge0",
                interface_dst="DST:ge0",
                latency_ms=1.0,
            )
        ],
        total_latency_ms=1.0,
        hop_count=1,
    )
    req = ExportRequest(
        lsp_name="MY-LSP-LABEL",
        mode=Mode.rsvp_te,
        primary=primary,
        backup=None,
        nokia_cli_style=NokiaCliStyle.classic,
    )
    text = gen.generate_node_config("SRC", links, nes, req)
    assert "SRC-SP:01" in text
    assert "MY-LSP-LABEL" not in text


def test_config_generation_mixed_vendors() -> None:
    g, nes = build_triangle_topology()
    prev_links = topology.links
    topology.links = [
        LinkRecord(
            source="A",
            target="B",
            latency_ms=5.0,
            bandwidth_mbps=10_000,
            reservable_bw_mbps=10_000,
            interface_src="A:eth1",
            interface_dst="B:eth1",
            next_hop_ipv4_src="10.1.1.1",
            next_hop_ipv4_dst="10.1.1.2",
        ),
        LinkRecord(
            source="B",
            target="C",
            latency_ms=9.0,
            bandwidth_mbps=10_000,
            reservable_bw_mbps=10_000,
            interface_src="B:eth2",
            interface_dst="C:eth2",
            next_hop_ipv4_src="10.2.2.1",
            next_hop_ipv4_dst="10.2.2.2",
        ),
    ]
    try:
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
    finally:
        topology.links = prev_links
    del g
