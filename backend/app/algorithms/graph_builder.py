"""Convert validated records into NetworkX structures and expanded CSPF graphs."""

from __future__ import annotations

import csv
import io
import ipaddress
from typing import Any

import networkx as nx

from app.core.exceptions import ImportValidationError
from app.core.models import LinkRecord, NERecord, Vendor


def _parse_srlg(raw: str | None) -> list[str]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s:
        return []
    for sep in (";", "|", " "):
        if sep in s:
            parts = [p.strip() for p in s.split(sep)]
            return sorted({p for p in parts if p})
    return [s]


def _parse_vendor(raw: str | None) -> Vendor:
    if raw is None or str(raw).strip() == "":
        return Vendor.nokia
    key = str(raw).strip().lower()
    try:
        return Vendor(key)
    except ValueError as exc:
        msg = f"Invalid vendor '{raw}'. Expected one of: nokia, huawei, cisco_xr, juniper"
        raise ImportValidationError(msg) from exc


def parse_nes_csv(content: str) -> dict[str, NERecord]:
    """Parse nes.csv text into a mapping of ne_id -> NERecord."""

    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        msg = "nes.csv is empty or missing a header row"
        raise ImportValidationError(msg)
    fields = {h.strip().lower(): h for h in reader.fieldnames if h}
    has_role_column = "role" in fields
    required = {"ne_id", "loopback_ipv4"}
    missing = required - set(fields.keys())
    if missing:
        msg = f"nes.csv missing required columns: {sorted(missing)}"
        raise ImportValidationError(msg)
    out: dict[str, NERecord] = {}
    for row in reader:
        if not row or all((v is None or str(v).strip() == "") for v in row.values()):
            continue
        ne_id = str(row.get(fields["ne_id"], "")).strip()
        lb4 = str(row.get(fields["loopback_ipv4"], "")).strip()
        if not ne_id or not lb4:
            msg = "Each row in nes.csv must include ne_id and loopback_ipv4"
            raise ImportValidationError(msg)
        site = str(row.get(fields.get("site", ""), "") or "default").strip() or "default"
        vendor = _parse_vendor(row.get(fields.get("vendor", ""), "") if "vendor" in fields else None)
        if has_role_column:
            raw_role = row.get(fields["role"], "")
            role = str(raw_role).strip()
        else:
            role = "P_RTR"
        lb6_raw = row.get(fields["loopback_ipv6"], "") if "loopback_ipv6" in fields else ""
        lb6 = str(lb6_raw).strip() or None
        node_sid_raw = row.get(fields["node_sid"], "") if "node_sid" in fields else ""
        node_sid: int | None
        try:
            node_sid = int(str(node_sid_raw).strip()) if str(node_sid_raw).strip() else None
        except ValueError as exc:
            msg = f"Invalid node_sid for NE {ne_id}"
            raise ImportValidationError(msg) from exc
        try:
            ipv4 = ipaddress.ip_address(lb4)
        except ValueError as exc:
            msg = f"Invalid loopback_ipv4 for NE {ne_id}"
            raise ImportValidationError(msg) from exc
        ipv6 = None
        if lb6:
            try:
                ipv6 = ipaddress.ip_address(lb6)
            except ValueError as exc:
                msg = f"Invalid loopback_ipv6 for NE {ne_id}"
                raise ImportValidationError(msg) from exc
        rec = NERecord(
            ne_id=ne_id,
            loopback_ipv4=ipv4,
            site=site,
            vendor=vendor,
            loopback_ipv6=ipv6,
            node_sid=node_sid,
            role=role,
        )
        if ne_id in out:
            msg = f"Duplicate ne_id in nes.csv: {ne_id}"
            raise ImportValidationError(msg)
        out[ne_id] = rec
    if not out:
        msg = "nes.csv contains no data rows"
        raise ImportValidationError(msg)
    return out


def parse_links_csv(nes: dict[str, NERecord], content: str) -> tuple[nx.MultiGraph, list[LinkRecord]]:
    """Parse links.csv and build a MultiGraph with parallel edge keys."""

    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        msg = "links.csv is empty or missing a header row"
        raise ImportValidationError(msg)
    fields = {h.strip().lower(): h for h in reader.fieldnames if h}
    required = {"source", "target", "latency_ms", "bandwidth_mbps"}
    missing = required - set(fields.keys())
    if missing:
        msg = f"links.csv missing required columns: {sorted(missing)}"
        raise ImportValidationError(msg)
    g: nx.MultiGraph = nx.MultiGraph()
    for ne in nes:
        g.add_node(ne)
    records: list[LinkRecord] = []
    pair_counters: dict[tuple[str, str], int] = {}
    for row in reader:
        if not row or all((v is None or str(v).strip() == "") for v in row.values()):
            continue
        src = str(row.get(fields["source"], "")).strip()
        dst = str(row.get(fields["target"], "")).strip()
        if not src or not dst:
            msg = "links.csv rows must include source and target"
            raise ImportValidationError(msg)
        if src not in nes or dst not in nes:
            msg = f"Unknown NE in link {src}->{dst}. All endpoints must exist in nes.csv"
            raise ImportValidationError(msg)
        try:
            lat = float(str(row.get(fields["latency_ms"], "")).strip())
        except ValueError as exc:
            msg = f"Invalid latency_ms for link {src}->{dst}"
            raise ImportValidationError(msg) from exc
        series_raw = row.get(fields.get("latency_24h", ""), "") if "latency_24h" in fields else ""
        latency_24h: list[float] | None = None
        if str(series_raw).strip():
            try:
                vals = [float(x.strip()) for x in str(series_raw).split(",")]
            except ValueError as exc:
                msg = f"Invalid latency_24h for link {src}->{dst} (must be 24 comma-separated floats)"
                raise ImportValidationError(msg) from exc
            if len(vals) != 24:
                msg = f"Invalid latency_24h for link {src}->{dst} (expected 24 values)"
                raise ImportValidationError(msg)
            latency_24h = vals
        try:
            bw = int(float(str(row.get(fields["bandwidth_mbps"], "")).strip()))
        except ValueError as exc:
            msg = f"Invalid bandwidth_mbps for link {src}->{dst}"
            raise ImportValidationError(msg) from exc
        res_raw = row.get(fields.get("reservable_bw_mbps", ""), "") if "reservable_bw_mbps" in fields else ""
        try:
            res_bw = int(float(str(res_raw).strip())) if str(res_raw).strip() else bw
        except ValueError as exc:
            msg = f"Invalid reservable_bw_mbps for link {src}->{dst}"
            raise ImportValidationError(msg) from exc
        if src == dst:
            msg = f"Self-loop not allowed: {src}"
            raise ImportValidationError(msg)
        if lat < 0 or bw < 0 or res_bw < 0:
            msg = f"Negative metric/capacity not allowed on {src}->{dst}"
            raise ImportValidationError(msg)
        iface_src = str(row.get(fields.get("interface_src", ""), "") or "").strip() or None
        iface_dst = str(row.get(fields.get("interface_dst", ""), "") or "").strip() or None
        srlg_raw = row.get(fields.get("srlg", ""), "") if "srlg" in fields else ""
        srlg = _parse_srlg(srlg_raw)
        nh_src_raw = row.get(fields.get("next_hop_ipv4_src", ""), "") if "next_hop_ipv4_src" in fields else ""
        nh_dst_raw = row.get(fields.get("next_hop_ipv4_dst", ""), "") if "next_hop_ipv4_dst" in fields else ""
        nh_src = str(nh_src_raw).strip() or None
        nh_dst = str(nh_dst_raw).strip() or None
        nh_src_ip = ipaddress.ip_address(nh_src) if nh_src else None
        nh_dst_ip = ipaddress.ip_address(nh_dst) if nh_dst else None
        a, b = (src, dst) if src < dst else (dst, src)
        key = pair_counters.get((a, b), 0)
        pair_counters[(a, b)] = key + 1
        edge_attrs: dict[str, Any] = {
            "latency_ms": lat,
            "latency_24h": latency_24h,
            "bandwidth_mbps": bw,
            "reservable_bw_mbps": res_bw,
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
                srlg=srlg,
                interface_src=iface_src,
                interface_dst=iface_dst,
                next_hop_ipv4_src=nh_src_ip,
                next_hop_ipv4_dst=nh_dst_ip,
                edge_key=key,
            )
        )
    if not records:
        msg = "links.csv contains no data rows"
        raise ImportValidationError(msg)
    return g, records


def build_expanded_graph(
    mg: nx.MultiGraph,
    *,
    required_bw: int | None,
    failed_ne_ids: set[str],
    failed_link_keys: set[tuple[str, str, int]],
    excluded_srlgs: set[str] | None = None,
    time_hour: int | None = None,
) -> tuple[nx.Graph, dict[str, tuple[str, str, int]]]:
    """
    Build an undirected simple Graph where each physical link is subdivided.

    Returns mapping link_node_id -> (u, v, key).
    """

    h = nx.Graph()
    ln_map: dict[str, tuple[str, str, int]] = {}
    for u, v, key, data in mg.edges(keys=True, data=True):
        if u in failed_ne_ids or v in failed_ne_ids:
            continue
        if (u, v, key) in failed_link_keys or (v, u, key) in failed_link_keys:
            continue
        req = int(required_bw or 0)
        avail = int(data.get("reservable_bw_mbps", 0))
        if req > 0 and avail < req:
            continue
        if excluded_srlgs:
            edge_srlg = set(data.get("srlg") or [])
            if edge_srlg & excluded_srlgs:
                continue
        lat = float(data.get("latency_ms", 0.0))
        if time_hour is not None:
            series = data.get("latency_24h")
            if isinstance(series, list) and len(series) == 24:
                try:
                    lat = float(series[int(time_hour)])
                except Exception:
                    pass
        from app.algorithms.utils import link_node_id

        ln = link_node_id(u, v, int(key))
        ln_map[ln] = (u, v, int(key))
        h.add_edge(u, ln, weight=0.0, kind="ne_to_ln")
        h.add_edge(ln, v, weight=lat, kind="ln_to_ne", latency_ms=lat)
    return h, ln_map


def expanded_path_to_ne_path(path: list[str]) -> list[str]:
    """Strip synthetic link nodes from an expanded-graph shortest path."""

    return [n for n in path if not n.startswith("__LN:")]


def expanded_path_to_edge_sequence(
    path: list[str], ln_map: dict[str, tuple[str, str, int]]
) -> list[tuple[str, str, int]]:
    """Map expanded path to directed MultiGraph edges (u,v,key) following traversal order."""

    edges: list[tuple[str, str, int]] = []
    for i, node in enumerate(path):
        if not node.startswith("__LN:"):
            continue
        left = path[i - 1]
        right = path[i + 1]
        u_g, v_g, k = ln_map[node]
        if {left, right} != {u_g, v_g}:
            msg = "Expanded path does not align with link subdivision endpoints"
            raise ValueError(msg)
        if left == u_g:
            edges.append((u_g, v_g, k))
        else:
            edges.append((v_g, u_g, k))
    return edges
