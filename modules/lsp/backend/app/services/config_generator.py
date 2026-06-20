"""Render vendor configuration snippets using Jinja2 templates."""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path
from typing import Literal

_NokiaLabelDir = Literal["forward", "reverse", "forward_revert", "reverse_revert"]

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.state import topology

from app.core.models import ExportRequest, LinkRecord, Mode, NokiaCliStyle, NERecord, PathResult, Vendor


def _template_name(vendor: Vendor, mode: Mode, nokia_style: NokiaCliStyle) -> str:
    if vendor == Vendor.nokia and nokia_style == NokiaCliStyle.md:
        return f"nokia_md_{mode.value}.j2"
    return f"{vendor.value}_{mode.value}.j2"


def _role_on_path(ne_id: str, primary: PathResult) -> str:
    if ne_id == primary.nodes[0]:
        return "ingress"
    if ne_id == primary.nodes[-1]:
        return "egress"
    return "transit"


def _default_template_dir() -> Path:
    """Resolve templates for development and PyInstaller bundles."""

    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "app" / "templates"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent / "templates"


def calculate_sdp_number(ip: str) -> str:
    """Map loopback /24 last octet to a 4-digit SDP id (illustrative)."""
    last_octet = str(ip).strip().split(".")[-1]
    return str(1000 + int(last_octet, 10)).zfill(4)


def tunnel_id_from_loopback_last_octet(ip: str) -> int:
    """Tunnel / service id from last IPv4 octet (legacy-style)."""
    last_octet = str(ip).strip().split(".")[-1]
    return int(last_octet, 10)


def path_hops_as_ip_dicts(path: PathResult) -> list[dict[str, str]]:
    """Template hop rows use {{ hop.ip }} (legacy)."""
    rows: list[dict[str, str]] = []
    for h in path.hops:
        nh = h.next_hop_ip
        rows.append({"ip": nh if nh else "0.0.0.0"})
    return rows


def reverse_hops_without_first(path_nodes: list[str], nes: dict[str, NERecord]) -> list[dict[str, str]]:
    """Legacy-style reverse hops: reverse nodes, drop first, use loopbacks as {{ hop.ip }}."""
    rev = list(reversed(path_nodes))
    return [{"ip": str(nes[n].loopback_ipv4)} for n in rev[1:]]


def is_drrtr_pecrt(source_role: str, dest_role: str) -> bool:
    a = str(source_role).upper()
    b = str(dest_role).upper()
    return ("DRRTR" in a or "PECRT" in a) and ("DRRTR" in b or "PECRT" in b)


def infer_vendor_from_role(role: str) -> Vendor:
    """Infer vendor from role (ignore CSV vendor column)."""
    r = str(role).upper()
    if "PECRT" in r:
        return Vendor.huawei
    # DRRTR / P_RTR and everything else default to nokia
    return Vendor.nokia


def get_vendor(ne: NERecord) -> str:
    """Legacy prompt helper: returns 'huawei' if role contains PECRT else 'nokia'."""
    return "huawei" if infer_vendor_from_role(ne.role) == Vendor.huawei else "nokia"


def rsvp_template_family(ne: NERecord) -> str:
    """Which RSVP-TE monolithic block to render: use NE's declared vendor for nokia/huawei, else role fallback."""
    if ne.vendor == Vendor.huawei:
        return "huawei"
    if ne.vendor == Vendor.nokia:
        return "nokia"
    return get_vendor(ne)


def calc_sdp(ip: str) -> str:
    """Legacy prompt helper: 1000 + last octet, 4 digits."""
    return calculate_sdp_number(ip)


def is_drrtr_pecrt_path(ne_a: NERecord, ne_b: NERecord) -> bool:
    """Legacy prompt helper: true if both roles contain DRRTR or PECRT."""
    return is_drrtr_pecrt(ne_a.role, ne_b.role)


def build_hop_list(node_ids: list[str], nes: dict[str, NERecord]) -> list[dict[str, str]]:
    """Legacy prompt helper: [{'ip': <loopback>}, ...] in the given order."""
    return [{"ip": str(nes[n].loopback_ipv4)} for n in node_ids]


def get_hops_without_source(
    path_nodes: list[str],
    nes: dict[str, NERecord],
) -> list[dict[str, str]]:
    return [{"ip": str(nes[ne_id].loopback_ipv4)} for ne_id in path_nodes[1:]]


def _nokia_rsvp_label_ctx(source_ne: NERecord, req: ExportRequest, direction: _NokiaLabelDir) -> dict[str, str]:
    """Nokia RSVP-TE: user-overridable path prefix (X) and LSP names (Y, Z).

    Forward / reverse / revert variants fall back to parent tab labels, then legacy globals.
    """
    if direction == "forward":
        x_in = req.nokia_path_name_prefix_forward or req.nokia_path_name_prefix
        y_in = req.nokia_lsp_name_y_forward or req.nokia_lsp_name_y
        z_in = req.nokia_lsp_name_z_forward or req.nokia_lsp_name_z
    elif direction == "forward_revert":
        x_in = (
            req.nokia_path_name_prefix_forward_revert
            or req.nokia_path_name_prefix_forward
            or req.nokia_path_name_prefix
        )
        y_in = req.nokia_lsp_name_y_forward_revert or req.nokia_lsp_name_y_forward or req.nokia_lsp_name_y
        z_in = req.nokia_lsp_name_z_forward_revert or req.nokia_lsp_name_z_forward or req.nokia_lsp_name_z
    elif direction == "reverse":
        x_in = req.nokia_path_name_prefix_reverse or req.nokia_path_name_prefix
        y_in = req.nokia_lsp_name_y_reverse or req.nokia_lsp_name_y
        z_in = req.nokia_lsp_name_z_reverse or req.nokia_lsp_name_z
    else:
        x_in = (
            req.nokia_path_name_prefix_reverse_revert
            or req.nokia_path_name_prefix_reverse
            or req.nokia_path_name_prefix
        )
        y_in = req.nokia_lsp_name_y_reverse_revert or req.nokia_lsp_name_y_reverse or req.nokia_lsp_name_y
        z_in = req.nokia_lsp_name_z_reverse_revert or req.nokia_lsp_name_z_reverse or req.nokia_lsp_name_z

    # Defaults are placeholders; user is expected to override in UI.
    x = (x_in or "XXXXX").strip()
    y = (y_in or "YYYYY-SP:01").strip()
    z = (z_in or "ZZZZZ-SP:02").strip()
    return {"nokia_path_name_prefix": x, "nokia_lsp_name_y": y, "nokia_lsp_name_z": z}


def get_node_position(
    ne_id: str,
    primary: list[str],
    backup: list[str] | None,
) -> Literal["source", "destination", "transit", "backup-transit"] | None:
    if not primary or (ne_id not in primary and (not backup or ne_id not in backup)):
        return None
    if ne_id == primary[0]:
        return "source"
    if ne_id == primary[-1]:
        return "destination"
    if ne_id in primary:
        return "transit"
    if backup and ne_id in backup:
        if ne_id in (backup[0], backup[-1]) and (ne_id == primary[0] or ne_id == primary[-1]):
            return "source" if ne_id == primary[0] else "destination"
        if ne_id not in (primary[0], primary[-1]):
            return "backup-transit"
    return "backup-transit" if (backup and ne_id in backup and ne_id not in primary) else None


def find_link_for_hop(links: list[LinkRecord], a: str, b: str) -> tuple[LinkRecord, bool] | None:
    """Return (link, a_is_source) for directed hop a->b, or None."""
    for lk in links:
        if lk.source == a and lk.target == b:
            return (lk, True)
        if lk.source == b and lk.target == a:
            return (lk, False)
    return None


def _outgoing_toward_next(
    lk: LinkRecord, forward: bool, next_node: str, nes: dict[str, NERecord]
) -> tuple[str, str]:
    if forward:
        out = lk.interface_src
        nh = lk.next_hop_ipv4_dst
    else:
        out = lk.interface_dst
        nh = lk.next_hop_ipv4_src
    nhs = str(nh) if nh is not None else str(nes[next_node].loopback_ipv4)
    return (out or "unknown", nhs)


class ConfigGenerator:
    """Loads Jinja templates from the packaged templates directory."""

    def __init__(self, template_dir: Path | None = None) -> None:
        base = template_dir or _default_template_dir()
        self._env = Environment(
            loader=FileSystemLoader(str(base)),
            autoescape=select_autoescape(enabled_extensions=()),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def _render(
        self,
        template: str,
        **ctx: object,
    ) -> str:
        t = self._env.get_template(template)
        return str(t.render(**ctx))

    def render_for_ne(
        self,
        *,
        ne: NERecord,
        mode: Mode,
        lsp_name: str,
        flex_algo_id: int | None,
        primary: PathResult,
        backup: PathResult | None,
        ingress_ne: str,
        egress_ne: str,
        egress: NERecord,
        nokia_cli_style: NokiaCliStyle = NokiaCliStyle.classic,
    ) -> str:
        """Render a single NE configuration file."""
        tpl = _template_name(ne.vendor, mode, nokia_style=nokia_cli_style)
        template = self._env.get_template(tpl)
        role = _role_on_path(ne.ne_id, primary)
        ctx: dict[str, object] = {
            "ne_id": ne.ne_id,
            "vendor": ne.vendor.value,
            "mode": mode.value,
            "lsp_name": lsp_name,
            "flex_algo_id": flex_algo_id,
            "role": role,
            "ingress_ne": ingress_ne,
            "egress_ne": egress_ne,
            "dest_ip": str(egress.loopback_ipv4),
            "dest_ipv6": str(egress.loopback_ipv6) if egress.loopback_ipv6 else "",
            "primary_hops": [h.model_dump() for h in primary.hops],
            "backup_hops": [h.model_dump() for h in backup.hops] if backup else [],
        }
        return str(template.render(**ctx))

    def _build_rsvp_forward_context(
        self,
        source_ne: NERecord,
        primary: PathResult,
        backup: PathResult | None,
        dest_ne: NERecord,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> dict[str, object]:
        dest_ip = str(dest_ne.loopback_ipv4)
        # Per-direction threshold: decide SP:03 based on this block's latency only.
        path_latency_ms = float(primary.total_latency_ms)
        use_sp03 = path_latency_ms > 5.0
        # Explicit-path hops must use node loopback IPs (not interface next-hops).
        # Primary/secondary hop list excludes the source node and includes the destination node.
        primary_hops = get_hops_without_source(list(primary.nodes), nes)
        backup_hops = get_hops_without_source(list(backup.nodes), nes) if backup and backup.nodes else []
        out: dict[str, object] = {
            "ne_id": source_ne.ne_id,
            "source_ne_id": source_ne.ne_id,
            "dest_ip": dest_ip,
            "dest_label": dest_ne.ne_id,
            "dest_vendor": dest_ne.vendor.value,
            "primary_hops": primary_hops,
            "backup_hops": backup_hops,
            "dest_tunnel_id": tunnel_id_from_loopback_last_octet(dest_ip),
            "sdp_number": calculate_sdp_number(dest_ip),
            "is_drrtr_pecrt": is_drrtr_pecrt(source_ne.role, dest_ne.role),
            "use_sp03": use_sp03,
            "path_latency_ms": path_latency_ms,
        }
        out.update(_nokia_rsvp_label_ctx(source_ne, req, "forward"))
        return out

    def _build_rsvp_reverse_context(
        self,
        dest_ne: NERecord,
        primary: PathResult,
        backup: PathResult | None,
        source_ne: NERecord,
        links: list[LinkRecord],
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> dict[str, object]:
        """Reverse block is authored on the egress NE; Nokia names use the same X/Y/Z as the forward block."""
        source_ip = str(source_ne.loopback_ipv4)
        dest_ip_local = str(dest_ne.loopback_ipv4)
        # Per-direction threshold: decide SP:03 based on this reverse block's latency only.
        path_latency_ms = float(primary.total_latency_ms)
        use_sp03 = path_latency_ms > 5.0
        # Reverse explicit-path hop lists must use node loopbacks (not interface next-hops).
        # Reverse hop list excludes the local (egress) node and includes the far-end node.
        rev_p = reverse_hops_without_first(list(primary.nodes), nes)
        rev_b = reverse_hops_without_first(list(backup.nodes), nes) if backup and backup.nodes else []
        out: dict[str, object] = {
            "ne_id": dest_ne.ne_id,
            "source_ne_id": source_ne.ne_id,
            "source_ip": source_ip,
            "source_label": source_ne.ne_id,
            "source_vendor": source_ne.vendor.value,
            "dest_ip": dest_ip_local,
            "dest_label": dest_ne.ne_id,
            "source_tunnel_id": tunnel_id_from_loopback_last_octet(source_ip),
            "reverse_primary_hops": rev_p,
            "reverse_backup_hops": rev_b,
            "reverse_sdp_number": calculate_sdp_number(source_ip),
            "is_drrtr_pecrt_reverse": is_drrtr_pecrt(dest_ne.role, source_ne.role),
            "use_sp03": use_sp03,
            "path_latency_ms": path_latency_ms,
        }
        out.update(_nokia_rsvp_label_ctx(source_ne, req, "reverse"))
        return out

    def _render_forward(
        self,
        source_ne: NERecord,
        req: ExportRequest,
        dest_ne: NERecord,
        links: list[LinkRecord],
        nes: dict[str, NERecord],
    ) -> str:
        """Forward block: template family from NE vendor (CSV) when nokia/huawei, else role inference."""
        vendor = (
            source_ne.vendor
            if source_ne.vendor in (Vendor.huawei, Vendor.nokia)
            else infer_vendor_from_role(source_ne.role)
        )
        ctx = self._build_rsvp_forward_context(source_ne, req.primary, req.backup, dest_ne, nes, req)
        ctx["dest_vendor"] = str(dest_ne.vendor.value)
        if vendor == Vendor.huawei:
            return self._render("huawei_forward_rsvp_te.j2", **ctx)
        tpl = "nokia_md_forward_rsvp_te.j2" if req.nokia_cli_style == NokiaCliStyle.md else "nokia_forward_rsvp_te.j2"
        return self._render(tpl, **ctx)

    def _render_reverse(
        self,
        dest_ne: NERecord,
        req: ExportRequest,
        source_ne: NERecord,
        links: list[LinkRecord],
        nes: dict[str, NERecord],
    ) -> str:
        """Reverse block: template family from NE vendor (CSV) when nokia/huawei, else role inference."""
        vendor = (
            dest_ne.vendor
            if dest_ne.vendor in (Vendor.huawei, Vendor.nokia)
            else infer_vendor_from_role(dest_ne.role)
        )
        ctx = self._build_rsvp_reverse_context(dest_ne, req.primary, req.backup, source_ne, links, nes, req)
        ctx["source_vendor"] = str(source_ne.vendor.value)
        if vendor == Vendor.huawei:
            return self._render("huawei_reverse_rsvp_te.j2", **ctx)
        tpl = "nokia_md_reverse_rsvp_te.j2" if req.nokia_cli_style == NokiaCliStyle.md else "nokia_reverse_rsvp_te.j2"
        return self._render(tpl, **ctx)

    def _render_ingress_ne_only(self, nes: dict[str, NERecord], req: ExportRequest) -> str:
        ingress_id = req.primary.nodes[0]
        egress_id = req.primary.nodes[-1]
        ne = nes[ingress_id]
        egress = nes[egress_id]
        return self.render_for_ne(
            ne=ne,
            mode=req.mode,
            lsp_name=req.lsp_name,
            flex_algo_id=req.flex_algo_id,
            primary=req.primary,
            backup=req.backup,
            ingress_ne=ingress_id,
            egress_ne=egress_id,
            egress=egress,
            nokia_cli_style=req.nokia_cli_style,
        )

    def _render_rsvp_forward_text(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        """Nokia/Huawei forward (ingress) RSVP-TE block only, no path-details wrapper."""
        p = req.primary
        if not p.nodes:
            return ""
        source_ne = nes[p.nodes[0]]
        dest_ne = nes[p.nodes[-1]]
        forward_vendor = rsvp_template_family(source_ne)
        forward_ctx = self._build_rsvp_forward_context(source_ne, req.primary, req.backup, dest_ne, nes, req)
        forward_ctx["dest_vendor"] = str(dest_ne.vendor.value)
        return self._render(f"{forward_vendor}_forward_rsvp_te.j2", **forward_ctx)

    def _render_rsvp_reverse_text(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        """Nokia/Huawei reverse (egress) RSVP-TE block only."""
        p = req.primary
        if not p.nodes:
            return ""
        source_ne = nes[p.nodes[0]]
        dest_ne = nes[p.nodes[-1]]
        links = topology.links if topology.links is not None else []
        reverse_vendor = rsvp_template_family(dest_ne)
        reverse_ctx = self._build_rsvp_reverse_context(dest_ne, req.primary, req.backup, source_ne, links, nes, req)
        reverse_ctx["source_vendor"] = str(source_ne.vendor.value)
        return self._render(f"{reverse_vendor}_reverse_rsvp_te.j2", **reverse_ctx)

    def render_rsvp_monolithic_section(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
        section: Literal["forward", "reverse", "revert_forward", "revert_reverse"],
    ) -> str:
        """Single monolithic block for REST partial refresh (client merges into full string)."""
        if req.mode != Mode.rsvp_te:
            return ""
        if section == "forward":
            return self._render_rsvp_forward_text(nes, req)
        if section == "reverse":
            return self._render_rsvp_reverse_text(nes, req)
        if section == "revert_forward":
            return self._render_rsvp_revert_forward_text(nes, req)
        return self._render_rsvp_revert_reverse_text(nes, req)

    def _render_rsvp_revert_forward_text(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        """Shutdown/disable RSVP objects on the forward (ingress) NE."""
        p = req.primary
        if not p.nodes:
            return ""
        source_ne = nes[p.nodes[0]]
        dest_ne = nes[p.nodes[-1]]
        forward_vendor = rsvp_template_family(source_ne)
        ctx = self._build_rsvp_forward_context(source_ne, req.primary, req.backup, dest_ne, nes, req)
        ctx["dest_vendor"] = str(dest_ne.vendor.value)
        ctx.update(_nokia_rsvp_label_ctx(source_ne, req, "forward_revert"))
        if forward_vendor == "huawei":
            ctx["tunnel_id"] = tunnel_id_from_loopback_last_octet(str(dest_ne.loopback_ipv4))
            return self._render("huawei_revert_rsvp_te.j2", **ctx)
        tpl = (
            "nokia_md_revert_rsvp_te.j2"
            if req.nokia_cli_style == NokiaCliStyle.md
            else "nokia_revert_rsvp_te.j2"
        )
        return self._render(tpl, **ctx)

    def _render_rsvp_revert_reverse_text(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        """Shutdown/disable RSVP objects on the reverse (egress) NE."""
        p = req.primary
        if not p.nodes:
            return ""
        source_ne = nes[p.nodes[0]]
        dest_ne = nes[p.nodes[-1]]
        links = topology.links if topology.links is not None else []
        reverse_vendor = rsvp_template_family(dest_ne)
        ctx = self._build_rsvp_reverse_context(dest_ne, req.primary, req.backup, source_ne, links, nes, req)
        ctx["source_vendor"] = str(source_ne.vendor.value)
        # Shared Nokia revert templates branch on `backup_hops` like forward revert; reverse ctx uses `reverse_*` keys.
        rev_b = ctx.get("reverse_backup_hops")
        ctx["backup_hops"] = list(rev_b) if rev_b else []
        ctx.update(_nokia_rsvp_label_ctx(source_ne, req, "reverse_revert"))
        if reverse_vendor == "huawei":
            ctx["tunnel_id"] = tunnel_id_from_loopback_last_octet(str(source_ne.loopback_ipv4))
            return self._render("huawei_revert_rsvp_te.j2", **ctx)
        tpl = (
            "nokia_md_revert_rsvp_te.j2"
            if req.nokia_cli_style == NokiaCliStyle.md
            else "nokia_revert_rsvp_te.j2"
        )
        return self._render(tpl, **ctx)

    def generate_monolithic_config(
        self,
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        """Monolithic two-block: legacy forward (source vendor) + reverse (dest vendor)."""
        if req.mode != Mode.rsvp_te:
            return self._render_ingress_ne_only(nes, req)
        p = req.primary
        if not p.nodes:
            return ""
        forward_text = self._render_rsvp_forward_text(nes, req)
        reverse_text = self._render_rsvp_reverse_text(nes, req)

        def fmt_nodes_with_ip(nodes: list[str]) -> str:
            lines: list[str] = []
            for n in nodes:
                ip = str(nes[n].loopback_ipv4) if n in nes else "unknown"
                lines.append(f"- {n} ({ip})")
            return "\n".join(lines) if lines else "- (none)"

        primary_nodes = list(req.primary.nodes)
        primary_rev = list(reversed(primary_nodes))
        has_backup = bool(req.backup and req.backup.nodes and len(req.backup.nodes) > 1)
        backup_nodes = list(req.backup.nodes) if has_backup and req.backup is not None else []
        backup_rev = list(reversed(backup_nodes)) if backup_nodes else []

        def fmt_chain(nodes: list[str]) -> str:
            return " -> ".join(nodes) if nodes else "(none)"

        # Path details = topology only. Nokia X/Y/Z and vendor hints are edited in the UI, not repeated here.
        details = "=== PATH DETAILS ===\n\n" + (
            f"Primary LSP: {fmt_chain(primary_nodes)}\n"
            f"\n{fmt_nodes_with_ip(primary_nodes)}\n\n"
            f"Total latency: {p.total_latency_ms:.2f} ms\n"
            f"Total hops: {p.hop_count}\n\n"
            f"Reverse Primary LSP: {fmt_chain(primary_rev)}\n"
            f"\n{fmt_nodes_with_ip(primary_rev)}\n\n"
        )
        if has_backup and req.backup is not None:
            b = req.backup
            details += (
                f"Secondary LSP: {fmt_chain(backup_nodes)}\n"
                f"\n{fmt_nodes_with_ip(backup_nodes)}\n\n"
                f"Total latency: {b.total_latency_ms:.2f} ms\n"
                f"Total hops: {b.hop_count}\n\n"
                f"Reverse Secondary LSP: {fmt_chain(backup_rev)}\n"
                f"\n{fmt_nodes_with_ip(backup_rev)}\n\n"
            )

        revert_forward = self._render_rsvp_revert_forward_text(nes, req)
        revert_reverse = self._render_rsvp_revert_reverse_text(nes, req)
        return (
            details
            + "=== FORWARD PATH ===\n\n"
            + forward_text
            + "\n\n=== REVERSE PATH ===\n\n"
            + reverse_text
            + "\n\n=== REVERT FORWARD ===\n\n"
            + revert_forward
            + "\n\n=== REVERT REVERSE ===\n\n"
            + revert_reverse
        )

    def generate_ingress_combo(self, nes: dict[str, NERecord], req: ExportRequest) -> str:
        """Compatibility wrapper used by existing export endpoints/UI."""
        return self.generate_monolithic_config(nes, req)

    def render_ingress_clipboard(self, nes: dict[str, NERecord], req: ExportRequest) -> str:
        """Plaintext: RSVP-TE uses forward+reverse; other modes use ingress NE only."""
        if req.mode == Mode.rsvp_te:
            return self.generate_monolithic_config(nes, req)
        return self._render_ingress_ne_only(nes, req)

    def _transit_from_path(
        self,
        ne_id: str,
        path: list[str],
        links: list[LinkRecord],
        nes: dict[str, NERecord],
        req: ExportRequest,
    ) -> str:
        if ne_id not in path or path.index(ne_id) >= len(path) - 1:
            msg = f"No outgoing hop for transit on {ne_id!r}"
            raise ValueError(msg)
        next_node = path[path.index(ne_id) + 1]
        ne = nes[ne_id]
        found = find_link_for_hop(links, ne_id, next_node)
        if not found:
            msg = f"No link between {ne_id!r} and {next_node!r} for transit config"
            raise ValueError(msg)
        lk, is_forward = found
        outgoing, next_hop = _outgoing_toward_next(lk, is_forward, next_node, nes)
        lsp_mode = str(req.mode.value)
        if ne.vendor == Vendor.huawei:
            return self._render(
                "huawei_transit.j2",
                ne_id=ne_id,
                lsp_mode=lsp_mode,
                outgoing_interface=outgoing,
                next_hop_ip=next_hop,
                rsvp_enabled=True,
            )
        if ne.vendor == Vendor.nokia:
            tpl = "nokia_md_transit.j2" if req.nokia_cli_style == NokiaCliStyle.md else "nokia_transit.j2"
            return self._render(
                tpl,
                ne_id=ne_id,
                lsp_mode=lsp_mode,
                outgoing_interface=outgoing,
                next_hop_ip=next_hop,
                rsvp_enabled=True,
            )
        return self.render_for_ne(
            ne=ne,
            mode=req.mode,
            lsp_name=req.lsp_name,
            flex_algo_id=req.flex_algo_id,
            primary=req.primary,
            backup=req.backup,
            ingress_ne=req.primary.nodes[0],
            egress_ne=req.primary.nodes[-1],
            egress=nes[req.primary.nodes[-1]],
            nokia_cli_style=req.nokia_cli_style,
        )

    def generate_node_config(
        self,
        ne_id: str,
        links: list[LinkRecord],
        nes: dict[str, NERecord],
        req: ExportRequest,
        *,
        path_type: Literal["primary", "backup"] = "primary",
    ) -> str:
        """Per-node: forward, reverse, or minimal transit. Membership checked against `path_type` path."""
        p_nodes = list(req.primary.nodes)
        b_list = list(req.backup.nodes) if req.backup else None

        if path_type == "backup":
            if not b_list or ne_id not in b_list:
                msg = f"ne_id {ne_id!r} is not on the backup path"
                raise ValueError(msg)
        elif ne_id not in p_nodes:
            msg = f"ne_id {ne_id!r} is not on the primary path"
            raise ValueError(msg)

        pos = get_node_position(ne_id, p_nodes, b_list)
        if pos is None:
            msg = f"Node {ne_id!r} not on active path"
            raise ValueError(msg)
        ne = nes[ne_id]
        source_ne = nes[p_nodes[0]]
        dest_ne = nes[p_nodes[-1]]

        if pos in ("transit", "backup-transit") and ne.vendor in (Vendor.huawei, Vendor.nokia):
            path = p_nodes if pos == "transit" else (b_list or [])
            return self._transit_from_path(ne_id, path, links, nes, req)

        if req.mode == Mode.rsvp_te:
            if pos == "source":
                return self._render_forward(ne, req, dest_ne, links, nes)
            if pos == "destination":
                return self._render_reverse(ne, req, source_ne, links, nes)
            return self.render_for_ne(
                ne=ne,
                mode=Mode.rsvp_te,
                lsp_name=req.lsp_name,
                flex_algo_id=req.flex_algo_id,
                primary=req.primary,
                backup=req.backup,
                ingress_ne=p_nodes[0],
                egress_ne=p_nodes[-1],
                egress=dest_ne,
                nokia_cli_style=req.nokia_cli_style,
            )

        if ne_id not in req.primary.nodes:
            msg = f"ne_id {ne_id!r} is not on the primary path for this mode"
            raise ValueError(msg)
        ingress = p_nodes[0]
        egress = p_nodes[-1]
        return self.render_for_ne(
            ne=ne,
            mode=req.mode,
            lsp_name=req.lsp_name,
            flex_algo_id=req.flex_algo_id,
            primary=req.primary,
            backup=req.backup,
            ingress_ne=ingress,
            egress_ne=egress,
            egress=nes[egress],
            nokia_cli_style=req.nokia_cli_style,
        )

    def build_zip_bundle(self, nes: dict[str, NERecord], req: ExportRequest) -> bytes:
        """ZIP: one .cfg per NE from source through penultimate (no egress-only file)."""
        links: list[LinkRecord] = topology.links if topology.links is not None else []
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for ne_id in req.primary.nodes[:-1]:
                body = self.generate_node_config(ne_id, links, nes, req, path_type="primary")
                zf.writestr(f"{ne_id}.cfg", body)
        return buf.getvalue()
