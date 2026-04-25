"""Strict role-based path validation for CSPF candidates."""

from __future__ import annotations

KNOWN_ROLES = frozenset({"DRRTR", "P_RTR", "PERTR", "PECRT"})

ACCESS_ROLES = frozenset({"DRRTR", "PERTR", "PECRT"})

# Transition rules (project spec):
# - Access roles (DRRTR/PERTR/PECRT) may NOT transition to P_RTR unless that P_RTR is the destination.
# - P_RTR can transition to any role (including handing off to access roles mid-path).
# - Direct transitions between different access roles are not allowed.
ALLOWED_SOURCE_TRANSITIONS: dict[str, frozenset[str]] = {
    "DRRTR": frozenset({"DRRTR", "P_RTR"}),
    "PERTR": frozenset({"PERTR", "P_RTR"}),
    "PECRT": frozenset({"PECRT", "P_RTR"}),
    "P_RTR": frozenset({"DRRTR", "PERTR", "PECRT", "P_RTR"}),
}


class RoleValidationResult:
    """Outcome of validating a single NE path against role transition rules."""

    __slots__ = ("is_valid", "reason")

    def __init__(self, is_valid: bool, reason: str = "") -> None:
        self.is_valid = is_valid
        self.reason = reason


def validate_path_roles(path_nodes: list[str], role_map: dict[str, str], dest_node: str) -> RoleValidationResult:
    """Return whether ``path_nodes`` satisfies hierarchy rules toward ``dest_node``."""

    for node in path_nodes:
        raw = role_map.get(node, "")
        role = str(raw).strip().upper()
        if not role:
            return RoleValidationResult(False, f"Node '{node}' has no role defined")
        if role not in KNOWN_ROLES:
            return RoleValidationResult(False, f"Node '{node}' has unknown role: '{role}'")

    for i in range(len(path_nodes) - 1):
        current = path_nodes[i]
        nxt = path_nodes[i + 1]
        current_role = str(role_map.get(current, "")).strip().upper()
        next_role = str(role_map.get(nxt, "")).strip().upper()

        # Access -> P_RTR is only allowed at the source hop, or if that P_RTR is the destination node.
        # (Spec wording: "Intermediate DRRTR/PERTR/PECRT cannot go to PRTR unless PRTR is the destination.")
        if current_role in ACCESS_ROLES and next_role == "P_RTR" and i != 0 and nxt != dest_node:
            return RoleValidationResult(False, f"Invalid transition: {current_role} → P_RTR (P_RTR must be destination)")

        allowed = ALLOWED_SOURCE_TRANSITIONS.get(current_role, frozenset())
        if next_role not in allowed:
            if i == 0:
                return RoleValidationResult(
                    False,
                    f"Invalid transition at source: {current_role} → {next_role} (allowed: {set(allowed)})",
                )
            return RoleValidationResult(
                False,
                f"Invalid transition: {current_role} → {next_role}",
            )

    return RoleValidationResult(True)
