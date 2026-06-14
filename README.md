# Prism Platform

Unified offline-first toolkit for **network equipment inventory**, **LSP design** (CSPF paths, failure simulation, multi-vendor MPLS/SRv6 config generation), and **Mini IPAM** (IP registry, VLSM, conflict detection).

**Repository:** [github.com/palesunset/PrismPlatform](https://github.com/palesunset/PrismPlatform)

## Modules

| Module | Description |
| --- | --- |
| **Equipment Inventory** | Sites, equipment, slots/ports, map, dashboard, CSV import/export, Oz AI assistant |
| **LSP Design** | Topology import, CSPF primary/backup paths, failure simulation, vendor config export |
| **Mini IPAM** | IP registry, search, VLSM import, utilization analytics, integrity audit, **IP Workflow** (approval lifecycle) |
| **Quick Notes** | Draggable floating notes window from the PRISM menu |
| **IP Calculator** | Network engineering IP/subnet diagnostic tool from the PRISM menu |
| **VLSM Planner** | Variable-length subnet planning with dry-run and **Save to IPAM** |
| **NetLens** | Floating IP validation engine — parse IP/CIDR/VLSM, cross-check IPAM, dry-run imports (read-only); **Submit to Workflow** |
| **Traffic Simulation** | Available inside LSP workspace (failure scenarios, relief advisor) |

## Quick start — unified platform (recommended)

**Requirements:** Python 3.11+, Node 20+ (inventory API needs Node **22.5+** for built-in SQLite)

```powershell
# From repository root
npm run install:all
pip install -r backend/requirements.txt
npm run dev
```

Open **http://localhost:5173** — pick a module on the home screen. Use the floating PRISM menu for modules, **Notes**, **IP Calculator**, **VLSM Planner**, and **NetLens** while you work.

| Service | URL (dev) |
| --- | --- |
| Platform UI | http://localhost:5173 |
| LSP API | http://localhost:5000 (`/api/lsp/*`) |
| Inventory API | http://localhost:3001 (`/api/inventory/*`) |
| Notes API | http://localhost:3002 (`/api/notes/*`) |
| IPAM API | http://localhost:3003 (`/api/ipam/*`) |

If ports are stuck from a previous session, run `npm run dev:kill` before `npm run dev`.

## Hosting on a local network (LAN)

Share Prism Platform with colleagues on the same Wi‑Fi or office LAN (e.g. `http://192.168.1.50:5173`).

**Recommended for beginners:** keep using `npm run dev`, add `host: true` to `platform/frontend/vite.config.ts`, open firewall port **5173**, and give clients the server PC’s LAN IP.

Full step-by-step instructions (firewall, IP lookup, security, production reverse proxy) are in **`USER_MANUAL.md` → [Hosting on a local network (LAN)](USER_MANUAL.md#hosting-on-a-local-network-lan)**.

| Approach | Best for | Client URL |
| --- | --- | --- |
| **Dev mode + Vite `--host`** | Teams testing on a trusted LAN; all modules | `http://SERVER_IP:5173` |
| **LSP-only desktop** | Path design only, no Inventory/IPAM | `http://SERVER_IP:5000/lsp` |
| **nginx / Caddy reverse proxy** | Always-on server, single port | `http://SERVER_IP:8080` |

## Quick Notes

Notes open as a **draggable floating window** from the PRISM menu while you are in Inventory or LSP — drag it anywhere and keep working behind it.

- Create, edit, pin, color, archive, and delete notes
- **To-do lists** with checkboxes — add tasks, mark complete, track progress
- Data stored locally in `notes/backend/notes.db` via `/api/notes`
- Requires the Notes API (started automatically with `npm run dev`)

## IP Calculator

Network engineering **decision-support tool** — draggable floating window from the PRISM menu for ISP, enterprise, and telecom work.

- **Input** — CIDR (`192.168.1.10/27`), combined IP+mask, or split IP + mask/CIDR fields
- **Smart validation** — detects host, network, or broadcast input; explains context and suggests assignable IPs (never just “not assignable”)
- **Overview** — network, broadcast, mask, block size, totals
- **Hosts** — first/last usable, range, position in subnet
- **Binary** — IP and mask with network vs host bits highlighted
- **Router view** — Cisco `ip route` and wildcard mask
- **Classification** — RFC1918, public, loopback, link-local, CGNAT with descriptions
- One-line engineering summary, copy/export JSON or CSV
- Runs entirely in the browser (no backend)

## Mini IPAM

Full **local IP address management** module — home tile #3 or `/ipam`. Data stored in `ipam/backend/ipam.db` via the IPAM API (port **3003**, started with `npm run dev`).

| Phase | Scope |
| --- | --- |
| **1 — Basic IP database** | Subnet/host registry, instant search, IPv4 validation, pre-save validate |
| **2 — VLSM & conflicts** | VLSM JSON import (from VLSM Planner), overlap/duplicate detection, subnet tracking, free-space finder, next-IP suggestion |
| **3 — Analytics & reporting** | Utilization dashboard, project breakdown, high-util alerts, downloadable utilization report |
| **4 — Enterprise foundation** | Audit log, bulk CSV import, JSON export with analytics |
| **5 — IP Workflow Manager** | Allocation lifecycle (request → validate → approve → registry), NetLens attachment, change log |

NetLens validates; **IP Workflow** controls approvals and state; the **Registry** is the system of record (written only when a workflow is approved, reserved, or activated).

### Integrity and audit

- **Pre-save validation** and **post-save integrity scan** on every change
- **Audit tab** — health score, conflicts, warnings, orphan IPs, re-scan, downloadable report; shows **“IP integrity is all good”** when clean
- **VLSM dry run** — simulate imports before writing (VLSM Planner, NetLens, or IPAM System Control)
- **Duplicate prevention** — allocating or registering an IP that already exists is blocked with a clear error (client + server)

### UI tabs

| Tab | Purpose |
| --- | --- |
| **Dashboard** | Per-subnet utilization cards + summary KPIs |
| **Registry** | Source-of-truth CRUD; expandable subnet rows with nested hosts (Address, Type, Status, Project, Location, VLAN) |
| **Subnets** | Subnet list with metadata preview; detail panel with project/location/VLAN, free ranges, host allocation |
| **Search** | Query any IP/CIDR/project — membership, calculated context, conflict hints |
| **IP Workflow** | Allocation pipeline — requests queue, approvals, blocked items, lifecycle history (NetLens → approve → registry) |
| **Analytics** | Project breakdown, utilization table, report download |
| **Audit** | Integrity health score, conflict/warning list, orphan IPs, report download |
| **System Control** | Bulk CSV import, VLSM JSON import, JSON/CSV export, activity log |

### VLSM integration

The **VLSM Planner** (PRISM menu) includes **Save to IPAM** on its Export tab. Use **Dry run** first; subnets import as `reserved` records under a project name and IPAM refreshes automatically. You can also import VLSM JSON from **System Control**.

For controlled allocations (approval trail, conflict gates), use **IP Workflow** instead of writing directly to the Registry.

### IP Workflow Manager

State machine for IP/subnet allocations — does **not** calculate addresses (NetLens) and does **not** replace the Registry; it manages **state transitions**, **approvals**, and **audit**.

**Lifecycle:** `REQUESTED` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `RESERVED` → `ACTIVE` (also `MODIFIED`, `DECOMMISSIONED`)

| Area | What you see |
| --- | --- |
| **Requests queue** | New and in-review allocations |
| **Active workflows** | Approved, reserved, or active items |
| **Blocked requests** | Invalid NetLens result or conflicts (needs fix or admin override) |
| **History log** | Every transition with actor, reason, and timestamp |

**Actions:** submit for approval, approve, reject, apply NetLens suggestion, override (with reason), reserve, activate, decommission.

**Registry writes** happen only when a workflow is **approved** (creates `reserved`), **reserved**, or **activated** (updates to `used`). Decommission removes the linked registry record.

Create requests on the **IP Workflow** tab (auto-runs NetLens) or from **NetLens → Submit to Workflow** (opens the IP Workflow tab when you are already in Mini IPAM).

## NetLens

Stateless **IP validation engine** — draggable floating panel from the PRISM menu. NetLens does **not** store records; it validates input and optionally reads IPAM for cross-checks.

- **Input** — single IP, CIDR, or VLSM-style host list (`hosts: 50, 20, 10`)
- **Validation** — format, role (host/network/broadcast), RFC1918 classification
- **Network analysis** — mask, usable range, block size, position in subnet
- **Intelligence insights** — IPAM lookup, conflict hints, VLSM import dry-run against live registry
- **Submit to Workflow** — after analysis, send the address and NetLens result to **Mini IPAM → IP Workflow** (validation only; no registry write from NetLens)
- Runs analysis in the browser; IPAM checks use read-only API calls when the IPAM service is running

**Integration flow:** NetLens (validate) → IP Workflow (approve) → Registry (persist)

## Inventory — Oz AI (Llama model)

The **Oz** assistant in Inventory runs a **local Llama** GGUF model via `node-llama-cpp` (offline, no cloud API). Inventory works without it, but Oz chat stays disabled until the model file is present.

| Item | Detail |
| --- | --- |
| Default model | `inventory/backend/models/llama-3.2-3b-instruct-q4_k_m.gguf` (~2 GB) |
| Custom model | Set `OZ_MODEL_PATH` in `inventory/backend/.env` |
| Node | **22.5+** required (same as the inventory API) |

### Choose a model for your machine

Pick any **GGUF instruct** model your PC can run, download it, then point Oz at the file with `OZ_MODEL_PATH` in `inventory/backend/.env`:

```env
# Relative to inventory/backend/
OZ_MODEL_PATH=models/llama-3.2-1b-instruct-q4_k_m.gguf

# Or an absolute path anywhere on disk
OZ_MODEL_PATH=D:/AI/llama-3.2-3b-instruct-q8_0.gguf
```

| Machine | Suggested starting point |
| --- | --- |
| Low RAM / older CPU | **1B** class, Q4 quant (~1 GB) |
| Typical laptop | **3B** Q4_K_M (default, ~2 GB) |
| Workstation / GPU | **3B+** Q8 or larger quant |

Copy `inventory/backend/.env.example` to `.env`, set `OZ_MODEL_PATH`, place your `.gguf` file at that path, and restart the inventory API.

When `OZ_MODEL_PATH` is set, the automatic default download is skipped — you supply your own file.

### Automatic download (default model only)

From the repo root after `npm run install:all`, or from `inventory/backend` (only when `OZ_MODEL_PATH` is **not** set):

```powershell
cd inventory/backend
npm install
```

The `postinstall` script downloads the default 3B model once from Hugging Face. Expect a few minutes on first install.

### Manual download (default model)

If the automatic download fails (rate limit, offline prep, or CI):

```powershell
cd inventory/backend
npm run download-model
```

Skip the download when you do not need Oz yet:

```powershell
$env:SKIP_OZ_MODEL_DOWNLOAD = "1"
npm install
```

### Verify Oz is ready

1. Start the platform: `npm run dev` (or inventory-only: `cd inventory && npm run dev`).
2. Open **Inventory** → use the **Oz** floating chat button.
3. On backend startup you should see `Oz: loading model from ...` with your configured path.

If chat says the model is missing, confirm the `.gguf` file exists at `OZ_MODEL_PATH` (or the default path) and restart the inventory API on port **3001**.

## Quick start — LSP only

```powershell
cd backend
python -m pip install -r requirements.txt
$env:PYTHONPATH = "."
python -m uvicorn app.main:app --host 127.0.0.1 --port 5000

cd ..\frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/lsp` to `http://127.0.0.1:5000`.

## Quick start — Inventory only

```powershell
cd inventory
npm install
cd backend && npm install
cd ../frontend && npm install
npm run dev
```

Inventory UI: **http://localhost:5173** (standalone) · API: **http://localhost:3001**

### Oz AI — Llama model (optional)

Oz uses a local **GGUF** model (default: Llama 3.2 3B ~2 GB). Configure a different file in `backend/.env`:

```env
OZ_MODEL_PATH=models/your-model.gguf
```

See **Inventory — Oz AI (Llama model)** above for download steps and hardware guidance.

## LSP features

- Bulk import of `nes.csv` and `links.csv` (drag-and-drop in the UI or file picker).
- UI state persistence (mode/path rules/Nokia CLI style) via localStorage.
- Save/Open a portable project file (`.lsp.json`) containing topology, cached layout positions, and saved LSPs.
- FastAPI backend with NetworkX CSPF (parallel links supported via an expanded graph model).
- React + Vite + TypeScript UI with Cytoscape.js and the `cose-bilkent` compound layout for site grouping.
- Vendor templates (Jinja2) for Nokia SR OS, Huawei VRP, Cisco IOS XR, and Juniper Junos across RSVP-TE, SR-MPLS, and SRv6 modes.
- PyInstaller packaging entry point (`backend/run_desktop.py`) for desktop distribution after building the platform frontend.

## Production-like local run (API serves the built UI)

```powershell
npm run build:platform
cd backend
$env:PYTHONPATH = "."
python .\run_desktop.py
```

FastAPI serves `platform/frontend/dist` when present (falls back to `frontend/dist`). Inventory API must run separately on port 3001 for inventory features.

## Legacy quick start (LSP backend + LSP frontend only)

### 1) Backend (Python 3.11+)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:PYTHONPATH = "."
python -m uvicorn app.main:app --host 127.0.0.1 --port 5000
```

### 2) Frontend (Node 20+)

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/lsp` to `http://127.0.0.1:5000`.

### 3) Production-like local run (LSP-only UI)

```powershell
cd frontend
npm run build
cd ..\backend
$env:PYTHONPATH = "."
python .\run_desktop.py
```

This starts FastAPI on `http://127.0.0.1:5000` and opens your browser. The backend automatically serves `frontend/dist` when present.

## Keyboard shortcuts

- **Ctrl/Cmd + K**: focus Source NE field
- **Ctrl/Cmd + Enter**: compute LSP
- **Ctrl/Cmd + S**: save project

## Configuration Output (forward / reverse)

- Click **View Configuration** to open the exported configuration overlay.
- Tabs:
  - **Path details**: path summary (nodes + totals).
  - **Forward path** and **Reverse path**: vendor CLI blocks.
- **User Define Configuration** (X/Y/Z):
  - Visible on **Forward path** and **Reverse path** tabs.
  - Editing X/Y/Z updates the preview after a short delay.
  - **Update configuration** updates only the currently selected tab block (forward or reverse).

## Packaging (PyInstaller)

Build the frontend first, then run PyInstaller from the repository root. The spec builds a **single `prism.exe`** (one-file) that unpacks to a temp directory at runtime; templates and `frontend_dist` are included as data files (see `app/main.py` frozen-path handling).

```powershell
npm run build:platform
# or LSP-only: cd frontend && npm run build
cd ..
pyinstaller .\build_scripts\pyinstaller.spec
```

The executable is written to `dist/prism.exe` (Windows). First launch may be a few seconds slower than an onedir build while the bundle extracts.

### Icons & macOS notarization

- **Icons:** Replace the default PyInstaller icon by passing `icon='assets/app.ico'` (Windows) in `EXE(...)` and ship `.icns` separately for macOS bundling if you add an `.app` target later.
- **Notarization:** Apple notarization/stapling is outside this repo; use your Developer ID certificate and `notarytool` in your release pipeline to avoid Gatekeeper warnings.

## Tests

From repository root:

```powershell
npm test          # LSP, inventory, notes, IPAM, platform build
npm run smoke     # live API smoke tests (start APIs first: npm run dev)
```

| Suite | Command | What it covers |
| --- | --- | --- |
| **All** | `npm test` | LSP pytest + lint + Vitest, inventory, notes, IPAM, platform build |
| **LSP backend** | `cd backend && python -m pytest` | CSPF, role validation, import, API |
| **LSP frontend** | `cd frontend && npm run lint && npm run test` | NE picker, project file validation |
| **Inventory** | `cd inventory/backend && node scripts/test-all.js` | Schema, Oz, HTTP API |
| **Notes** | `cd notes/backend && npm run test` | Notes CRUD API |
| **IPAM** | `cd ipam/backend && npm run test` | Registry, search, VLSM import, duplicate host (409), integrity |
| **Platform UI** | `cd platform/frontend && npm run build` | Production build of unified shell |
| **Smoke** | `npm run smoke` | Live LSP + inventory endpoints (requires `npm run dev`) |

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/lsp/import` | Multipart upload of `nes_file` + `links_file`. |
| `GET` | `/api/lsp/topology` | Cytoscape elements JSON for the active topology. |
| `POST` | `/api/lsp/compute` | CSPF primary + strict node-disjoint backup. |
| `POST` | `/api/lsp/export` | ZIP bundle of per-NE `.cfg` files. |
| `POST` | `/api/lsp/export/clipboard` | Ingress-only plaintext configuration. |
| `POST` | `/api/lsp/export/monolithic` | Legacy monolithic plaintext (Path details + Forward + Reverse). |
| `POST` | `/api/lsp/export/monolithic/section?section=forward\|reverse` | Render one monolithic block for partial refresh. |
| `GET` | `/api/lsp/health` | Health probe. |

Inventory API routes are under `/api/inventory/*` (see `inventory/README.md`).

## Documentation

| Document | Contents |
| --- | --- |
| **`USER_MANUAL.md`** | Platform overview, all modules, LSP CSV schemas, UI walkthrough, vendor notes, **LAN hosting guide** |
| **`inventory/README.md`** | Inventory API routes and standalone run instructions |

## Credits

**Developers**

Ruel Saria  
John Carlo Emberga
