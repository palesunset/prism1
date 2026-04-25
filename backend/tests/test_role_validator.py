"""Role hierarchy validation for CSPF."""

from __future__ import annotations

from app.algorithms.role_validator import validate_path_roles


def test_valid_drrtr_prtr_chain_to_drrtr_dest() -> None:
    nodes = ["N1", "N2", "N3", "N4"]
    roles = {"N1": "DRRTR", "N2": "P_RTR", "N3": "P_RTR", "N4": "DRRTR"}
    r = validate_path_roles(nodes, roles, "N4")
    assert r.is_valid


def test_invalid_intermediate_drrtr_to_prtr_not_dest() -> None:
    # Intermediate access-role -> P_RTR is NOT allowed unless P_RTR is the destination.
    nodes = ["N1", "N2", "N3", "N4"]
    roles = {"N1": "DRRTR", "N2": "DRRTR", "N3": "P_RTR", "N4": "DRRTR"}
    r = validate_path_roles(nodes, roles, "N4")
    assert not r.is_valid
    assert "P_RTR must be destination" in r.reason


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
    """P_RTR may attach to a non-dest PECRT if the tail to dest is all PECRT (e.g. PE-agg chain)."""

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
