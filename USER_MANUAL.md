# PRISM User Manual

## Purpose

PRISM helps you reason about RSVP-TE / SR-MPLS / SRv6 style tunnel designs on a physical graph:

- Import NEs and links from CSV.
- Compute a minimum-latency primary path under optional bandwidth and hop limits.
- Compute a strict node-disjoint backup path (intermediate nodes on the primary are removed for the backup search).
- Highlight paths on an interactive map, simulate failures, and export vendor-oriented configuration snippets.

## CSV formats

### `nes.csv`

| Column | Required | Notes |
| --- | --- | --- |
| `ne_id` | Yes | Unique identifier (example: `NYC-NE01`). |
| `loopback_ipv4` | Yes | IPv4 loopback used as tunnel endpoint addressing. |
| `site` | No | Grouping field for compound visualization. |
| `vendor` | No | `nokia`, `huawei`, `cisco_xr`, `juniper` (default `nokia`). |
| `loopback_ipv6` | No | Optional SRv6 locator-style addressing. |
| `node_sid` | No | Integer node SID for SR-MPLS style templates. |
| `role` | No | Role labels used for optional role-based path rules (examples: `DRRTR`, `PRTR`, `PERTR`, `PECRT`). |

### `links.csv`

| Column | Required | Notes |
| --- | --- | --- |
| `source` | Yes | Source `ne_id`. |
| `target` | Yes | Target `ne_id`. |
| `latency_ms` | Yes | Float latency in milliseconds (CSPF cost). |
| `bandwidth_mbps` | Yes | Physical capacity. |
| `reservable_bw_mbps` | No | Reservable capacity for CSPF pruning (defaults to `bandwidth_mbps`). |
| `interface_src` / `interface_dst` | No | Displayed in tooltips and carried into hop metadata. |
| `next_hop_ipv4_src` / `next_hop_ipv4_dst` | No | Used for explicit hop addressing in generated configs. |

Parallel links are separate rows with the same `source` and `target`.

## UI guide

### Import

- Drag and drop `nes.csv` and `links.csv` onto the window, or use the file picker in the left panel.

### Compute

1. Choose **Source** and **Destination** NEs.
2. Adjust **Required Bandwidth** and **Max Hops** as needed.
3. Select **Mode** (`rsvp_te`, `sr_mpls`, `srv6`).
4. Click **Compute LSP**.

The graph highlights the primary path in cyan and the backup path in orange. Non-path elements dim when a path exists.

#### Path Rules (left panel)

The left panel tab is labeled **Path Rules** (previously “Constraints”). It contains the inputs used by CSPF:

- Required bandwidth
- Max hops
- Enforce role-based path finding (optional)
- Backup Availability Trade-Off (%)

Auto-compute behavior:

- The app recomputes automatically **only** when the **Backup Availability Trade-Off slider** is moved (when enabled).
- Selecting Source/Destination does **not** auto-compute; use **Compute LSP**.

### Failure simulation

Right-click a node or link and choose **Simulate Failure**. The UI triggers an automatic recomputation (when failures are active) and shows an impact summary against the last “clean” baseline compute.

### Justification panel

Shows warnings (for example missing backup), the ordered primary NE list, bandwidth-pruned edges, and rejected Yen candidates (for example paths over the hop limit or higher latency alternates).

### Utilization heatmap

After a successful compute, the simulator records a lightweight reservation entry for heatmap coloring. Toggle **Utilization heatmap** to color links based on reserved capacity versus `bandwidth_mbps`.

### Export

- **Copy ingress cfg** copies the ingress NE configuration only.
- **Download ZIP** returns one `.cfg` per NE on the primary path, using each NE’s `vendor` field to select the Jinja2 template set.

## Vendor configuration notes

Generated configurations are **illustrative**: they demonstrate the correct CLI families and variable wiring (explicit hops, tunnel names, destinations) but are not a substitute for your internal golden templates, interface naming standards, or feature licensing constraints.

Always review:

- Interface names and numbering.
- Tunnel IDs / LSP names for collisions.
- RSVP/SR feature enablement on platforms (many defaults are intentionally omitted).

## Configuration Output overlay

Open **View Configuration** to see the exported configuration with three tabs:

- **Path details**: path summary (ordered nodes + totals).
- **Forward path**: ingress-side CLI block.
- **Reverse path**: egress-side CLI block.

### User Define Configuration (X/Y/Z)

On the **Forward path** and **Reverse path** tabs you can edit:

- **X Values**
- **Y Values**
- **Z Values**

and press **Update configuration**.

Behavior:

- The preview refreshes automatically after a short delay when X/Y/Z are edited.
- Update / preview only refresh the **currently selected** tab block (Forward or Reverse). The other block is unchanged until you update it or view it.

## Offline executable expectations

The PyInstaller bundle runs a local HTTP server and opens a browser tab. No cloud services are required. Keep in mind that “single file” (`--onefile`) packaging trades startup time for convenience; this repository targets **one-file** output by default.

## License / copyright

### Copyright

In most jurisdictions, copyright exists automatically when you create the code (you do not need to “apply” for it to exist).
What matters for “can others use it freely” is the **license** you ship with the code/executable.

### Current license (MIT)

This repo currently uses **MIT** (`LICENSE`), which explicitly allows anyone to:

- use, copy, modify, publish, distribute, sublicense, and/or sell copies

as long as they keep the MIT notice.
