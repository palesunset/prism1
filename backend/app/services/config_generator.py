"""Render vendor configuration snippets using Jinja2 templates."""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.models import ExportRequest, Mode, NokiaCliStyle, NERecord, PathResult, Vendor


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

    def render_ingress_clipboard(self, nes: dict[str, NERecord], req: ExportRequest) -> str:
        """Return configuration text for the ingress NE only."""

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

    def build_zip_bundle(self, nes: dict[str, NERecord], req: ExportRequest) -> bytes:
        """Create a ZIP archive with one .cfg per traversed NE on the primary path."""

        ingress_id = req.primary.nodes[0]
        egress_id = req.primary.nodes[-1]
        egress = nes[egress_id]
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for ne_id in req.primary.nodes:
                ne = nes[ne_id]
                body = self.render_for_ne(
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
                zf.writestr(f"{ne_id}.cfg", body)
        return buf.getvalue()
