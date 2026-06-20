"""In-memory topology state for the local desktop deployment."""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from app.core.models import LinkRecord, NERecord


@dataclass
class TopologyState:
    """Holds the active topology imported from CSV files."""

    multigraph: nx.MultiGraph | None = None
    nes: dict[str, NERecord] | None = None
    links: list[LinkRecord] | None = None


topology = TopologyState()
