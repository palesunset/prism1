# PRISM Platform

Unified offline-first toolkit for **network equipment inventory** and **LSP design** (CSPF paths, failure simulation, multi-vendor MPLS/SRv6 config generation).

**Repository:** [github.com/palesunset/PrismPlatform](https://github.com/palesunset/PrismPlatform)

## Modules

| Module | Description |
| --- | --- |
| **Inventory** | Sites, equipment, slots/ports, map, dashboard, CSV import/export, Oz AI assistant |
| **LSP Design** | Topology import, CSPF primary/backup paths, failure simulation, vendor config export |
| **Traffic Simulation** | Available inside LSP workspace (failure scenarios, relief advisor) |

## Quick start — unified platform (recommended)

**Requirements:** Python 3.11+, Node 20+ (inventory API needs Node **22.5+** for built-in SQLite)

```powershell
# From repository root
npm run install:all
pip install -r backend/requirements.txt
npm run dev
```

Open **http://localhost:5173** — pick **Inventory** or **LSP Design** on the home screen. Use the floating PRISM switcher to change modules anytime.

| Service | URL (dev) |
| --- | --- |
| Platform UI | http://localhost:5173 |
| LSP API | http://localhost:5000 (`/api/lsp/*`) |
| Inventory API | http://localhost:3001 (`/api/inventory/*`) |

If ports are stuck from a previous session, run `npm run dev:kill` before `npm run dev`.

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
npm test          # LSP backend + frontend + inventory + platform build
npm run smoke     # live API smoke tests (start APIs first: npm run dev:lsp-api & npm run dev:inv-api)
```

### Backend

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest
```

Coverage is enforced for CSPF and role-validation modules (see `backend/pytest.ini`).

### Frontend

```powershell
cd frontend
npm run lint
npm run test
npm run build
```

Vitest covers the NE picker combobox (`NeSearchInput`, `nePicker`) and project-file validation.

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

See `USER_MANUAL.md` for CSV schemas, UI walkthrough, and vendor notes.
