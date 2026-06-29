# PRISM Platform

**PRISM** (Platform for Routing, Inventory, IPAM & Simulation) is a network engineering toolkit: **LSP design**, **equipment inventory**, **Mini IPAM**, and floating tools — hosted on **Vercel** with **Supabase**.

**Production hosting:** see **[docs/VERCEL.md](docs/VERCEL.md)** (Vercel + Supabase — no local servers required).

**Repository:** [github.com/palesunset/prism1](https://github.com/palesunset/prism1)

---

## What you get

| Area | Features |
| --- | --- |
| **LSP Design** | CSV topology import, CSPF primary/backup paths, role-based routing rules, failure simulation, utilization heatmap, multi-vendor config export (Nokia, Huawei, Cisco IOS XR, Juniper), project save/load |
| **Equipment Inventory** | Sites, equipment, slots/ports, dashboard analytics, geographic map, CSV import/export, duplicate-IP protection, integrity checks |
| **Mini IPAM (v1.3)** | IPv4/IPv6 registry, subnet detail & host allocation, search, VLSM import, utilization analytics, integrity audit, backup/restore, API keys, **IP Workflow** (approval lifecycle) |
| **Floating tools** (purple **PRISM** menu) | Quick Notes, IP Calculator (browser-only), VLSM Planner (Save to IPAM), NetLens (validate + Submit to Workflow) |

### How the pieces fit together

```
┌─────────────────────────────────────────────────────────────┐
│  Platform UI  (http://localhost:5173)                       │
│  Home · LSP · Inventory · IPAM · floating PRISM tools       │
└───────────────┬─────────────────────────────────────────────┘
                │  /api/* proxied in dev mode
    ┌───────────┼───────────┬───────────┬───────────┐
    ▼           ▼           ▼           ▼           ▼
 LSP :5000  Inventory  Notes :3002  IPAM :3003
            :3001
```

| Service | Port | Data store |
| --- | --- | --- |
| Platform UI (Vite) | **5173** | — |
| LSP API (FastAPI) | **5000** | In-memory topology + `.lsp.json` projects |
| Inventory API | **3001** | `modules/inventory/backend/inventory.db` |
| Notes API | **3002** | `modules/notes/backend/notes.db` |
| IPAM API | **3003** | `modules/ipam/backend/ipam.db` |

---

## Repository layout

```
prism1/
├── platform/frontend/       # Unified shell (home, routing, IPAM UI, floating tools)
├── modules/
│   ├── lsp/                 # LSP API + embedded UI (@lsp)
│   ├── inventory/           # Inventory API + embedded UI (@inventory)
│   ├── ipam/backend/        # IPAM API (UI lives in platform/frontend)
│   └── notes/backend/       # Notes API (UI in platform)
├── scripts/                 # Dev helpers (run-lsp-api, kill-dev-ports, smoke-test)
├── packaging/               # PyInstaller spec
├── docs/                    # GUIDE.md, USER_MANUAL.md, PROJECT_STRUCTURE.md
└── package.json             # npm run dev — starts all services
```

See **`docs/PROJECT_STRUCTURE.md`** for module wiring details.

---

## Requirements

Install these **before** you start:

| Component | Version | Why |
| --- | --- | --- |
| **Python** | 3.11+ | LSP API (CSPF, config generation) |
| **Node.js** | 20+ (**22.5+ recommended**) | All JavaScript APIs; Inventory & IPAM need **built-in SQLite** (Node 22.5+) |
| **npm** | Comes with Node | Dependency install |
| **Git** | Optional | Clone the repo |

**Verify** (PowerShell or Terminal):

```powershell
python --version    # expect 3.11+
node --version      # expect v20+ (v22.5+ for Inventory/IPAM SQLite)
npm --version
```

---

## Run locally (step-by-step)

> **New laptop or hit the PowerShell npm error?** Use **`docs/GUIDE.md`** for a full Windows walkthrough (cmd vs PowerShell, ZIP download, troubleshooting).

Follow these steps **in order** from the repository root.

### Step 1 — Get the code

```powershell
git clone https://github.com/palesunset/prism1.git
cd prism1
```

*(Or unzip a release archive and `cd` into the folder.)*

### Step 2 — Install dependencies

```powershell
npm run install:all
pip install -r modules/lsp/backend/requirements.txt
```

This installs Node packages for the platform shell, LSP, Inventory, Notes, and IPAM. The first run can take several minutes.

### Step 3 — Start everything

```powershell
npm run dev
```

Wait until the terminal shows **all five** processes running:

| Label in terminal | Service |
| --- | --- |
| `lsp-api` | LSP API on port 5000 |
| `inv-api` | Inventory API on port 3001 |
| `notes-api` | Notes API on port 3002 |
| `ipam-api` | IPAM API on port 3003 |
| `web` | Platform UI on port 5173 |

### Step 4 — Open the app

In your browser on the **same PC**:

**http://localhost:5173**

You should see the PRISM home screen with three tiles: **LSP Design**, **Inventory**, **Mini IPAM**.

### Step 5 — Confirm it works

1. Press **1** on the keyboard → opens **LSP Design**.
2. Click the purple **PRISM** floating button (bottom area) → module switcher expands.
3. Choose **Home** → back to the start screen.

If any step fails, see **Troubleshooting** below.

### Stuck ports from a previous session

```powershell
npm run dev:kill
npm run dev
```

### Troubleshooting (local)

| Problem | Fix |
| --- | --- |
| `EADDRINUSE` / port already in use | Run `npm run dev:kill`, then `npm run dev` |
| Page blank or “Cannot connect” | Wait 30s for all APIs; check terminal for red errors |
| Inventory/IPAM DB errors | Upgrade Node to **22.5+** |
| LSP import fails | Confirm Python deps: `pip install -r modules/lsp/backend/requirements.txt` |
| APIs fail in browser but terminal looks OK | Hard-refresh the browser (Ctrl+F5) |

---

## Run on a local network (LAN)

Share PRISM with colleagues on the same Wi‑Fi or office LAN (e.g. `http://192.168.1.50:5173`).

### Concepts

| Term | Meaning |
| --- | --- |
| **Server PC** | The machine that runs `npm run dev` and holds the databases |
| **Client PC** | Any other device on the same network that opens a browser |
| **localhost** | Only reachable on the server PC itself — other PCs cannot use it |
| **LAN IP** | Server address on your network, usually `192.168.x.x` or `10.x.x.x` |

> **Security:** Dev mode has **no login**. Anyone who can reach port 5173 can use the app. Use only on **trusted** networks, or add API keys (see Step 7).

### Step 1 — Install on the server PC

Same as local setup: **Requirements** → `npm run install:all` → `pip install -r modules/lsp/backend/requirements.txt`.

### Step 2 — Find the server’s LAN IP

**Windows:**

```powershell
ipconfig
```

Look for **IPv4 Address** under your active Wi‑Fi or Ethernet adapter (e.g. `192.168.1.50`).

**macOS / Linux:** `ip addr` or `ifconfig`.

Write this down — clients will use `http://YOUR_IP:5173`.

### Step 3 — Open the firewall (Windows example)

1. **Windows Defender Firewall** → **Advanced settings** → **Inbound Rules** → **New Rule**
2. Type: **Port** → **TCP** → **5173**
3. **Allow the connection** → apply to **Private** network
4. Name: `PRISM Platform (5173)`

You only need port **5173** for the recommended dev setup. Backend APIs stay on localhost and are reached through Vite’s proxy on the server.

### Step 4 — Enable LAN access for the web UI

Edit `platform/frontend/vite.config.ts`. Inside the `server` block, add **`host: true`**:

```ts
  server: {
    host: true,
    port: 5173,
    proxy: {
      // ... keep existing proxy entries unchanged
    },
  },
```

This makes Vite listen on all interfaces (`0.0.0.0`), not just localhost.

**Alternative (no file edit):** start only the UI with `cd platform/frontend` then `npx vite --host` — but you still need all APIs running separately. Prefer editing `vite.config.ts` and using `npm run dev` from the repo root.

### Step 5 — Start the platform on the server

```powershell
npm run dev
```

Test on the **server PC**:

- http://localhost:5173
- http://192.168.1.50:5173 *(replace with your IP)*

Both must work before testing other PCs.

### Step 6 — Connect from other devices

On any PC/tablet on the **same network**:

1. Open Chrome, Edge, or Firefox.
2. Go to **`http://SERVER_IP:5173`** (e.g. `http://192.168.1.50:5173`).
3. Use the home tiles or PRISM menu as usual.

### Step 7 — Optional: lock down Inventory API

For LAN deployments, set an API key on the Inventory backend:

1. Copy `modules/inventory/backend/.env.example` → `modules/inventory/backend/.env`
2. Generate a key: `cd modules/inventory/backend` → `node scripts/generate-api-key.js`
3. Add to `.env`:

   ```env
   HOST=127.0.0.1
   API_KEY=your-generated-key-here
   CORS_ORIGINS=http://localhost:5173,http://192.168.1.50:5173
   ```

4. Restart `npm run dev`.

Browser traffic still goes through port 5173 in dev mode. See **`docs/USER_MANUAL.md`** for production reverse-proxy setup (nginx/Caddy, always-on server).

### LAN troubleshooting

| Problem | What to try |
| --- | --- |
| Page does not load from another PC | Same Wi‑Fi/VLAN? Firewall rule for 5173? Correct IP? |
| Page loads but modules error | `npm run dev` still running on server? Check server terminal |
| Connection refused | Wait 30s after start; retry |
| IP changed after sleep | Re-run `ipconfig`; consider a DHCP reservation |

---

## Using the platform

### Home screen

Three main modules (keyboard shortcuts on home only):

| Key | Module | Route |
| --- | --- | --- |
| **1** | LSP Design | `/lsp` |
| **2** | Equipment Inventory | `/inventory` |
| **3** | Mini IPAM | `/ipam` |

Click a tile or press the number key.

### PRISM floating menu (purple)

After you leave the home screen, a **purple PRISM button** appears. Click it to expand the module switcher.

- **Navigate:** Home, Inventory, LSP Design, Mini IPAM
- **Tools:** Quick Notes, IP Calculator, VLSM Planner, NetLens

**Tips:**

- Drag the menu by its grip handle — position is saved between sessions.
- Double-click the collapsed button to expand quickly.
- Tool panels are draggable floating windows; they stay open while you work in any module.

---

## Module guide — LSP Design

**Open:** Home tile **1** or PRISM menu → **LSP Design**.

**Purpose:** Design RSVP-TE / SR-MPLS / SRv6 tunnel paths on a network graph.

### First-time workflow

1. **Prepare CSV files** — `nes.csv` (network elements) and `links.csv` (links). Sample files: `modules/lsp/sample_data/`.
2. **Import topology** — drag both CSVs onto the window, or use the file picker in the left panel.
3. **Set path rules** (left panel → **Path Rules** tab):
   - Required bandwidth, max hops
   - Mode: `rsvp_te`, `sr_mpls`, or `srv6`
   - Optional: enforce role-based path finding
4. **Choose Source and Destination** NEs in the top bar.
5. Click **Compute LSP** (or **Ctrl/Cmd + Enter**).
   - Primary path = **cyan**, backup = **orange**.
6. **Simulate failures** — right-click a node or link → **Simulate Failure** (auto-recompute when failures are active).
7. **Export config** — **View Configuration** for forward/reverse CLI; **Download ZIP** for per-NE `.cfg` files.

### Save your work

- **Ctrl/Cmd + S** — save a portable `.lsp.json` project (topology, layout, saved LSPs).
- **Open** — reload a project file later.

### Keyboard shortcuts (LSP)

| Shortcut | Action |
| --- | --- |
| **Ctrl/Cmd + K** | Focus Source NE field |
| **Ctrl/Cmd + Enter** | Compute LSP |
| **Ctrl/Cmd + S** | Save project |

CSV column reference and vendor notes: **`docs/USER_MANUAL.md` → LSP Design**.

---

## Module guide — Equipment Inventory

**Open:** Home tile **2** or PRISM menu → **Equipment Inventory**.

**Purpose:** Manage sites, chassis, slots, ports, and utilization across your network.

### First-time workflow

1. **Sites** — create sites manually or **Import CSV** (template in `modules/inventory/frontend/public/sample-data/site_import_template.csv`).
2. **Equipment** — add devices per site, or import `equipment_import_template.csv` / `combined_import_template.csv`.
3. **Dashboard** — KPIs, utilization charts, EOL timeline, vendor breakdown.
4. **Map** — geographic view of sites (set coordinates on sites for pins).
5. **Equipment detail** — slots, ports, status; edit port assignments in the port grid.
6. **Export** — dashboard and list exports; failed exports show a toast with the error.

### Data integrity

- Duplicate IP addresses are **blocked** on save (HTTP 409).
- IP addresses are normalized (canonical form) for lookup and import.
- **Integrity scan:** `GET /api/inventory/integrity` (API) for duplicate-IP reports.

### Oz AI assistant (optional)

- Floating **Oz** button (bottom-right, coral/red) — natural-language queries over your inventory.
- Requires a local **GGUF** Llama model (~2 GB default). See **Oz AI setup** below.
- Inventory works **without** Oz; chat stays disabled until the model is present.

Standalone Inventory dev: `npm run dev:inventory-only` from repo root.

---

## Module guide — Mini IPAM

**Open:** Home tile **3** or PRISM menu → **Mini IPAM**.

**Purpose:** Local IPv4/IPv6 address management — registry, search, analytics, audit, and optional approval workflow.

### Quick start (direct registry)

1. Open **Registry** tab.
2. Click **Add record** — enter a subnet (`10.0.0.0/24`) or host.
3. Click **Validate** on the form before saving.
4. Expand subnet rows (chevron) to see nested hosts.

### Allocate a host from a subnet

1. Open **Subnets** tab.
2. Select a subnet from the list.
3. In the detail panel:
   - **Next IP** — suggests the next free address (works for many IPv6 prefixes; very large spaces may show **Util N/A** on the dashboard — that is expected).
   - **Manual entry** — type an address → **Allocate**.
4. Duplicates show an inline error instead of silent failure.

### Search and audit

- **Search** — query any IP, CIDR, or project name.
- **Audit** — integrity health score, conflicts, orphan IPs, downloadable report.
- **Analytics** — utilization by project; toggle **IPv4 / IPv6** family where shown.

### IP Workflow (controlled allocations)

Use when you need validation, approval, and an audit trail **before** the registry is updated.

```
NetLens (validate)  →  IP Workflow (approve)  →  reserve / activate  →  Registry
```

**Create a request:**

- **Option A:** NetLens → analyze IP/CIDR → **Submit to Workflow** → open **IP Workflow** tab in IPAM.
- **Option B:** IPAM → **IP Workflow** → fill address, project, location → **Create & validate with NetLens**.

**Typical lifecycle:** `REQUESTED` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `RESERVED` → `ACTIVE`.

**Important:** Registry writes happen on **Mark reserved** and **Activate** — not on approve alone.

### System Control

Backup/restore, API keys, bulk CSV import, VLSM JSON import (with dry-run), exports, activity log.

Full tab reference: **`modules/ipam/README.md`** and **`docs/USER_MANUAL.md` → Mini IPAM**.

---

## Module guide — Floating tools

Open from the **PRISM menu** (available in LSP, Inventory, and IPAM).

### Quick Notes

1. PRISM menu → **Notes**.
2. Create notes or **to-do lists** (checkboxes).
3. Pin, color, archive, or delete items.
4. Data stored in `modules/notes/backend/notes.db` (Notes API required — started with `npm run dev`).

### IP Calculator

1. PRISM menu → **IP Calculator**.
2. Enter CIDR (`192.168.1.10/27`, `2001:db8::/48`), bare IP, or IP + mask.
3. Browse tabs: Overview, Hosts/Addresses, Classification; IPv4 adds Binary, Router, Class.
4. Copy summary or export JSON/CSV.
5. Runs **entirely in the browser** — no backend needed.

### VLSM Planner

1. PRISM menu → **VLSM Planner**.
2. Enter **base network** (e.g. `10.0.0.0/24` or `2001:db8::/48`).
3. Add rows per site:
   - **IPv4:** host counts (`50`, `20`, `10`).
   - **IPv6:** target prefix (`64` or `/64` per site from a `/48` base).
4. Review the generated plan.
5. **Export** tab → **Dry run** first, then **Save to IPAM** (imports as `reserved` under a project name).

For approval-gated allocations, use **IP Workflow** instead of direct registry writes.

### NetLens

1. PRISM menu → **NetLens**.
2. Enter IP, CIDR, IPv6 prefix, or VLSM-style list (`hosts: 50, 20, 10`).
3. Review **Validation**, **Network analysis**, and **Intelligence insights** (IPAM cross-check when IPAM API is running).
4. Optional: **Submit to Workflow** → continues in Mini IPAM → **IP Workflow** tab.

NetLens **never writes** to the registry — it validates only.

---

## Oz AI setup (Inventory, optional)

| Item | Detail |
| --- | --- |
| Default model | `modules/inventory/backend/models/llama-3.2-3b-instruct-q4_k_m.gguf` (~2 GB) |
| Custom model | Set `OZ_MODEL_PATH` in `modules/inventory/backend/.env` |
| Node | **22.5+** required |

**Automatic download** (when `OZ_MODEL_PATH` is not set):

```powershell
cd modules/inventory/backend
npm install
```

**Skip download:**

```powershell
$env:SKIP_OZ_MODEL_DOWNLOAD = "1"
npm install
```

**Manual download:**

```powershell
cd modules/inventory/backend
npm run download-model
```

**Verify:** Start `npm run dev` → Inventory → Oz button → backend log should show `Oz: loading model from ...`.

| Machine | Suggested model |
| --- | --- |
| Low RAM / older CPU | 1B class, Q4 (~1 GB) |
| Typical laptop | 3B Q4_K_M (default) |
| Workstation / GPU | 3B+ Q8 or larger |

---

## Alternative run modes

| Mode | Command | Use when |
| --- | --- | --- |
| **Full platform** (recommended) | `npm run dev` | Everything in one UI |
| **LSP only** | `npm run dev:lsp-only` | Path design without Inventory/IPAM |
| **Inventory only** | `npm run dev:inventory-only` | Inventory API + standalone Vite UI |
| **Production-like (LSP serves built UI)** | `npm run build:platform` then `cd modules/lsp/backend` → `python run_desktop.py` | Single-process demo; Inventory/IPAM APIs must run separately for those modules |

---

## Tests

From repository root:

```powershell
npm test          # LSP, inventory, notes, IPAM, platform build + vitest
npm run smoke     # Live API smoke tests — run npm run dev first in another terminal
```

| Suite | Command |
| --- | --- |
| All | `npm test` |
| LSP backend | `cd modules/lsp/backend && python -m pytest` |
| Inventory | `cd modules/inventory/backend && node scripts/test-all.js` |
| IPAM | `cd modules/ipam/backend && npm test` |
| Platform UI | `cd platform/frontend && npm run build && npm test` |

---

## Before going online (checklist)

Complete this **on your PC** before deploying to Vercel. Local mode uses **SQLite** for Inventory, IPAM, and Notes; **LSP** optionally persists topology to Supabase when `DATABASE_URL` is set.

### 1 — Install and run locally

```powershell
npm run install:all
pip install -r modules/lsp/backend/requirements.txt
npm run dev
```

Open **http://localhost:5173** and verify:

| Check | How |
| --- | --- |
| LSP | Import sample CSV from `modules/lsp/sample_data/`, run CSPF |
| Inventory | Open a site, view equipment |
| IPAM | Open registry, add a test subnet |
| Notes | Open PRISM menu → Quick Notes |

### 2 — Automated preflight

With `npm run dev` running in another terminal:

```powershell
npm run preflight
npm run smoke
```

### 3 — Supabase (optional now, required for cloud LSP)

1. Run **`supabase/migrations/001_prism_schema.sql`** in the [Supabase SQL Editor](https://supabase.com/dashboard).
2. Copy **Database → Connection string (URI)** into repo-root `.env` as `DATABASE_URL=...`
3. Restart `npm run dev` — LSP saves/restores topology from `lsp_projects` (check `/api/lsp/health` → `"storage": "postgres"`).
4. For admin login when hosted: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` and create one user under **Authentication → Users**.

### 4 — Deploy to Vercel only after steps 1–2 pass

Vercel hosts the **UI**. APIs still need a host (Railway/Render) or future serverless wiring — see below.

---

## Deploy to Vercel (web UI)

The repo includes **`vercel.json`** at the root. Vercel builds **`platform/frontend`** only (the unified PRISM shell). Local `npm run dev` is unchanged.

### What works on Vercel today

| Works | Not yet (needs hosted APIs) |
| --- | --- |
| Home screen, routing, static UI | LSP import / CSPF |
| Module shells (LSP, Inventory, IPAM) | Inventory / IPAM / Notes data |

API calls use relative paths (`/api/lsp`, `/api/inventory`, etc.). Until backends are hosted, those requests return 404 on Vercel — expected for a **UI-only** first deploy.

### Step 1 — Push to GitHub

```powershell
git remote set-url origin https://github.com/palesunset/prism1.git
git add .
git commit -m "Prepare PRISM for Vercel deployment"
git push -u origin main
```

If the remote repo is empty, use `main` as the default branch (GitHub → Settings → General → Default branch).

### Step 2 — Import on Vercel

1. Sign in at [vercel.com](https://vercel.com).
2. **Add New → Project** → import **[palesunset/prism1](https://github.com/palesunset/prism1)**.
3. Leave **Root Directory** as **`.`** (repository root).
4. Confirm settings (auto-detected from `vercel.json`):
   - **Install:** `npm ci --prefix platform/frontend`
   - **Build:** `npm run build --prefix platform/frontend`
   - **Output:** `platform/frontend/dist`
5. **Deploy**.

### Supabase database

Project URL: **https://acrxdkqqvcfnedljixyg.supabase.co**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste and run **`supabase/migrations/001_prism_schema.sql`** (creates Notes, IPAM, Inventory, and LSP tables + admin RLS).
3. **Authentication → Users → Add user** — create your single admin (email + password).
4. **Project Settings → API** — copy the **anon public** key (frontend) and **service_role** key (server only, never in the browser).

Add these **Environment Variables** on Vercel (Project → Settings → Environment Variables):

| Variable | Where to use |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://acrxdkqqvcfnedljixyg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon key from Supabase API settings |

Copy `platform/frontend/.env.example` to `platform/frontend/.env.local` for local cloud testing:

```powershell
copy platform\frontend\.env.example platform\frontend\.env.local
# Edit .env.local and paste your anon key
```

> **Note:** The SQL schema prepares Postgres for a future cloud cutover. **Inventory, IPAM, and Notes still use local SQLite** in `npm run dev`. Only **LSP** reads `DATABASE_URL` today for topology persistence.

### Step 3 — CLI alternative

```powershell
cd C:\Users\rich1\OneDrive\Desktop\LSP
npx vercel login
npx vercel --prod
```

### Step 4 — Wire APIs later (full functionality)

When LSP / Inventory / IPAM / Notes run on Railway, Render, or similar, add **rewrites** to `vercel.json` *before* the SPA fallback:

```json
{
  "source": "/api/lsp/:path*",
  "destination": "https://YOUR_LSP_HOST/api/lsp/:path*"
}
```

Repeat for `/api/inventory`, `/api/notes`, and `/api/ipam`. The frontend code does not need to change.

---

## Packaging (Windows desktop)

Build the platform frontend, then PyInstaller:

```powershell
npm run build:platform
pyinstaller .\packaging\pyinstaller.spec
```

Output: `dist/prism.exe` (single-file). First launch may take a few seconds while the bundle extracts.

---

## Documentation

| Document | Contents |
| --- | --- |
| **`docs/GUIDE.md`** | **New laptop / Windows setup** — prerequisites, PowerShell npm fix, install, run, troubleshooting |
| **`docs/VERCEL.md`** | **Production deploy** — Vercel + Supabase (cloud-only) |
| **`docs/USER_MANUAL.md`** | Full walkthrough, CSV schemas, vendor notes, extended LAN / nginx guide |
| **`docs/PROJECT_STRUCTURE.md`** | Repo layout, dev wiring, feature summary |
| **`modules/inventory/README.md`** | Inventory API routes |
| **`modules/ipam/README.md`** | IPAM API, env vars, schema |

---

## Credits

**Developers**

Ruel Saria  
John Carlo Emberga
