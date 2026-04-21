"""Generate sample_nes.csv and sample_links.csv with a 400-node mixed-vendor topology."""

from __future__ import annotations

import csv
import random
from pathlib import Path

VENDORS = ["nokia", "huawei", "cisco_xr", "juniper"]
ROLES = ["core", "agg", "edge"]
SITES = ["US-East", "US-West", "EU-Central", "APAC"]


def main() -> None:
    random.seed(42)
    out_dir = Path(__file__).resolve().parent
    n = 400
    nes_path = out_dir / "sample_nes.csv"
    links_path = out_dir / "sample_links.csv"

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
        for i in range(1, n + 1):
            ne_id = f"NE{i:03d}"
            site = SITES[(i - 1) % len(SITES)]
            vendor = VENDORS[(i - 1) % len(VENDORS)]
            role = ROLES[(i - 1) % len(ROLES)]
            w.writerow(
                {
                    "ne_id": ne_id,
                    "loopback_ipv4": f"10.0.{(i // 256) % 256}.{i % 256}",
                    "site": site,
                    "vendor": vendor,
                    "loopback_ipv6": f"2001:db8:{i:04x}::1",
                    "node_sid": 16000 + i,
                    "role": role,
                }
            )

    edges: set[tuple[str, str]] = set()
    for i in range(1, n + 1):
        a = f"NE{i:03d}"
        b = f"NE{((i % n) + 1):03d}"
        edges.add(tuple(sorted((a, b))))

    # Add a few deterministic chords for alternate routes
    for i in range(1, n + 1, 9):
        a = f"NE{i:03d}"
        b = f"NE{((i + 37 - 1) % n) + 1:03d}"
        edges.add(tuple(sorted((a, b))))

    extra = 0
    # Target ~2000 edges for 400 nodes (scales like a mid-size backbone)
    target_edges = 2000
    while len(edges) < target_edges and extra < 200000:
        a = f"NE{random.randint(1, n):03d}"
        b = f"NE{random.randint(1, n):03d}"
        if a != b:
            edges.add(tuple(sorted((a, b))))
        extra += 1

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
            lat = round(random.uniform(1.0, 25.0), 2)
            bw = random.choice([10000, 40000, 100000])
            res = int(bw * random.uniform(0.55, 0.95))
            w.writerow(
                {
                    "source": a,
                    "target": b,
                    "latency_ms": lat,
                    "bandwidth_mbps": bw,
                    "reservable_bw_mbps": res,
                    "interface_src": f"{a}:xe-0/0/{random.randint(0, 3)}",
                    "interface_dst": f"{b}:xe-0/0/{random.randint(0, 3)}",
                    "next_hop_ipv4_src": f"169.254.{random.randint(0, 255)}.{random.randint(1, 250)}",
                    "next_hop_ipv4_dst": f"169.254.{random.randint(0, 255)}.{random.randint(1, 250)}",
                }
            )

    print(f"Wrote {nes_path} and {links_path} ({len(edges)} links)")


if __name__ == "__main__":
    main()
