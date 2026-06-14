"""Role normalization helpers."""

from __future__ import annotations

from app.algorithms.role_utils import infer_role_from_ne_id, normalize_role, resolve_ne_role, role_aware_allowed_ne_ids


def test_normalize_prtr_alias() -> None:
    assert normalize_role("PRTR") == "P_RTR"
    assert normalize_role("p-rtr") == "P_RTR"
    assert normalize_role("P_RTR") == "P_RTR"


def test_infer_role_from_ne_id() -> None:
    assert infer_role_from_ne_id("DAVCLS-DRRTR-002") == "DRRTR"
    assert infer_role_from_ne_id("DAVCLS-P_RTR-002") == "P_RTR"
    assert infer_role_from_ne_id("LAHUG1-PRTR-001") == "P_RTR"


def test_resolve_ne_role_prefers_ne_id_when_csv_conflicts() -> None:
    assert resolve_ne_role("PRTR", "DAVCLS-DRRTR-002") == "DRRTR"
    assert resolve_ne_role("AGG", "DAVCLS-DRRTR-002") == "DRRTR"
    assert resolve_ne_role("", "ORMOC1-P_RTR-001") == "P_RTR"
    assert resolve_ne_role("PRTR", "ORMOC1-P_RTR-001") == "P_RTR"


def test_role_aware_allowed_ne_ids_excludes_transit_access() -> None:
    from app.core.models import NERecord, Vendor

    def ne(ne_id: str, site: str, role: str) -> NERecord:
        return NERecord(
            ne_id=ne_id,
            loopback_ipv4="10.0.0.1",
            site=site,
            vendor=Vendor.nokia,
            role=role,
        )

    nes = {
        "DAVCLS-DRRTR-002": ne("DAVCLS-DRRTR-002", "DAVCLS", "DRRTR"),
        "DAVCLS-P_RTR-002": ne("DAVCLS-P_RTR-002", "DAVCLS", "PRTR"),
        "MARAMAG-DRRTR-001": ne("MARAMAG-DRRTR-001", "MARAMAG", "DRRTR"),
        "ORMOC1-P_RTR-002": ne("ORMOC1-P_RTR-002", "ORMOC1", "PRTR"),
        "LAHUG1-DRRTR-002": ne("LAHUG1-DRRTR-002", "LAHUG1", "DRRTR"),
    }
    role_map = {nid: resolve_ne_role(rec.role, nid) for nid, rec in nes.items()}
    allowed = role_aware_allowed_ne_ids(
        nes,
        role_map,
        "DAVCLS-DRRTR-002",
        "LAHUG1-DRRTR-002",
    )
    assert "ORMOC1-P_RTR-002" in allowed
    assert "DAVCLS-DRRTR-002" in allowed
    assert "LAHUG1-DRRTR-002" in allowed
    assert "MARAMAG-DRRTR-001" not in allowed
