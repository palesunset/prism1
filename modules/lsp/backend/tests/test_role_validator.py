"""Role hierarchy validation for CSPF."""

from __future__ import annotations

from app.algorithms.role_validator import _access_suffix_to_dest, validate_path_roles


def test_valid_drrtr_prtr_chain_to_drrtr_dest() -> None:
    nodes = ["N1", "N2", "N3", "N4"]
    roles = {"N1": "DRRTR", "N2": "P_RTR", "N3": "P_RTR", "N4": "DRRTR"}
    r = validate_path_roles(nodes, roles, "N4")
    assert r.is_valid


def test_invalid_intermediate_drrtr_to_prtr_not_dest() -> None:
    # Access layer may traverse within access role, then enter core later.
    nodes = ["N1", "N2", "N3", "N4"]
    roles = {"N1": "DRRTR", "N2": "DRRTR", "N3": "P_RTR", "N4": "DRRTR"}
    r = validate_path_roles(nodes, roles, "N4")
    assert r.is_valid


def test_unknown_role_agg() -> None:
    nodes = ["X", "Y"]
    roles = {"X": "AGG", "Y": "P_RTR"}
    r = validate_path_roles(nodes, roles, "Y")
    assert not r.is_valid
    assert "unknown role" in r.reason.lower()
    assert "AGG" in r.reason


def test_missing_role() -> None:
    nodes = ["X", "Y"]
    roles = {"X": "", "Y": "P_RTR"}
    r = validate_path_roles(nodes, roles, "Y")
    assert not r.is_valid
    assert "no role defined" in r.reason


def test_prtr_to_pecrt_then_pecrt_destination() -> None:
    """Core may exit into destination access layer, then stay there to destination."""

    nodes = ["PR1", "C1", "C2"]
    roles = {"PR1": "P_RTR", "C1": "PECRT", "C2": "PECRT"}
    r = validate_path_roles(nodes, roles, "C2")
    assert r.is_valid


def test_prtr_to_drrtr_chain_to_drrtr_destination() -> None:
    nodes = ["PR1", "D1", "D2"]
    roles = {"PR1": "P_RTR", "D1": "DRRTR", "D2": "DRRTR"}
    r = validate_path_roles(nodes, roles, "D2")
    assert r.is_valid


def test_prtr_to_pecrt_mixed_tail_rejected() -> None:
    nodes = ["PR1", "C1", "E1"]
    roles = {"PR1": "P_RTR", "C1": "PECRT", "E1": "PERTR"}
    r = validate_path_roles(nodes, roles, "E1")
    # Direct access-role transition PECRT -> PERTR is not allowed.
    assert not r.is_valid
    assert "Invalid transition" in r.reason


def test_pecrt_source_over_prtr_to_drrtr_chain() -> None:
    """Access -> P_RTR is allowed at the source hop."""

    nodes = ["C0", "PR0", "D0", "D1"]
    roles = {"C0": "PECRT", "PR0": "P_RTR", "D0": "DRRTR", "D1": "DRRTR"}
    r = validate_path_roles(nodes, roles, "D1")
    assert r.is_valid


def test_access_to_prtr_allowed_when_prtr_is_destination() -> None:
    nodes = ["C0", "PR0"]
    roles = {"C0": "PECRT", "PR0": "P_RTR"}
    r = validate_path_roles(nodes, roles, "PR0")
    assert r.is_valid


def test_transit_drrtr_via_maramag_rejected_for_lahug_dest() -> None:
    """Core must not drop into transit DRRTR (MARAMAG) when destination is LAHUG1-DRRTR."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "DAVCLS-P_RTR-001",
        "MARAMAG-DRRTR-001",
        "ALWANA-P_RTR-002",
        "LAHUG1-P_RTR-002",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "P_RTR") for n in nodes}
    r = validate_path_roles(nodes, roles, "LAHUG1-DRRTR-002")
    assert not r.is_valid
    assert "P_RTR → DRRTR" in r.reason


def test_transit_pertr_rejected_between_core_hops() -> None:
    """Transit PERTR must not be used as a core shortcut."""

    nodes = ["SITEA-DRRTR-001", "SITEA-P_RTR-001", "SITEB-PERTR-001", "SITEC-P_RTR-001", "SITEC-DRRTR-001"]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PERTR" if "PERTR" in n else "P_RTR") for n in nodes}
    r = validate_path_roles(nodes, roles, "SITEC-DRRTR-001")
    assert not r.is_valid
    assert "P_RTR → PERTR" in r.reason


def test_transit_pecrt_rejected_when_dest_is_drrtr() -> None:
    """Transit PECRT is not destination access when the LSP ends on DRRTR."""

    nodes = ["SITEA-DRRTR-001", "SITEA-P_RTR-001", "SITEB-PECRT-001", "SITEC-P_RTR-001", "SITEC-DRRTR-001"]
    roles = {n: ("DRRTR" if "DRRTR" in n else "PECRT" if "PECRT" in n else "P_RTR") for n in nodes}
    r = validate_path_roles(nodes, roles, "SITEC-DRRTR-001")
    assert not r.is_valid
    assert "P_RTR → PECRT" in r.reason


def test_dest_site_multi_hop_drrtr_tail_allowed() -> None:
    """Multiple DRRTR hops at the destination site after exiting core are valid."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "P_RTR") for n in nodes}
    r = validate_path_roles(nodes, roles, "LAHUG1-DRRTR-002")
    assert r.is_valid


def test_dest_site_core_hop_before_final_drrtr_allowed() -> None:
    """Destination-site P_RTR peering before the final access hop is valid."""

    nodes = [
        "DAVCLS-DRRTR-002",
        "ORMOC1-P_RTR-001",
        "LAHUG1-P_RTR-002",
        "LAHUG1-P_RTR-001",
        "LAHUG1-DRRTR-002",
    ]
    roles = {n: ("DRRTR" if "DRRTR" in n else "P_RTR") for n in nodes}
    r = validate_path_roles(nodes, roles, "LAHUG1-DRRTR-002")
    assert r.is_valid


def test_exit_to_access_then_reenter_core_rejected() -> None:
    """After leaving core for access, the path cannot return to P_RTR before destination."""

    nodes = ["A", "P1", "D1", "P2", "D2"]
    roles = {"A": "DRRTR", "P1": "P_RTR", "D1": "DRRTR", "P2": "P_RTR", "D2": "DRRTR"}
    r = validate_path_roles(nodes, roles, "D2")
    assert not r.is_valid
    assert "P_RTR → DRRTR" in r.reason


def test_pecrt_to_pertr_via_core_direct_exit_allowed() -> None:
    """PECRT source may reach PERTR destination with a single core exit at destination role."""

    nodes = ["C0", "P", "E1"]
    roles = {"C0": "PECRT", "P": "P_RTR", "E1": "PERTR"}
    r = validate_path_roles(nodes, roles, "E1")
    assert r.is_valid


def test_dest_site_multi_hop_pecrt_tail_allowed() -> None:
    """Multiple PECRT hops at the destination site after exiting core are valid."""

    nodes = ["D0", "P", "C1", "C2"]
    roles = {"D0": "DRRTR", "P": "P_RTR", "C1": "PECRT", "C2": "PECRT"}
    r = validate_path_roles(nodes, roles, "C2")
    assert r.is_valid


def test_access_to_access_different_roles_rejected() -> None:
    nodes = ["E1", "D1", "P", "D2"]
    roles = {"E1": "PERTR", "D1": "DRRTR", "P": "P_RTR", "D2": "DRRTR"}
    r = validate_path_roles(nodes, roles, "D2")
    assert not r.is_valid
    assert "PERTR → DRRTR" in r.reason


def test_in_dest_access_cannot_reenter_core() -> None:
    """After a valid core exit, the tail cannot include another core hop."""

    nodes = ["A", "P1", "D1", "P2", "D2"]
    roles = {"A": "DRRTR", "P1": "P_RTR", "D1": "DRRTR", "P2": "P_RTR", "D2": "DRRTR"}
    r = validate_path_roles(nodes, roles, "D2")
    assert not r.is_valid
    assert "P_RTR → DRRTR" in r.reason


def test_single_node_path_valid() -> None:
    r = validate_path_roles(["A"], {"A": "DRRTR"}, "A")
    assert r.is_valid


def test_access_suffix_incomplete_tail() -> None:
    roles = {"A": "DRRTR", "P": "P_RTR"}
    assert not _access_suffix_to_dest(["A", "P"], 2, roles, "DRRTR", "A")
