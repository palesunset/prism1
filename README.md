# PRISM Platform

Unified offline-first toolkit for **network equipment inventory** and **LSP design** (CSPF paths, failure simulation, multi-vendor MPLS/SRv6 config generation).

**Repository:** [github.com/palesunset/PrismPlatform](https://github.com/palesunset/PrismPlatform)

## Modules

| Module | Description |
| --- | --- |
| **Inventory** | Sites, equipment, slots/ports, map, dashboard, CSV import/export, Oz AI assistant |
| **LSP Design** | Topology import, CSPF primary/backup paths, failure simulation, vendor config export |
| **Quick Notes** | Draggable floating notes window from the PRISM menu while using Inventory or LSP |
| **Traffic Simulation** | Available inside LSP workspace (failure scenarios, relief advisor) |

## Quick start — unified platform (recommended)

**Requirements:** Python 3.11+, Node 20+ (inventory API needs Node **22.5+** for built-in SQLite)

```powershell
# From repository root
npm run install:all
pip install -r backend/requirements.txt
npm run dev
```

Open **http://localhost:5173** — pick **Inventory** or **LSP Design** on the home screen. Use the floating PRISM menu to switch modules or open **Notes** while you work.

| Service | URL (dev) |
| --- | --- |
| Platform UI | http://localhost:5173 |
| LSP API | http://localhost:5000 (`/api/lsp/*`) |
| Inventory API | http://localhost:3001 (`/api/inventory/*`) |
| Notes API | http://localhost:3002 (`/api/notes/*`) |

If ports are stuck from a previous session, run `npm run dev:kill` before `npm run dev`.

## Quick Notes

Notes open as a **draggable floating window** from the PRISM menu while you are in Inventory or LSP — drag it anywhere and keep working behind it.

- Create, edit, pin, color, archive, and delete notes
- **To-do lists** with checkboxes — add tasks, mark complete, track progress
- Data stored locally in `notes/backend/notes.db` via `/api/notes`
- Requires the Notes API (started automatically with `npm run dev`)

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
