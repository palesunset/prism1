"""Pydantic models shared across API layers."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, IPvAnyAddress, field_validator, model_validator


class Vendor(str, Enum):
    """Supported network equipment vendors."""

    nokia = "nokia"
    huawei = "huawei"
    cisco_xr = "cisco_xr"
    juniper = "juniper"


class Role(str, Enum):
    """NE role for visualization defaults."""

    core = "core"
    agg = "agg"
    edge = "edge"


class Mode(str, Enum):
    """Tunnel signaling / dataplane mode."""

    rsvp_te = "rsvp_te"
    sr_mpls = "sr_mpls"
    srv6 = "srv6"


class NERecord(BaseModel):
    """Single network element row after validation."""

    ne_id: str
    loopback_ipv4: IPvAnyAddress
    site: str = "default"
    vendor: Vendor = Vendor.nokia
    loopback_ipv6: IPvAnyAddress | None = None
    node_sid: int | None = None
    role: str = Field(
        default="P_RTR",
        description="Network hierarchy role code (e.g. DRRTR, P_RTR, PERTR, PECRT); preserved as imported.",
    )

    @field_validator("ne_id")
    @classmethod
    def ne_id_nonempty(cls, v: str) -> str:
        """Reject blank identifiers."""

        s = v.strip()
        if not s:
            msg = "ne_id must be a non-empty string"
            raise ValueError(msg)
        if any(ch in s for ch in ("<", ">", "{", "}", "`")):
            msg = "ne_id contains disallowed characters"
            raise ValueError(msg)
        return s


class LinkRecord(BaseModel):
    """Single physical adjacency after validation."""

    source: str
    target: str
    latency_ms: float
    bandwidth_mbps: int
    reservable_bw_mbps: int
    current_utilization_mbps: float | None = Field(
        default=None,
        ge=0,
        description="Optional measured traffic on the link in Mbps (for Traffic Simulation mode).",
    )
    srlg: list[str] = Field(default_factory=list, description="Optional SRLG identifiers for diversity planning.")
    interface_src: str | None = None
    interface_dst: str | None = None
    next_hop_ipv4_src: IPvAnyAddress | None = None
    next_hop_ipv4_dst: IPvAnyAddress | None = None
    edge_key: int = Field(
        default=0,
        description="Stable key for parallel edges in the MultiGraph.",
    )


class HopDetail(BaseModel):
    """Per-hop data for templates and UI."""

    from_ne: str
    to_ne: str
    next_hop_ip: str | None = None
    node_sid: int | None = None
    srv6_sid: str | None = None
    interface_src: str | None = None
    interface_dst: str | None = None
    latency_ms: float


class PathResult(BaseModel):
    """Computed path with metrics."""

    nodes: list[str]
    edges: list[tuple[str, str, int]]
    hops: list[HopDetail]
    total_latency_ms: float
    hop_count: int


class RejectedPath(BaseModel):
    """Candidate path rejected during CSPF / filtering."""

    nodes: list[str]
    reason: str
    total_latency_ms: float | None = None
    hop_count: int | None = None


class PrunedEdge(BaseModel):
    """Edge removed during bandwidth pruning."""

    source: str
    target: str
    edge_key: int
    reason: str


class ComputeRequest(BaseModel):
    """POST /api/compute body."""

    source_ne_id: str
    destination_ne_id: str
    flex_algo_id: int | None = Field(
        default=None,
        ge=128,
        le=255,
        description="Optional Flex-Algo identifier (RFC 9350 user-defined range 128-255).",
    )
    required_bw_mbps: int | None = None
    max_hops: int = Field(default=50, ge=1, le=256)
    mode: Mode
    enforce_srlg_diversity: bool = Field(
        default=True,
        description="When true, attempt SRLG-diverse backup by excluding SRLGs used by the primary (when SRLG data is present).",
    )
    enforce_roles: bool = Field(
        default=True,
        description="When true, reject CSPF candidates that violate NE role transition rules.",
    )
    time_hour: int | None = Field(
        default=None,
        ge=0,
        le=23,
        description="Optional hour-of-day index (0-23) for time-series latency playback.",
    )
    failed_ne_ids: list[str] = Field(default_factory=list)
    failed_link_keys: list[str] = Field(
        default_factory=list,
        description='Parallel link ids formatted as "source|target|key".',
    )
    tradeoff_mode: Literal["percent", "absolute"] = Field(
        default="percent",
        description="Primary latency trade-off: percent of optimal, or extra milliseconds.",
    )
    tradeoff_value: float = Field(
        default=0.0,
        description="0 = strict primary only; percent 0-100; absolute 0-500 ms.",
    )

    @model_validator(mode="after")
    def _validate_tradeoff(self) -> "ComputeRequest":
        v = float(self.tradeoff_value)
        if self.tradeoff_mode == "percent":
            if v < 0.0 or v > 100.0:
                msg = "tradeoff_value for percent mode must be between 0 and 100"
                raise ValueError(msg)
        elif v < 0.0 or v > 500.0:
            msg = "tradeoff_value for absolute mode must be between 0 and 500 (ms)"
            raise ValueError(msg)
        return self


class ComputeResponse(BaseModel):
    """Path computation response."""

    primary: PathResult | None
    backup: PathResult | None
    ecmp_paths: list[PathResult] = Field(
        default_factory=list,
        description="Equal-cost primary alternatives (includes the selected primary as the first element when present).",
    )
    rejected_paths: list[RejectedPath]
    pruned_edges: list[PrunedEdge] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    mode: Mode
    optimal_latency_ms: float | None = Field(
        default=None,
        description="Latency of the best valid primary (K-shortest) before any trade-off.",
    )
    tradeoff_applied_ms: float | None = Field(
        default=None,
        description="Extra primary latency vs optimal when a suboptimal primary was chosen to obtain a backup.",
    )


class CsvRowIssue(BaseModel):
    """Single validation issue for a skipped or corrected CSV row."""

    file: str
    row: int = Field(description="Spreadsheet row number (row 1 = header).")
    field: str = Field(default="", description="Column name when applicable.")
    message: str


class ImportSummary(BaseModel):
    """Summary returned after successful CSV import."""

    ne_count: int
    link_count: int
    sites: list[str]
    invalid_rows: list[CsvRowIssue] = Field(
        default_factory=list,
        description="Rows that were skipped or corrected during lenient import.",
    )
    warnings: list[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Consistent JSON error envelope."""

    error: str
    detail: str | None = None


class LspReservation(BaseModel):
    """Client-side reservation record for utilization heatmap."""

    name: str
    primary_edges: list[tuple[str, str, int]]
    required_bw_mbps: int


class NokiaCliStyle(str, Enum):
    """Nokia SR OS configuration syntax variant."""

    classic = "classic"
    md = "md"


class ExportRequest(BaseModel):
    """POST /api/export body."""

    lsp_name: str
    mode: Mode
    flex_algo_id: int | None = Field(
        default=None,
        ge=128,
        le=255,
        description="Optional Flex-Algo identifier (RFC 9350 user-defined range 128-255).",
    )
    primary: PathResult
    backup: PathResult | None = None
    reservations: list[LspReservation] = Field(default_factory=list)
    nokia_cli_style: NokiaCliStyle = Field(
        default=NokiaCliStyle.classic,
        description="Nokia-only: Classic CLI vs MD-CLI template family.",
    )
    nokia_path_name_prefix: str | None = Field(
        default=None,
        description="Nokia RSVP-TE: path/match name prefix (X) for X-SP:01, X-SP:02. Omitted/empty: source NE id.",
    )
    nokia_lsp_name_y: str | None = Field(
        default=None,
        description="Nokia RSVP-TE: first LSP name (Y). Omitted/empty: {source}-SP:01.",
    )
    nokia_lsp_name_z: str | None = Field(
        default=None,
        description="Nokia RSVP-TE: second LSP name (Z) when a backup path exists. Omitted/empty: {source}-SP:02.",
    )
    nokia_path_name_prefix_forward: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Forward tab): path/match name prefix (X). Omitted/empty: falls back to nokia_path_name_prefix, then source NE id.",
    )
    nokia_lsp_name_y_forward: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Forward tab): first LSP name (Y). Omitted/empty: falls back to nokia_lsp_name_y, then {source}-SP:01.",
    )
    nokia_lsp_name_z_forward: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Forward tab): second LSP name (Z). Omitted/empty: falls back to nokia_lsp_name_z, then {source}-SP:02.",
    )
    nokia_path_name_prefix_reverse: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Reverse tab): path/match name prefix (X). Omitted/empty: falls back to nokia_path_name_prefix, then source NE id.",
    )
    nokia_lsp_name_y_reverse: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Reverse tab): first LSP name (Y). Omitted/empty: falls back to nokia_lsp_name_y, then {source}-SP:01.",
    )
    nokia_lsp_name_z_reverse: str | None = Field(
        default=None,
        description="Nokia RSVP-TE (Reverse tab): second LSP name (Z). Omitted/empty: falls back to nokia_lsp_name_z, then {source}-SP:02.",
    )

    @field_validator(
        "nokia_path_name_prefix",
        "nokia_lsp_name_y",
        "nokia_lsp_name_z",
        "nokia_path_name_prefix_forward",
        "nokia_lsp_name_y_forward",
        "nokia_lsp_name_z_forward",
        "nokia_path_name_prefix_reverse",
        "nokia_lsp_name_y_reverse",
        "nokia_lsp_name_z_reverse",
        mode="before",
    )
    @classmethod
    def _strip_nokia_rsvp_labels(cls, v: str | None) -> str | None:
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        if not isinstance(v, str):
            return v
        s = v.strip()
        if not s:
            return None
        if any(ch in s for ch in ("<", ">", "{", "}", "`")):
            msg = "Nokia label contains disallowed characters"
            raise ValueError(msg)
        return s


class ProjectNE(BaseModel):
    """Project-file NE representation (JSON)."""

    ne_id: str
    loopback_ipv4: IPvAnyAddress
    site: str = "default"
    vendor: Vendor = Vendor.nokia
    loopback_ipv6: IPvAnyAddress | None = None
    node_sid: int | None = None
    role: str = Field(default="P_RTR", description="Hierarchy role code for CSPF role constraints.")


class ProjectLink(BaseModel):
    """Project-file link representation (JSON)."""

    source: str
    target: str
    latency_ms: float
    bandwidth_mbps: int
    reservable_bw_mbps: int | None = None
    srlg: list[str] = Field(default_factory=list)
    interface_src: str | None = None
    interface_dst: str | None = None
    next_hop_ipv4_src: IPvAnyAddress | None = None
    next_hop_ipv4_dst: IPvAnyAddress | None = None


class ProjectImportRequest(BaseModel):
    """Upload a saved project topology to the backend (no CSV needed)."""

    nes: list[ProjectNE]
    links: list[ProjectLink]
