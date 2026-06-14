"""Normalize hierarchy role codes from CSV and NE naming conventions."""

from __future__ import annotations

import re

from app.algorithms.role_validator import ACCESS_ROLES, KNOWN_ROLES

_NE_ROLE_RE = re.compile(r"-(DRRTR|PERTR|PECRT|P_RTR|PRTR)-", re.IGNORECASE)


def normalize_role(raw: str) -> str:
    """Map common CSV spellings to canonical role codes used by CSPF."""

    s = str(raw or "").strip()
    if not s:
        return ""
    key = s.upper().replace("-", "_").replace(" ", "_")
    compact = key.replace("_", "")
    aliases: dict[str, str] = {
        "PRTR": "P_RTR",
        "PCORE": "P_RTR",
        "CORE": "P_RTR",
        "DRTR": "DRRTR",
    }
    if compact in aliases:
        return aliases[compact]
    if key in KNOWN_ROLES:
        return key
    return key


def infer_role_from_ne_id(ne_id: str) -> str | None:
    """Best-effort role from NE id tokens such as ``SITE-DRRTR-01``."""

    match = _NE_ROLE_RE.search(ne_id)
    if not match:
        return None
    role = normalize_role(match.group(1))
    return role if role in KNOWN_ROLES else None


def resolve_ne_role(raw_role: str, ne_id: str) -> str:
    """Normalize CSV role, falling back to NE id when the CSV value is missing or unknown."""

    role = normalize_role(raw_role)
    inferred = infer_role_from_ne_id(ne_id)
    if inferred and role in KNOWN_ROLES and role != inferred:
        return inferred
    if role in KNOWN_ROLES:
        return role
    if inferred:
        return inferred
    return role or "P_RTR"


def ne_site(ne_id: str, nes: dict) -> str:
    """Resolve site code from NE record or the first token of ``ne_id``."""

    rec = nes.get(ne_id)
    if rec is not None:
        site = str(getattr(rec, "site", "") or "").strip()
        if site:
            return site.upper()
    return ne_id.split("-", 1)[0].upper()


def role_aware_allowed_ne_ids(
    nes: dict,
    role_map: dict[str, str],
    source: str,
    destination: str,
) -> set[str]:
    """
    NE ids permitted for role-enforced CSPF.

    Keeps all core (P_RTR) routers plus access-layer NEs at the source or
    destination site only — transit access hops (e.g. MARAMAG-DRRTR) are excluded.
    """

    source_role = str(role_map.get(source, "")).strip().upper()
    dest_role = str(role_map.get(destination, "")).strip().upper()
    source_site = ne_site(source, nes)
    dest_site = ne_site(destination, nes)
    allowed: set[str] = set()
    for ne_id in nes:
        role = str(role_map.get(ne_id, "")).strip().upper()
        if role == "P_RTR":
            allowed.add(ne_id)
            continue
        site = ne_site(ne_id, nes)
        if ne_id in (source, destination):
            allowed.add(ne_id)
        elif role in ACCESS_ROLES and role == source_role and site == source_site:
            allowed.add(ne_id)
        elif role in ACCESS_ROLES and role == dest_role and site == dest_site:
            allowed.add(ne_id)
    return allowed
