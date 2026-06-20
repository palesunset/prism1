# Network Equipment Inventory (PRISM module)

Local web application for managing data center sites, equipment, slots, and ports — interactive map, utilization dashboards, CSV import/export, Oz AI chat, and PDF reporting. In PRISM, the UI is embedded at **`/inventory`** via `platform/frontend`; this folder contains the standalone module source.

## Prerequisites

- **Node.js v22.5+** and **npm** (backend uses built-in `node:sqlite`)
- **Git** (optional)

## Installation (PRISM monorepo)

From the repository root:

```bash
npm run install:all
```

Or install this module only:

```bash
cd modules/inventory/backend && npm install
cd ../frontend && npm install
```

## Development

**Full PRISM stack** (recommended):

```bash
npm run dev
```

Open **http://localhost:5173/inventory** — Vite proxies `/api/inventory` to port **3001**.

**Inventory only** (API + standalone Vite):

```bash
cd modules/inventory && npm run dev
```

- Frontend (Vite): **http://localhost:5173**
- API: **http://localhost:3001**

## Build and test

```bash
cd modules/inventory
npm run build    # frontend production build
npm test         # backend + frontend tests
```

From repo root: `npm run test:inventory`

## API integration (Mini IPAM)

When `API_KEY` is set on the Inventory backend, configure IPAM with the same value:

```env
INVENTORY_API_KEY=<same as Inventory API_KEY>
INVENTORY_API_URL=http://127.0.0.1:3001
```

IPAM uses `GET /api/inventory/equipment/by-ip` for read-only cross-checks. Management IPs are canonicalized (IPv4/IPv6) on save; duplicate IPs are rejected on create/update/import.

## Integrity

`GET /api/inventory/integrity` — reports duplicate management IP groups across equipment.

---

## Legacy standalone layout note

Older docs referred to `frontend/` and `backend/` at the inventory root. Paths are now **`modules/inventory/frontend`** and **`modules/inventory/backend`**. The database file is **`modules/inventory/backend/inventory.db`**.

## Oz AI — Llama model

**Default path:** `backend/models/llama-3.2-3b-instruct-q4_k_m.gguf` (~2 GB)

### Use your own model (`OZ_MODEL_PATH`)

In `backend/.env` (copy from `.env.example`), point to any compatible instruct GGUF:

```env
# Relative to backend/
OZ_MODEL_PATH=models/llama-3.2-1b-instruct-q4_k_m.gguf

# Absolute path
OZ_MODEL_PATH=/opt/models/my-model.gguf
```

| Machine | Suggested starting point |
| --- | --- |
| Low RAM / older CPU | 1B class, Q4 (~1 GB) |
| Typical laptop | 3B Q4_K_M (default) |
| Workstation | 3B+ Q8 or larger |

When `OZ_MODEL_PATH` is set, place your `.gguf` at that location and restart the backend. The default Hugging Face download is skipped.

### Download the default model

Runs on `npm install` when `OZ_MODEL_PATH` is unset:

```bash
cd backend
npm install
```

Manual download:

```bash
cd backend
npm run download-model
```

Skip download when Oz is not needed:

```bash
SKIP_OZ_MODEL_DOWNLOAD=1 npm install
```

After the model is present, restart the backend and open Oz from the Inventory UI. Logs should show `Oz: loading model from ...`.

## Deploy to the network

Use this when other people on your LAN (or a server) need to open the app in a browser — not just on the machine where it runs.

The production setup is **one Node process**: the backend serves the built React app and the API on the same port (default **3001**).

### 1. Prepare the host machine

On the PC or server that will run the app:

1. Install **Node.js v22.5+** and **npm**.
2. Copy or clone the project to the host (e.g. `C:\Apps\dc-inventory` or `/opt/dc-inventory`).
3. Install dependencies from the project root:

   ```bash
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   ```

### 2. Configure environment

Create or edit **`backend/.env`** (copy from `backend/.env.example`):

```bash
cd backend
node scripts/generate-api-key.js
```

Example `backend/.env` for network deployment:

```env
# Required for network exposure — do not skip
API_KEY=paste_the_generated_key_here

# Listen on all network interfaces (not just localhost)
HOST=0.0.0.0
PORT=3001

# Only if you run the Vite dev server on another machine pointing at this API:
# CORS_ORIGINS=http://192.168.1.10:5173

# Only if the app sits behind nginx / IIS reverse proxy:
# TRUST_PROXY=1
```

Share the **API key** only with people who should use the app. Each user enters it once on the sign-in screen (stored in the browser session until they sign out or close the tab).

### 3. Build and start

From the **project root**:

```bash
npm run build
npm start
```

You should see something like:

```text
Network Equipment Inventory API on http://all interfaces:3001
API key authentication is enabled (API_KEY)
```

The database file is created automatically at **`backend/inventory.db`**. Back this file up regularly if you deploy for real use.

### 4. Allow the port through the firewall

Other devices must reach **TCP port 3001** (or whatever you set in `PORT`).

**Windows (PowerShell as Administrator):**

```powershell
New-NetFirewallRule -DisplayName "DC Inventory" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

**Linux (ufw example):**

```bash
sudo ufw allow 3001/tcp
```

If you use a different port in `.env`, open that port instead.

### 5. Find the server address

On the host machine:

- **Windows:** `ipconfig` — use the **IPv4 Address** of the LAN adapter (e.g. `192.168.1.50`).
- **Linux:** `ip addr` or `hostname -I`.

From another PC on the same network, open:

```text
http://<server-ip>:3001
```

Example: `http://192.168.1.50:3001`

Sign in with the **API key** from `backend/.env`.

### 6. Keep it running (optional)

`npm start` stops when you close the terminal. For a machine that should stay up:

**Windows — Task Scheduler or NSSM**  
Run `node backend/src/index.js` from the project folder at logon, with `backend/.env` in place.

**Linux — systemd example** (`/etc/systemd/system/dc-inventory.service`):

```ini
[Unit]
Description=DC Inventory
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dc-inventory/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dc-inventory
```

Adjust paths to match where you installed the project.

### 7. Reverse proxy (optional, recommended for internet-facing)

For **LAN-only** use, binding to `0.0.0.0:3001` with `API_KEY` is usually enough.

If the app must be reachable from outside the LAN, put **nginx**, **Caddy**, or **IIS** in front of it:

- Terminate **HTTPS** at the proxy.
- Proxy `/` and `/api` to `http://127.0.0.1:3001`.
- Set `TRUST_PROXY=1` in `backend/.env`.
- Keep `API_KEY` enabled; do not expose the app without authentication.

### 8. Security checklist

When `API_KEY` is set:

| Control | Purpose |
|--------|---------|
| API key on all `/api/*` routes (except `/api/health`) | Block anonymous CRUD and imports |
| `HOST=0.0.0.0` only when needed | Default `127.0.0.1` keeps the app local-only |
| Rate limits | Reduce abuse of API, uploads, and Oz chat |
| Helmet headers | Baseline HTTP security headers |
| CORS | Block random websites from calling your API unless `CORS_ORIGINS` is set |
| CSV upload limits | 5 MB, CSV/text types only |
| CSV export escaping | Reduce Excel formula injection when opening exports |

**Local development:** leave `API_KEY` unset — the API stays open on `127.0.0.1` only (default `HOST`).

### 9. Troubleshooting

| Problem | What to check |
|--------|----------------|
| Other PCs cannot connect | Firewall rule for `PORT`, correct server IP, same subnet/VLAN |
| `401` / sign-in loop | `API_KEY` in `.env` must match what users enter; restart backend after changing `.env` |
| Page loads but data fails | Browser dev tools → Network; confirm requests include `Authorization: Bearer …` |
| Oz chat unavailable | Optional; local LLM model download on first install — chat may be slow or off on low-RAM hosts |
| Data lost after reinstall | Restore **`backend/inventory.db`** from backup |

## CSV Import Template

A sample CSV is in `sample-data/equipment_import_template.csv`. Expected columns:

`Vendor`, `Model`, `Serial Number`, `End of Life (YYYY-MM-DD)`, `Status`, `Rack Position`

**Status** must be one of: `Active`, `Decommissioned`, `Maintenance`, `Spare`.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Leaflet
- **Backend:** Node.js, Express, SQLite (**`node:sqlite`**, built into Node 22.5+)
- **PDF:** jsPDF + jspdf-autotable
Full package list: **DEPENDENCIES.md**.

## License

MIT
