"""Lenient CSV import with per-row validation feedback (skips invalid rows)."""

from __future__ import annotations

import csv
import io
import ipaddress
from typing import Any

import networkx as nx

from app.core.models import CsvRowIssue, LinkRecord, NERecord, Vendor


def _parse_srlg(raw: str | None) -> list[str]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s:
        return []
    # support "SRLG1;SRLG2" or "SRLG1|SRLG2" or "SRLG1 SRLG2"
    for sep in (";", "|", " "):
        if sep in s:
            parts = [p.strip() for p in s.split(sep)]
            return sorted({p for p in parts if p})
    return [s]


def _parse_vendor_soft(raw: str | None) -> Vendor | None:
    if raw is None or str(raw).strip() == "":
        return Vendor.nokia
    key = str(raw).strip().lower()
    try:
        return Vendor(key)
    except ValueError:
        return None


def parse_nes_csv_lenient(content: str) -> tuple[dict[str, NERecord], list[CsvRowIssue]]:
    """Parse nes.csv, skip invalid rows, return issues with spreadsheet row numbers (header = row 1)."""

    issues: list[CsvRowIssue] = []
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        issues.append(CsvRowIssue(file="nes.csv", row=1, field="", message="Missing header row"))
        return {}, issues
    fields = {h.strip().lower(): h for h in reader.fieldnames if h}
    has_role_column = "role" in fields
    required = {"ne_id", "loopback_ipv4"}
    missing = required - set(fields.keys())
    if missing:
        issues.append(
            CsvRowIssue(
                file="nes.csv",
                row=1,
                field="",
                message=f"Missing required columns: {sorted(missing)}",
            )
        )
        return {}, issues

    out: dict[str, NERecord] = {}
    for row_index, row in enumerate(reader, start=2):
        if not row or all((v is None or str(v).strip() == "") for v in row.values()):
            continue
        ne_id = str(row.get(fields["ne_id"], "")).strip()
        lb4 = str(row.get(fields["loopback_ipv4"], "")).strip()
        if not ne_id:
            issues.append(CsvRowIssue(file="nes.csv", row=row_index, field="ne_id", message="ne_id is empty"))
            continue
        if not lb4:
            issues.append(
                CsvRowIssue(
                    file="nes.csv",
                    row=row_index,
                    field="loopback_ipv4",
                    message="loopback_ipv4 is required when ne_id is set",
                )
            )
            continue
        if ne_id in out:
            issues.append(
                CsvRowIssue(
                    file="nes.csv",
                    row=row_index,
                    field="ne_id",
                    message=f"Duplicate ne_id '{ne_id}' ignored (first occurrence kept)",
                )
            )
            continue
        site = str(row.get(fields.get("site", ""), "") or "default").strip() or "default"
        vendor = _parse_vendor_soft(row.get(fields.get("vendor", ""), "") if "vendor" in fields else None)
        if vendor is None:
            issues.append(
                CsvRowIssue(
                    file="nes.csv",
                    row=row_index,
                    field="vendor",
                    message=f"Invalid vendor '{row.get(fields.get('vendor', ''), '')}'. Using default nokia.",
                )
            )
            vendor = Vendor.nokia
        if has_role_column:
            raw_role = row.get(fields["role"], "")
            role = str(raw_role).strip()
        else:
            role = "P_RTR"
        lb6_raw = row.get(fields["loopback_ipv6"], "") if "loopback_ipv6" in fields else ""
        lb6 = str(lb6_raw).strip() or None
        node_sid_raw = row.get(fields["node_sid"], "") if "node_sid" in fields else ""
        node_sid: int | None = None
        if str(node_sid_raw).strip():
            try:
                node_sid = int(str(node_sid_raw).strip())
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="nes.csv",
                        row=row_index,
                        field="node_sid",
                        message="'node_sid' must be an integer",
                    )
                )
                continue
        try:
            ipv4 = ipaddress.ip_address(lb4)
        except ValueError:
            issues.append(
                CsvRowIssue(
                    file="nes.csv",
                    row=row_index,
                    field="loopback_ipv4",
                    message="'loopback_ipv4' must be a valid IPv4 address",
                )
            )
            continue
        ipv6 = None
        if lb6:
            try:
                ipv6 = ipaddress.ip_address(lb6)
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="nes.csv",
                        row=row_index,
                        field="loopback_ipv6",
                        message="'loopback_ipv6' must be a valid IPv6 address",
                    )
                )
                continue
        if any(ch in ne_id for ch in ("<", ">", "{", "}", "`")):
            issues.append(CsvRowIssue(file="nes.csv", row=row_index, field="ne_id", message="ne_id has invalid characters"))
            continue
        try:
            rec = NERecord(
                ne_id=ne_id,
                loopback_ipv4=ipv4,
                site=site,
                vendor=vendor,
                loopback_ipv6=ipv6,
                node_sid=node_sid,
                role=role,
            )
        except ValueError as exc:
            issues.append(CsvRowIssue(file="nes.csv", row=row_index, field="ne_id", message=str(exc)))
            continue
        out[ne_id] = rec

    return out, issues


def parse_links_csv_lenient(
    nes: dict[str, NERecord],
    content: str,
) -> tuple[nx.MultiGraph, list[LinkRecord], list[CsvRowIssue]]:
    """Parse links.csv; skip invalid rows; parallel keys assigned per ordered pair."""

    issues: list[CsvRowIssue] = []
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        issues.append(CsvRowIssue(file="links.csv", row=1, field="", message="Missing header row"))
        g: nx.MultiGraph = nx.MultiGraph()
        for ne in nes:
            g.add_node(ne)
        return g, [], issues
    fields = {h.strip().lower(): h for h in reader.fieldnames if h}
    required = {"source", "target", "latency_ms", "bandwidth_mbps"}
    missing = required - set(fields.keys())
    if missing:
        issues.append(
            CsvRowIssue(
                file="links.csv",
                row=1,
                field="",
                message=f"Missing required columns: {sorted(missing)}",
            )
        )
        g = nx.MultiGraph()
        for ne in nes:
            g.add_node(ne)
        return g, [], issues
    g = nx.MultiGraph()
    for ne in nes:
        g.add_node(ne)
    records: list[LinkRecord] = []
    pair_counters: dict[tuple[str, str], int] = {}
    for row_index, row in enumerate(reader, start=2):
        if not row or all((v is None or str(v).strip() == "") for v in row.values()):
            continue
        src = str(row.get(fields["source"], "")).strip()
        dst = str(row.get(fields["target"], "")).strip()
        if not src or not dst:
            issues.append(CsvRowIssue(file="links.csv", row=row_index, field="source", message="source and target are required"))
            continue
        if src not in nes or dst not in nes:
            issues.append(
                CsvRowIssue(
                    file="links.csv",
                    row=row_index,
                    field="source",
                    message=f"Unknown NE in link {src}->{dst} (must exist in imported NE list)",
                )
            )
            continue
        try:
            lat = float(str(row.get(fields["latency_ms"], "")).strip())
        except ValueError:
            issues.append(
                CsvRowIssue(
                    file="links.csv",
                    row=row_index,
                    field="latency_ms",
                    message="'latency_ms' must be a number",
                )
            )
            continue
        series_raw = row.get(fields.get("latency_24h", ""), "") if "latency_24h" in fields else ""
        latency_24h: list[float] | None = None
        if str(series_raw).strip():
            try:
                vals = [float(x.strip()) for x in str(series_raw).split(",")]
                if len(vals) != 24:
                    issues.append(
                        CsvRowIssue(
                            file="links.csv",
                            row=row_index,
                            field="latency_24h",
                            message="latency_24h must contain 24 comma-separated numbers",
                        )
                    )
                else:
                    latency_24h = vals
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="links.csv",
                        row=row_index,
                        field="latency_24h",
                        message="latency_24h must contain only numbers",
                    )
                )
        try:
            bw = int(float(str(row.get(fields["bandwidth_mbps"], "")).strip()))
        except ValueError:
            issues.append(
                CsvRowIssue(
                    file="links.csv",
                    row=row_index,
                    field="bandwidth_mbps",
                    message="'bandwidth_mbps' must be a number",
                )
            )
            continue
        util_raw = row.get(fields.get("current_utilization_mbps", ""), "") if "current_utilization_mbps" in fields else ""
        current_util_mbps: float | None = None
        if str(util_raw).strip():
            try:
                current_util_mbps = float(str(util_raw).strip())
                if current_util_mbps < 0:
                    issues.append(
                        CsvRowIssue(
                            file="links.csv",
                            row=row_index,
                            field="current_utilization_mbps",
                            message="'current_utilization_mbps' must be >= 0",
                        )
                    )
                    current_util_mbps = None
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="links.csv",
                        row=row_index,
                        field="current_utilization_mbps",
                        message="'current_utilization_mbps' must be a number",
                    )
                )
                current_util_mbps = None
        res_raw = row.get(fields.get("reservable_bw_mbps", ""), "") if "reservable_bw_mbps" in fields else ""
        try:
            res_bw = int(float(str(res_raw).strip())) if str(res_raw).strip() else bw
        except ValueError:
            issues.append(
                CsvRowIssue(
                    file="links.csv",
                    row=row_index,
                    field="reservable_bw_mbps",
                    message="'reservable_bw_mbps' must be a number",
                )
            )
            continue
        if src == dst:
            issues.append(CsvRowIssue(file="links.csv", row=row_index, field="source", message="Self-loop not allowed"))
            continue
        if lat < 0 or bw < 0 or res_bw < 0:
            issues.append(
                CsvRowIssue(file="links.csv", row=row_index, field="latency_ms", message="Negative metric/capacity not allowed")
            )
            continue
        iface_src = str(row.get(fields.get("interface_src", ""), "") or "").strip() or None
        iface_dst = str(row.get(fields.get("interface_dst", ""), "") or "").strip() or None
        srlg_raw = row.get(fields.get("srlg", ""), "") if "srlg" in fields else ""
        srlg = _parse_srlg(srlg_raw)
        nh_src_raw = row.get(fields.get("next_hop_ipv4_src", ""), "") if "next_hop_ipv4_src" in fields else ""
        nh_dst_raw = row.get(fields.get("next_hop_ipv4_dst", ""), "") if "next_hop_ipv4_dst" in fields else ""
        nh_src = str(nh_src_raw).strip() or None
        nh_dst = str(nh_dst_raw).strip() or None
        nh_src_ip = None
        nh_dst_ip = None
        if nh_src:
            try:
                nh_src_ip = ipaddress.ip_address(nh_src)
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="links.csv",
                        row=row_index,
                        field="next_hop_ipv4_src",
                        message="Invalid next_hop_ipv4_src",
                    )
                )
                continue
        if nh_dst:
            try:
                nh_dst_ip = ipaddress.ip_address(nh_dst)
            except ValueError:
                issues.append(
                    CsvRowIssue(
                        file="links.csv",
                        row=row_index,
                        field="next_hop_ipv4_dst",
                        message="Invalid next_hop_ipv4_dst",
                    )
                )
                continue
        a, b = (src, dst) if src < dst else (dst, src)
        key = pair_counters.get((a, b), 0)
        pair_counters[(a, b)] = key + 1
        edge_attrs: dict[str, Any] = {
            "latency_ms": lat,
            "latency_24h": latency_24h,
            "bandwidth_mbps": bw,
            "reservable_bw_mbps": res_bw,
            "current_utilization_mbps": current_util_mbps,
            "srlg": srlg,
            "interface_src": iface_src,
            "interface_dst": iface_dst,
            "next_hop_ipv4_src": nh_src_ip,
            "next_hop_ipv4_dst": nh_dst_ip,
            "csv_source": src,
            "csv_target": dst,
        }
        g.add_edge(src, dst, key=key, **edge_attrs)
        records.append(
            LinkRecord(
                source=src,
                target=dst,
                latency_ms=lat,
                bandwidth_mbps=bw,
                reservable_bw_mbps=res_bw,
                current_utilization_mbps=current_util_mbps,
                srlg=srlg,
                interface_src=iface_src,
                interface_dst=iface_dst,
                next_hop_ipv4_src=nh_src_ip,
                next_hop_ipv4_dst=nh_dst_ip,
                edge_key=key,
            )
        )
    return g, records, issues
