"""Strict role-based path validation for CSPF candidates."""

from __future__ import annotations

KNOWN_ROLES = frozenset({"DRRTR", "P_RTR", "PERTR", "PECRT"})

ACCESS_ROLES = frozenset({"DRRTR", "PERTR", "PECRT"})

"""
Role-based validation rules (ops clarified).

For DRRTR ↔ PECRT cases, paths are expected to follow a simple layered model:

- The path may start in an *access layer* (DRRTR/PERTR/PECRT) and traverse within the
  same access role for any number of hops.
- The path may then enter the core (P_RTR) and traverse within P_RTR for any number of hops.
- The path may exit P_RTR into an access role ONLY on the final hop into the destination node.
- Direct transitions between different access roles are not allowed.

This is directional: the same physical route reversed can violate the "exit only at destination" rule.
"""


class RoleValidationResult:
    """Outcome of validating a single NE path against role transition rules."""

    __slots__ = ("is_valid", "reason")

    def __init__(self, is_valid: bool, reason: str = "") -> None:
        self.is_valid = is_valid
        self.reason = reason


def _access_suffix_to_dest(
    path_nodes: list[str],
    start_idx: int,
    role_map: dict[str, str],
    dest_role: str,
    dest_node: str,
) -> bool:
    """True when every node from ``start_idx`` through destination stays in ``dest_role``."""

    for j in range(start_idx, len(path_nodes)):
        node = path_nodes[j]
        role = str(role_map.get(node, "")).strip().upper()
        if node == dest_node:
            return role == dest_role
        if role != dest_role:
            return False
    return False


def validate_path_roles(path_nodes: list[str], role_map: dict[str, str], dest_node: str) -> RoleValidationResult:
    """Return whether ``path_nodes`` satisfies hierarchy rules toward ``dest_node``."""

    for node in path_nodes:
        raw = role_map.get(node, "")
        role = str(raw).strip().upper()
        if not role:
            return RoleValidationResult(False, f"Node '{node}' has no role defined")
        if role not in KNOWN_ROLES:
            return RoleValidationResult(False, f"Node '{node}' has unknown role: '{role}'")

    if len(path_nodes) < 2:
        return RoleValidationResult(True)

    source_role = str(role_map.get(path_nodes[0], "")).strip().upper()
    dest_role = str(role_map.get(dest_node, "")).strip().upper()

    in_core = source_role == "P_RTR"
    in_dest_access = False

    for i in range(len(path_nodes) - 1):
        current = path_nodes[i]
        nxt = path_nodes[i + 1]
        current_role = str(role_map.get(current, "")).strip().upper()
        next_role = str(role_map.get(nxt, "")).strip().upper()

        # Disallow direct transitions between different access roles (e.g., PECRT -> DRRTR).
        if current_role in ACCESS_ROLES and next_role in ACCESS_ROLES and current_role != next_role:
            return RoleValidationResult(False, f"Invalid transition: {current_role} → {next_role}")

        # Once we've entered the destination access layer, we must stay within it until dest.
        if in_dest_access:
            if next_role != dest_role:
                return RoleValidationResult(False, f"Invalid transition: {current_role} → {next_role}")
            continue

        # Exiting P_RTR into access is allowed only when the remainder of the path stays in the
        # destination access role (blocks transit DRRTR/PERTR/PECRT hops such as MARAMAG-DRRTR).
        if in_core and current_role == "P_RTR" and next_role in ACCESS_ROLES:
            if next_role != dest_role:
                return RoleValidationResult(
                    False, f"Invalid transition: P_RTR → {next_role} (must enter destination access role)"
                )
            if not _access_suffix_to_dest(path_nodes, i + 1, role_map, dest_role, dest_node):
                return RoleValidationResult(
                    False, f"Invalid transition: P_RTR → {next_role} (must enter destination access role)"
                )
            in_dest_access = True
            in_core = False
            continue

        # Entering core is allowed from the source access role at any point while still in that access layer.
        if not in_core and next_role == "P_RTR":
            if current_role != source_role or current_role not in ACCESS_ROLES:
                return RoleValidationResult(False, f"Invalid transition: {current_role} → P_RTR")
            in_core = True

        # If we're not in core, we must remain within the source access role.
        if not in_core and current_role in ACCESS_ROLES and next_role in ACCESS_ROLES:
            if current_role != source_role or next_role != source_role:
                return RoleValidationResult(False, f"Invalid transition: {current_role} → {next_role}")

        # Core-to-core is fine, and reaching the destination is fine (whatever its role is).
        if nxt == dest_node:
            continue

    return RoleValidationResult(True)
