"""Persist and restore LSP topology in Supabase/Postgres."""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Any

from app.algorithms.project_builder import build_from_project
from app.core.models import ProjectImportRequest, ProjectLink, ProjectNE

if TYPE_CHECKING:
    from app.state import TopologyState

log = logging.getLogger(__name__)

ACTIVE_NAME = "active"


def is_enabled() -> bool:
    return bool(os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL"))


def _connection_url() -> str | None:
    return os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")


def _connect():
    import psycopg

    url = _connection_url()
    if not url:
        msg = "DATABASE_URL is not configured"
        raise RuntimeError(msg)
    return psycopg.connect(url, autocommit=True)


def _topology_payload(nes: dict, links: list) -> dict[str, Any]:
    return {
        "nes": [ne.model_dump(mode="json") for ne in nes.values()],
        "links": [link.model_dump(mode="json") for link in links],
    }


def save_topology(nes: dict, links: list) -> None:
    """Upsert active project topology JSON."""

    if not is_enabled():
        return
    payload = _topology_payload(nes, links)
    try:
        body = json.dumps(payload)
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM lsp_projects WHERE name = %s LIMIT 1", (ACTIVE_NAME,))
                row = cur.fetchone()
                if row:
                    cur.execute(
                        "UPDATE lsp_projects SET topology = %s::jsonb, updated_at = NOW() WHERE name = %s",
                        (body, ACTIVE_NAME),
                    )
                else:
                    cur.execute(
                        "INSERT INTO lsp_projects (id, name, topology) VALUES (gen_random_uuid()::text, %s, %s::jsonb)",
                        (ACTIVE_NAME, body),
                    )
        log.info("Saved LSP topology to Postgres (%d NEs, %d links)", len(nes), len(links))
    except Exception:
        log.exception("Failed to save LSP topology to Postgres")


def try_load_topology(state: TopologyState) -> bool:
    """Load active topology from Postgres into in-memory state."""

    if not is_enabled():
        return False
    try:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT topology FROM lsp_projects WHERE name = %s ORDER BY updated_at DESC LIMIT 1",
                    (ACTIVE_NAME,),
                )
                row = cur.fetchone()
        if not row or not row[0]:
            return False
        raw = row[0]
        data = raw if isinstance(raw, dict) else json.loads(raw)
        nes_rows = [ProjectNE.model_validate(n) for n in data.get("nes", [])]
        link_rows = [ProjectLink.model_validate(l) for l in data.get("links", [])]
        if not nes_rows:
            return False
        req = ProjectImportRequest(nes=nes_rows, links=link_rows)
        nes, mg, links = build_from_project(req)
        state.nes = nes
        state.multigraph = mg
        state.links = links
        log.info("Loaded LSP topology from Postgres (%d NEs, %d links)", len(nes), len(links))
        return True
    except Exception:
        log.exception("Failed to load LSP topology from Postgres")
        return False
