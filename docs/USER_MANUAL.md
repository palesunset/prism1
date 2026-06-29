# Prism Platform — User Manual

> Location: `docs/USER_MANUAL.md` in the repository root. See also `docs/PROJECT_STRUCTURE.md` for folder layout.

## About Prism Platform

**Prism Platform** is an offline-first toolkit for network engineering teams. It runs entirely on your PC or a server on your LAN — no cloud account required.

| Module | What it does |
| --- | --- |
| **Equipment Inventory** | Sites, equipment, slots/ports, map, dashboard, CSV import/export, Oz AI assistant |
| **LSP Design** | Topology import, CSPF primary/backup paths, failure simulation, vendor config export |
| **Mini IPAM** | IP registry, search, VLSM import, utilization analytics, conflict detection, integrity audit, **IP Workflow** |
| **Quick Notes** | Floating notes and to-do lists (PRISM menu) |
| **IP Calculator** | CIDR/subnet diagnostic tool (PRISM menu) |
| **VLSM Planner** | Variable-length subnet planning with **Save to IPAM** (PRISM menu) |
| **NetLens** | Floating IP validation engine — IP/CIDR/VLSM analysis, IPAM cross-check, **Submit to Workflow** (PRISM menu) |

**Repository:** [github.com/palesunset/prism1](https://github.com/palesunset/prism1)

---

## First launch

### Requirements

| Component | Version |
| --- | --- |
| Python | 3.11 or newer |
| Node.js | 20 or newer (Inventory API needs **22.5+** for built-in SQLite) |
| npm | Comes with Node |

### Install and start (from repository root)

```powershell
npm run install:all
pip install -r modules/lsp/backend/requirements.txt
npm run dev
```

Open **http://localhost:5173** in your browser.

If ports are stuck from a previous session:

```powershell
npm run dev:kill
npm run dev
```

### Home screen

The home screen lists three main modules:

1. **LSP Design** — path computation and simulation  
2. **Equipment Inventory** — sites and equipment  
3. **Mini IPAM** — IP address management  

Press **1**, **2**, or **3** on the keyboard as shortcuts.

### PRISM menu (floating switcher)

While working in any module, use the draggable **PRISM** floating menu to:

- Jump between **Home**, **Equipment Inventory**, **LSP Design**, and **Mini IPAM**
- Open **Quick Notes**, **IP Calculator**, **VLSM Planner**, and **NetLens** as floating panels

Drag the menu by its grip handle; position is remembered between sessions.

---

## Equipment Inventory

### Overview

Manage data center and network equipment: sites, racks, chassis, slots, ports, and a geographic map view.

### Typical workflow

1. Open **Inventory** from the home screen.
2. Create or import **Sites** and **Equipment** (CSV import supported).
3. Use the **Dashboard** for utilization summaries.
4. Open the **Map** to see site locations.
5. Use **Oz** (floating chat) for natural-language queries when a local Llama model is configured (optional).

### Oz AI (optional)

Oz runs a local **GGUF** model via `node-llama-cpp`. Inventory works without it; chat stays disabled until the model file is present.

- Default model path: `modules/inventory/backend/models/llama-3.2-3b-instruct-q4_k_m.gguf` (~2 GB)
- Configure a different file in `modules/inventory/backend/.env`: `OZ_MODEL_PATH=...`
- See `README.md` for download and hardware guidance.

---

## Quick Notes

Open from the PRISM menu while in Inventory, LSP, or IPAM.

- Create, edit, pin, color, archive, and delete notes
- **To-do lists** with checkboxes
- Data stored locally in `modules/notes/backend/notes.db`
- Requires the Notes API (started automatically with `npm run dev`)

---

## IP Calculator

Network engineering diagnostic tool — runs entirely in the browser (no backend). Supports **IPv4 and IPv6**.

- Enter CIDR (`192.168.1.10/27`, `2001:db8::/48`), bare host addresses, combined IP+mask, or split fields
- **Overview** — network, last address (IPv6) or broadcast (IPv4), block size
- **Hosts / Addresses** — first/last usable, range, position
- **IPv4 tabs** — Binary, Router (Cisco route + wildcard), legacy IP class
- **Classification** — RFC1918/CGNAT (IPv4), ULA/link-local/GUA (IPv6)
- Copy or export JSON/CSV

---

## VLSM Planner

Variable-length subnet planner from the PRISM menu. Supports **IPv4** (host-count VLSM) and **IPv6** (prefix-length subdivision, e.g. `/64` sites from a `/48` base).

1. Enter a **base network** (e.g. `10.0.0.0/24` or `2001:db8::/48`).
2. Add rows for each site — **host counts** for IPv4, or **target prefix** (`64`, `/64`) for IPv6.
3. Review the generated subnet plan.
4. On the **Export** tab, use **Save to IPAM** to import subnets into Mini IPAM under a project name.

Use **Dry run** before saving to preview conflicts without writing to the database.

---

## NetLens

IP validation engine from the PRISM menu — analysis only; it does **not** write to the IPAM registry.

1. Open **NetLens** from the PRISM floating menu.
2. Enter an IP (`192.168.1.10`), CIDR (`192.168.1.0/27`), IPv6 address or prefix (`2001:db8::1`, `2001:db8::/48`), base network, or VLSM-style host list (`hosts: 50, 20, 10`).
3. Review three sections:
   - **Validation** — format, role, assignability
   - **Network analysis** — mask, usable range, block size
   - **Intelligence insights** — IPAM registry lookup, conflict hints, VLSM import dry-run (when IPAM API is running)
4. Optional: click **Submit to Workflow** to create an allocation request with the NetLens result attached.

**Submit to Workflow** sends the analyzed address and validation payload to **Mini IPAM → IP Workflow**. If you are already in Mini IPAM, the app switches to the **IP Workflow** tab automatically. From other modules, open Mini IPAM and select **IP Workflow** to continue.

NetLens never saves to the registry. For immediate registration without approval, use **Mini IPAM → Registry** or **System Control**. For a controlled pipeline, use **IP Workflow**.

```
NetLens (validate)  →  IP Workflow (approve)  →  reserve / activate  →  Registry (persist)
```

---

## Mini IPAM (v1.3)

Full local IP address management at home tile #3 or `/ipam`. Supports **IPv4 and IPv6** registries, inventory equipment cross-check on validate, API keys, and full backup/restore in System Control.

### Tabs

| Tab | Purpose |
| --- | --- |
| **Dashboard** | Per-subnet utilization cards and family-scoped summary KPIs |
| **Registry** | Source-of-truth CRUD; expandable subnet tree with nested hosts |
| **Subnets** | Subnet list with metadata preview; detail panel with free ranges, next-IP suggestion, host allocation |
| **Search** | Query any IP/CIDR or project name — membership, calculated context, conflicts |
| **IP Workflow** | Allocation lifecycle — request queue, approvals, blocked items, active workflows, full change log |
| **Analytics** | Family-scoped project breakdown, utilization table, downloadable report |
| **Audit** | Integrity health score, conflict/warning list, orphan IPs, re-scan, report download |
| **System Control** | API keys, backup/restore, bulk CSV import, VLSM JSON import, JSON/CSV export, activity log |

### Registry

The registry is the **system of record**. Subnets appear as top-level rows; click the chevron to expand and see hosts underneath. Unassigned hosts (not inside any registered subnet) appear in a separate section at the bottom.

| Column | Meaning |
| --- | --- |
| **Address** | IP or CIDR |
| **Type** | Host or subnet |
| **Status** | Free, used, or reserved |
| **Project** | Owning project or service |
| **Location** | Site or region |
| **VLAN** | VLAN ID (optional) |

Use **Validate** on the add/edit form before saving. Overlapping or duplicate entries are blocked.

### Host allocation

On the **Subnets** tab, select a subnet from the list (each tile shows address, status, project, location, and VLAN). The detail panel shows full **subnet details** (status, project, location, VLAN, description), usable range, free blocks, and allocated hosts with the same metadata per host.

- **Next IP** — fills and assigns the next free address in the subnet (including large IPv6 prefixes such as `/48`, when the backend can suggest one)
- **Manual entry** — type any address within the subnet and click **Allocate** (always available as a fallback)

If the address is already registered, the app shows an inline error (for example *“10.0.0.5 is already in use (Router)”*) instead of crashing. The same duplicate protection applies when adding records from **Registry**. If subnet detail fails to load (for example a missing subnet ID), an error banner is shown instead of the empty-state message.

### IP Workflow Manager

The **IP Workflow** tab manages the **lifecycle** of IP and subnet allocations. It does not calculate addresses (NetLens does that) and does not replace the Registry (which remains the system of record).

**When to use it:** teams that want validation, approval, and a traceable path before an address appears in the registry.

#### Lifecycle states

| State | Meaning |
| --- | --- |
| **REQUESTED** | New allocation request submitted |
| **VALIDATED** | NetLens result attached |
| **PENDING_APPROVAL** | Waiting for approver |
| **APPROVED** | Approved; intent recorded — **no registry write yet** |
| **REJECTED** | Reviewer declined — terminal until **Reopen** |
| **RESERVED** | Held in registry as **reserved** (written on **Mark reserved**) |
| **ACTIVE** | In production use (**used** in registry, written on **Activate**) |
| **MODIFIED** | Temporary state while active metadata is edited |
| **DECOMMISSIONED** | Retired; linked registry record removed |

Typical path: `REQUESTED` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `RESERVED` → `ACTIVE`.

#### Dashboard sections

| Section | Contents |
| --- | --- |
| **Requests queue** | Pending allocations (requested, validated, awaiting approval) |
| **Stale requests** | Items awaiting action beyond the configured threshold (banner + dedicated queue) |
| **Active workflows** | Approved, reserved, or active items |
| **Blocked requests** | Invalid NetLens result or IPAM conflicts — approval blocked until fixed or overridden |
| **History log** | Every action: old state, new state, user, timestamp, reason |

#### Creating a request

**Option A — from NetLens**

1. Analyze an IP or CIDR in **NetLens**.
2. Click **Submit to Workflow**.
3. Open or switch to **Mini IPAM → IP Workflow** to review the new request.

**Option B — from IP Workflow tab**

1. Open **Mini IPAM → IP Workflow**.
2. Fill in address, type (host/subnet), project, and location.
3. Click **Create & validate with NetLens** — the request is created and NetLens validation is attached automatically.

#### Approval actions

On a selected workflow:

| Action | When |
| --- | --- |
| **Submit for approval** | After NetLens validation (`VALIDATED` state) |
| **Approve** | Reviewer accepts (blocked if NetLens invalid or conflicting) |
| **Reject** | Moves request to **REJECTED** (terminal) — use **Reopen** to start again |
| **Reopen** | Returns a **REJECTED** request to **REQUESTED** for a fresh review |
| **Apply suggestion** | Uses NetLens alternative subnet and re-starts validation |
| **Override (admin)** | Approve despite conflict — requires a written reason |
| **Mark reserved** | Moves `APPROVED` → `RESERVED` in workflow and registry |
| **Activate** | Moves to `ACTIVE` and sets registry status to **used** |
| **Update project** | On **ACTIVE** workflows — renames project metadata and syncs the linked registry record |
| **Decommission** | Retires allocation and removes registry entry |

**Rules:**

- Cannot **approve** if NetLens is invalid or reports conflicts, unless **Override** was used with a reason.
- Registry is written on **reserve** (`reserved`) and **activate** (`used`) — **not** on approve or on initial request creation.
- **Re-run NetLens** refreshes validation on `REQUESTED` or `VALIDATED` items.

Direct **Registry**, **Subnets**, **CSV import**, and **VLSM import** remain available for bulk or admin work outside the workflow pipeline.

### Integrity and audit

Mini IPAM includes an IP conflict and integrity layer:

- **Pre-save validation** — blocks overlapping or duplicate entries before they are written
- **Post-save scan** — checks the registry after each change
- **Audit tab** — health score (%), conflict list, warnings, orphan IPs, one-click re-scan
- When no issues are found, the audit panel shows **“IP integrity is all good”**
- **Report download** — plain-text integrity report for sharing or archiving
- **VLSM dry run** — simulate a VLSM import without saving (VLSM Planner, NetLens, or System Control)

Data is stored in `modules/ipam/backend/ipam.db` via the IPAM API (port **3003**).

### Running IPAM tests

From the repository root:

```powershell
npm run test:ipam
```

This exercises registry CRUD, search, VLSM import, duplicate-host rejection (HTTP 409), MAC/hostname validation, backup/restore roundtrip, subnet status updates with hosts inside, integrity audit endpoints, IPv6 registry and duplicate-subnet rejection, subnet detail 404 handling, and the **IP Workflow** lifecycle (create → validate → approve → reserve → activate → modify on ACTIVE → decommission, plus override, reject, and reopen). Requires the IPAM API on port **3003** (started automatically with `npm run dev`).

Platform UI smoke tests: `cd platform/frontend && npm test` (form helpers, NetLens IPAM reachable mapping; no API required).

---

## LSP Design

### Purpose

Design RSVP-TE / SR-MPLS / SRv6 style tunnel paths on a physical graph:

- Import NEs and links from CSV
- Compute a minimum-latency primary path under bandwidth and hop limits
- Compute a strict node-disjoint backup path
- Highlight paths on an interactive map, simulate failures, export vendor configuration snippets

### CSV formats

#### `nes.csv`

| Column | Required | Notes |
| --- | --- | --- |
| `ne_id` | Yes | Unique identifier (example: `NYC-NE01`). |
| `loopback_ipv4` | Yes | IPv4 loopback used as tunnel endpoint addressing. |
| `site` | No | Grouping field for compound visualization. |
| `vendor` | No | `nokia`, `huawei`, `cisco_xr`, `juniper` (default `nokia`). |
| `loopback_ipv6` | No | Optional SRv6 locator-style addressing. |
| `node_sid` | No | Integer node SID for SR-MPLS style templates. |
| `role` | No | Role labels for optional role-based path rules (`DRRTR`, `PRTR`, `PERTR`, `PECRT`). |

#### `links.csv`

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

### UI guide

#### Import

Drag and drop `nes.csv` and `links.csv` onto the window, or use the file picker in the left panel.

#### Compute

1. Choose **Source** and **Destination** NEs.
2. Adjust **Required Bandwidth** and **Max Hops** as needed.
3. Select **Mode** (`rsvp_te`, `sr_mpls`, `srv6`).
4. Click **Compute LSP**.

The graph highlights the primary path in cyan and the backup path in orange. Non-path elements dim when a path exists.

#### Path Rules (left panel)

The left panel tab is labeled **Path Rules**. It contains the inputs used by CSPF:

- Required bandwidth
- Max hops
- Enforce role-based path finding (optional)
- Backup Availability Trade-Off (%)

Auto-compute behavior:

- The app recomputes automatically **only** when the **Backup Availability Trade-Off slider** is moved (when enabled).
- Selecting Source/Destination does **not** auto-compute; use **Compute LSP**.

#### Failure simulation

Right-click a node or link and choose **Simulate Failure**. The UI triggers an automatic recomputation (when failures are active) and shows an impact summary against the last “clean” baseline compute.

#### Justification panel

Shows warnings (for example missing backup), the ordered primary NE list, bandwidth-pruned edges, and rejected Yen candidates (for example paths over the hop limit or higher latency alternates).

#### Utilization heatmap

After a successful compute, the simulator records a lightweight reservation entry for heatmap coloring. Toggle **Utilization heatmap** to color links based on reserved capacity versus `bandwidth_mbps`.

#### Export

- **Copy ingress cfg** copies the ingress NE configuration only.
- **Download ZIP** returns one `.cfg` per NE on the primary path, using each NE’s `vendor` field to select the Jinja2 template set.

### Vendor configuration notes

Generated configurations are **illustrative**: they demonstrate the correct CLI families and variable wiring (explicit hops, tunnel names, destinations) but are not a substitute for your internal golden templates, interface naming standards, or feature licensing constraints.

Always review:

- Interface names and numbering
- Tunnel IDs / LSP names for collisions
- RSVP/SR feature enablement on platforms (many defaults are intentionally omitted)

### Configuration Output overlay

Open **View Configuration** to see the exported configuration with three tabs:

- **Path details** — path summary (ordered nodes + totals)
- **Forward path** — ingress-side CLI block
- **Reverse path** — egress-side CLI block

#### User Define Configuration (X/Y/Z)

On the **Forward path** and **Reverse path** tabs you can edit **X**, **Y**, and **Z** values and press **Update configuration**.

- The preview refreshes automatically after a short delay when X/Y/Z are edited.
- Update / preview only refresh the **currently selected** tab block (Forward or Reverse).

### Keyboard shortcuts (LSP)

| Shortcut | Action |
| --- | --- |
| **Ctrl/Cmd + K** | Focus Source NE field |
| **Ctrl/Cmd + Enter** | Compute LSP |
| **Ctrl/Cmd + S** | Save project |

### Project files

Use **Save** / **Open** to work with portable `.lsp.json` project files containing topology, cached layout positions, and saved LSPs.

---

## Hosting on a local network (LAN)

This section is a **step-by-step guide for beginners** who want colleagues on the same office or home Wi‑Fi to open Prism Platform in their browser — for example `http://192.168.1.50:5173` instead of only `http://localhost:5173`.

### Concepts (read this first)

| Term | Meaning |
| --- | --- |
| **Server PC** | The computer that runs `npm run dev` and stores the databases |
| **Client PC** | Any other computer or tablet on the same network that opens the app in a browser |
| **localhost** | Means “this same computer only” — other PCs cannot reach it |
| **LAN IP** | The server’s address on your network, usually `192.168.x.x` or `10.x.x.x` |

By default, Prism binds services to **localhost** for safety. To share on the LAN, you expose the **web UI** on your network. In development mode, the UI server (Vite) proxies API calls on the server machine, so clients only need access to **one port** (5173).

> **Security note:** Default dev mode has **no login**. Anyone on your network who can reach the port can use the app and its data. Use only on trusted networks, or add an API key (see Step 8).

---

### Step 1 — Install prerequisites on the server PC

On the machine that will stay running:

1. Install **Python 3.11+** from [python.org](https://www.python.org/downloads/) (check “Add Python to PATH” on Windows).
2. Install **Node.js 20+** (22.5+ recommended) from [nodejs.org](https://nodejs.org/).
3. Install **Git** (optional) or download the project as a ZIP from GitHub.
4. Open **PowerShell** or **Terminal**.

Verify:

```powershell
python --version
node --version
npm --version
```

---

### Step 2 — Download and install Prism Platform

```powershell
# Example: clone (or unzip your download and cd into the folder)
git clone https://github.com/palesunset/prism1.git
cd prism1

npm run install:all
pip install -r modules/lsp/backend/requirements.txt
```

Wait for all npm and pip installs to finish. The first run may take several minutes.

---

### Step 3 — Find the server PC’s LAN IP address

**Windows:**

```powershell
ipconfig
```

Look for **IPv4 Address** under your active adapter (Wi‑Fi or Ethernet), e.g. `192.168.1.50`.

**macOS / Linux:**

```bash
ip addr
# or
ifconfig
```

Write this down — clients will use it as `http://YOUR_IP:5173`.

---

### Step 4 — Allow the web port through the firewall (Windows)

1. Open **Windows Defender Firewall** → **Advanced settings**.
2. **Inbound Rules** → **New Rule…**
3. Rule type: **Port** → **TCP** → **5173**
4. **Allow the connection** → apply to **Private** (and **Domain** if on a work network).
5. Name it `Prism Platform (5173)`.

On macOS, allow incoming connections for Node when prompted, or configure System Settings → Network → Firewall.

> You only need port **5173** open for the recommended dev-mode setup below. The backend APIs stay on localhost and are reached through Vite’s proxy.

---

### Step 5 — Enable LAN access for the web UI

Edit `platform/frontend/vite.config.ts`. Inside the `server` block, add `host: true`:

```ts
  server: {
    host: true,
    port: 5173,
    proxy: {
      // ... existing proxy entries unchanged
    },
  },
```

This tells Vite to listen on all network interfaces (`0.0.0.0`), not just localhost.

**Alternative (no file edit):** run the UI alone with:

```powershell
cd platform/frontend
npx vite --host
```

For the full platform (all APIs + UI), prefer editing `vite.config.ts` and using `npm run dev` from the repo root.

---

### Step 6 — Start the platform on the server PC

From the repository root:

```powershell
npm run dev
```

You should see several services start (LSP API, Inventory API, Notes API, IPAM API, web). Wait until the terminal shows Vite is ready.

Test on the **server PC** first:

- http://localhost:5173

Then test from the **server PC** using the LAN IP:

- http://192.168.1.50:5173 *(replace with your IP)*

---

### Step 7 — Connect from other computers

On any other device on the **same Wi‑Fi or Ethernet network**:

1. Open Chrome, Edge, or Firefox.
2. Go to `http://SERVER_IP:5173` (e.g. `http://192.168.1.50:5173`).
3. Pick a module on the home screen.

**Troubleshooting:**

| Problem | What to try |
| --- | --- |
| Page does not load | Confirm server PC and client are on the same network; check firewall rule for 5173 |
| Page loads but APIs fail | Ensure `npm run dev` is running on the server; check server terminal for errors |
| “Connection refused” | Server may still be starting — wait 30 seconds and retry |
| Wrong IP | Re-run `ipconfig`; laptops may get a new IP after sleep — use a DHCP reservation for a stable address |

---

### Step 8 — Optional security for Inventory API

When exposing Inventory on a LAN, set an API key so only authorized clients can call the REST API directly.

1. Copy `modules/inventory/backend/.env.example` to `modules/inventory/backend/.env`.
2. Generate a key:

   ```powershell
   cd modules/inventory/backend
   node scripts/generate-api-key.js
   ```

3. Add to `.env`:

   ```env
   HOST=127.0.0.1
   API_KEY=your-generated-key-here
   CORS_ORIGINS=http://localhost:5173,http://192.168.1.50:5173
   ```

   Replace `192.168.1.50` with your server IP.

4. Restart `npm run dev`.

> With dev-mode Vite proxy, browser traffic still goes through port 5173. The API key mainly protects direct API access to port 3001. For stronger isolation, use the production setup in Step 9 with a reverse proxy and VPN.

---

### Step 9 — Production-style LAN hosting (always-on server)

For a machine that runs 24/7 without the Vite dev server, build the UI and use a **reverse proxy** so one URL serves everything.

#### 9a. Build the frontend

```powershell
npm run build:platform
```

#### 9b. Run all backend services

**Terminal 1 — LSP API (serves built UI on port 5000):**

```powershell
cd modules/lsp/backend
$env:PYTHONPATH = "."
$env:LSP_HOST = "0.0.0.0"
python .\run_desktop.py
```

**Terminal 2 — Inventory API:**

```powershell
cd modules/inventory/backend
$env:HOST = "0.0.0.0"
npm start
```

**Terminal 3 — Notes API:**

```powershell
cd modules/notes/backend
$env:HOST = "0.0.0.0"
npm start
```

**Terminal 4 — IPAM API:**

```powershell
cd modules/ipam/backend
$env:HOST = "0.0.0.0"
npm start
```

> **Important:** When the UI is served from port 5000 alone, `/api/inventory`, `/api/notes`, and `/api/ipam` are **not** on the same port. Browsers will fail unless you add a reverse proxy (next step) or stay on **dev mode** (Steps 5–7), which is simpler for most teams.

#### 9c. Reverse proxy (recommended for production LAN)

Install **nginx** or **Caddy** on the server. Example **nginx** config (adjust paths and IP):

```nginx
server {
    listen 8080;
    server_name _;

    # Built platform UI + LSP API
    location /api/lsp/ {
        proxy_pass http://127.0.0.1:5000;
    }
    location /api/inventory/ {
        proxy_pass http://127.0.0.1:3001;
    }
    location /api/notes/ {
        proxy_pass http://127.0.0.1:3002;
    }
    location /api/ipam/ {
        proxy_pass http://127.0.0.1:3003;
    }
    location / {
        proxy_pass http://127.0.0.1:5000;
    }
}
```

Open firewall port **8080**. Clients use `http://SERVER_IP:8080`.

#### 9d. LSP-only sharing (simplest production option)

If you only need **LSP Design** (no Inventory / IPAM / Notes):

```powershell
npm run build:platform
cd modules/lsp/backend
$env:PYTHONPATH = "."
$env:LSP_HOST = "0.0.0.0"
python .\run_desktop.py
```

Open firewall port **5000**. Clients use `http://SERVER_IP:5000/lsp`.

---

### Step 10 — Keep the server running

- Leave the PowerShell window open while others use the app.
- For a permanent setup, consider:
  - A dedicated mini PC or VM on the LAN
  - **Windows Task Scheduler** or a **systemd** service (Linux) to start on boot
  - A **static DHCP reservation** so the server IP never changes

---

### Quick reference — ports

| Service | Port | LAN exposure (dev mode) |
| --- | --- | --- |
| Platform UI (Vite) | 5173 | **Yes** — open this for clients |
| LSP API | 5000 | No — proxied via Vite |
| Inventory API | 3001 | No — proxied via Vite |
| Notes API | 3002 | No — proxied via Vite |
| IPAM API | 3003 | No — proxied via Vite |

---

## Testing the platform

From the repository root, run the full automated suite:

```powershell
npm test
```

| Command | Purpose |
| --- | --- |
| `npm test` | All modules — LSP, inventory, notes, IPAM, platform build |
| `npm run smoke` | Quick live check of LSP + inventory APIs (run `npm run dev` first) |
| `npm run test:ipam` | IPAM only — duplicates, VLSM import, integrity |
| `npm run test:lsp` | LSP backend pytest + frontend lint/Vitest |

If a test fails with “connection refused”, start the dev stack with `npm run dev` and retry API tests that need a running server.

---

## Offline executable (desktop bundle)

The PyInstaller bundle runs a local HTTP server and opens a browser tab. No cloud services are required.

Build steps are in `README.md`. Note that a one-file (`--onefile`) build trades startup time for convenience.

---

## License / copyright

### Copyright

In most jurisdictions, copyright exists automatically when you create the code. What matters for “can others use it freely” is the **license** you ship with the code.

### Current license (MIT)

This repository uses **MIT** (`LICENSE`), which allows use, copy, modify, publish, distribute, sublicense, and/or sell copies as long as the MIT notice is preserved.
