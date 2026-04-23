"""Generate sample_nes.csv and sample_links.csv: 30 sites, role-layered topology.

Per site (by default): 2× DRRTR, 2–3× PECRT, 2× PRTR, 2× PERTR.

NE naming (SITEID = two-digit site index, XX = role instance within site)::

    SITE{SITEID}-DRRTR{XX}-{SITEID}
    SITE{SITEID}-PECRT{XX}-{SITEID}
    SITE{SITEID}-PRTR{XX}-{SITEID}
    SITE{SITEID}-PERTR{XX}-{SITEID}

Example: ``SITE01-DRRTR01-01``, ``SITE01-PRTR02-01``.

Adjacency rules for this sample (undirected) — **hub and spoke via PRTR only** between layers:
  - **No** DRRTR–PECRT, DRRTR–PERTR, or PECRT–PERTR links (traffic between those roles must traverse PRTR).
  - **No** lateral DRRTR–DRRTR, PERTR–PERTR, or PECRT–PECRT links; each access/router uplinks only to **PRTR01** and/or **PRTR02**.
  - **PRTR01–PRTR02** within the site; PRTR rings between sites.

Intra-site **resilience**: each DRRTR, PERTR, and PECRT is **dual-homed** to **PRTR01** and **PRTR02**; the two PRTRs are meshed.

Inter-site: each site's ``PRTR01`` ring to next site; same for ``PRTR02`` (parallel backbone).
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

VENDORS = ["nokia", "huawei", "cisco_xr", "juniper"]

# Allowed unordered role pairs for this sample (hub-and-spoke; no lateral access-layer mesh)
ALLOWED_ROLE_PAIRS: set[tuple[str, str]] = {
    ("DRRTR", "P_RTR"),
    ("PERTR", "P_RTR"),
    ("PECRT", "P_RTR"),
    ("P_RTR", "P_RTR"),
}

N_SITES = 30


def ne_id_site(site_id: int, role: str, instance: int) -> str:
    """SITE{sid}-ROLE{inst}-{sid} with two-digit site id and two-digit instance."""

    sid = f"{site_id:02d}"
    return f"SITE{sid}-{role}{instance:02d}-{sid}"


def site_label(site_id: int) -> str:
    """CSV ``site`` column for grouping in the UI."""

    return f"SITE-{site_id:02d}"


def role_pair_ok(ra: str, rb: str) -> bool:
    a, b = (ra, rb) if ra <= rb else (rb, ra)
    return (a, b) in ALLOWED_ROLE_PAIRS


def add_edge(edges: set[tuple[str, str]], roles: dict[str, str], u: str, v: str) -> None:
    if u == v:
        return
    ru, rv = roles[u], roles[v]
    if not role_pair_ok(ru, rv):
        msg = f"disallowed edge {u}({ru})—{v}({rv})"
        raise ValueError(msg)
    edges.add(tuple(sorted((u, v))))


def main() -> None:
    random.seed(42)
    out_dir = Path(__file__).resolve().parent
    nes_path = out_dir / "sample_nes.csv"
    links_path = out_dir / "sample_links.csv"

    nodes: list[dict[str, object]] = []
    roles: dict[str, str] = {}
    seq = 0
    edges: set[tuple[str, str]] = set()

    def append_ne(ne_id: str, role: str, site_id: int) -> str:
        nonlocal seq
        seq += 1
        nodes.append(
            {
                "ne_id": ne_id,
                "loopback_ipv4": f"10.{(site_id // 64) % 256}.{(site_id + seq) % 256}.{seq % 256}",
                "site": site_label(site_id),
                "vendor": VENDORS[(seq - 1) % len(VENDORS)],
                "loopback_ipv6": f"2001:db8:{seq:04x}::1",
                "node_sid": 16000 + seq,
                "role": role,
            }
        )
        roles[ne_id] = role
        return ne_id

    prtr01_ring: list[str] = []
    prtr02_ring: list[str] = []

    for site_id in range(1, N_SITES + 1):
        # 2–3 PECRT per site (deterministic mix)
        n_pecrt = 3 if site_id % 2 == 0 else 2

        d1 = append_ne(ne_id_site(site_id, "DRRTR", 1), "DRRTR", site_id)
        d2 = append_ne(ne_id_site(site_id, "DRRTR", 2), "DRRTR", site_id)
        p1 = append_ne(ne_id_site(site_id, "PRTR", 1), "P_RTR", site_id)
        p2 = append_ne(ne_id_site(site_id, "PRTR", 2), "P_RTR", site_id)
        e1 = append_ne(ne_id_site(site_id, "PERTR", 1), "PERTR", site_id)
        e2 = append_ne(ne_id_site(site_id, "PERTR", 2), "PERTR", site_id)

        pecrt_ids = [append_ne(ne_id_site(site_id, "PECRT", k), "PECRT", site_id) for k in range(1, n_pecrt + 1)]

        # DRRTR / PERTR / PECRT: only to PRTR (no direct links between those role families or lateral chains)
        for d in (d1, d2):
            add_edge(edges, roles, d, p1)
            add_edge(edges, roles, d, p2)

        add_edge(edges, roles, p1, p2)

        for e in (e1, e2):
            add_edge(edges, roles, e, p1)
            add_edge(edges, roles, e, p2)

        for c in pecrt_ids:
            add_edge(edges, roles, c, p1)
            add_edge(edges, roles, c, p2)

        prtr01_ring.append(p1)
        prtr02_ring.append(p2)

    # Inter-site backbone rings on PRTR01 and PRTR02
    for i in range(N_SITES):
        a = prtr01_ring[i]
        b = prtr01_ring[(i + 1) % N_SITES]
        add_edge(edges, roles, a, b)
        a2 = prtr02_ring[i]
        b2 = prtr02_ring[(i + 1) % N_SITES]
        add_edge(edges, roles, a2, b2)

    with nes_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "ne_id",
                "loopback_ipv4",
                "site",
                "vendor",
                "loopback_ipv6",
                "node_sid",
                "role",
            ],
        )
        w.writeheader()
        for row in nodes:
            w.writerow(row)

    nh_octet = 1

    def next_hop_pair() -> tuple[str, str]:
        nonlocal nh_octet
        a = f"169.254.{(nh_octet // 250) + 1}.{nh_octet % 250 + 1}"
        b = f"169.254.{(nh_octet // 250) + 1}.{(nh_octet + 1) % 250 + 1}"
        nh_octet += 2
        if nh_octet > 60000:
            nh_octet = 1
        return a, b

    with links_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "source",
                "target",
                "latency_ms",
                "bandwidth_mbps",
                "reservable_bw_mbps",
                "interface_src",
                "interface_dst",
                "next_hop_ipv4_src",
                "next_hop_ipv4_dst",
            ],
        )
        w.writeheader()
        for a, b in sorted(edges):
            lat = round(random.uniform(1.0, 12.0), 2)
            bw = random.choice([10000, 40000, 100000])
            res = int(bw * random.uniform(0.65, 0.92))
            nh_s, nh_t = next_hop_pair()
            w.writerow(
                {
                    "source": a,
                    "target": b,
                    "latency_ms": lat,
                    "bandwidth_mbps": bw,
                    "reservable_bw_mbps": res,
                    "interface_src": f"{a}:xe-0/0/{random.randint(0, 3)}",
                    "interface_dst": f"{b}:xe-0/0/{random.randint(0, 3)}",
                    "next_hop_ipv4_src": nh_s,
                    "next_hop_ipv4_dst": nh_t,
                }
            )

    n_pecrt_even = sum(1 for s in range(1, N_SITES + 1) if s % 2 == 0)
    n_pecrt_odd = N_SITES - n_pecrt_even
    print(
        f"Wrote {nes_path} and {links_path}: {len(nodes)} NEs, {len(edges)} links "
        f"({N_SITES} sites, 2 DRRTR, 2 PRTR, 2 PERTR per site; "
        f"{n_pecrt_even} sites with 3 PECRT, {n_pecrt_odd} sites with 2 PECRT)",
    )


if __name__ == "__main__":
    main()
