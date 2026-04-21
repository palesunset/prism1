# LSP Simulator

Local, offline-first desktop-style application for importing a physical topology from CSV, computing CSPF primary and strict node-disjoint backup paths, simulating failures, and generating multi-vendor MPLS/SRv6 configuration snippets.

## Features

- Bulk import of `nes.csv` and `links.csv` (drag-and-drop in the UI or file picker).
- UI state persistence (mode/constraints/Nokia CLI style) via localStorage.
- Save/Open a portable project file (`.lsp.json`) containing topology, cached layout positions, and saved LSPs.
- FastAPI backend with NetworkX CSPF (parallel links supported via an expanded graph model).
- React + Vite + TypeScript UI with Cytoscape.js and the `cose-bilkent` compound layout for site grouping.
- Vendor templates (Jinja2) for Nokia SR OS, Huawei VRP, Cisco IOS XR, and Juniper Junos across RSVP-TE, SR-MPLS, and SRv6 modes.
- PyInstaller packaging entry point (`backend/run_desktop.py`) intended for one-click desktop distribution after building the frontend.

## Quick start (development)

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

The Vite dev server proxies `/api` to `http://127.0.0.1:5000`.

### 3) Production-like local run (API serves the built UI)

```powershell
cd frontend
npm run build
cd ..\backend
$env:PYTHONPATH = "."
python .\run_desktop.py
```

This starts FastAPI on `http://127.0.0.1:5000` and opens your browser. The backend automatically serves `frontend/dist` when present.

## Sample data

The repository includes `sample_data/sample_nes.csv` and `sample_data/sample_links.csv` (~400 NEs / ~2000 links). Regenerate with:

```powershell
python .\sample_data\generate_sample.py
```

You can also import the sample topology directly from the UI using **Load sample topology**.

## Keyboard shortcuts

- **Ctrl/Cmd + K**: focus NE search box
- **Ctrl/Cmd + Enter**: compute LSP
- **Ctrl/Cmd + S**: save project

## Packaging (PyInstaller)

Build the frontend first, then run PyInstaller from the repository root. The spec builds a **single `lsp-simulator.exe`** (one-file) that unpacks to a temp directory at runtime; templates and `frontend_dist` are included as data files (see `app/main.py` frozen-path handling).

```powershell
cd frontend
npm run build
cd ..
pyinstaller .\build_scripts\pyinstaller.spec
```

The executable is written to `dist/lsp-simulator.exe` (Windows). First launch may be a few seconds slower than an onedir build while the bundle extracts.

### Icons & macOS notarization

- **Icons:** Replace the default PyInstaller icon by passing `icon='assets/app.ico'` (Windows) in `EXE(...)` and ship `.icns` separately for macOS bundling if you add an `.app` target later.
- **Notarization:** Apple notarization/stapling is outside this repo; use your Developer ID certificate and `notarytool` in your release pipeline to avoid Gatekeeper warnings.

## Tests

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest
```

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/import` | Multipart upload of `nes_file` + `links_file`. |
| `GET` | `/api/topology` | Cytoscape elements JSON for the active topology. |
| `POST` | `/api/compute` | CSPF primary + strict node-disjoint backup. |
| `POST` | `/api/export` | ZIP bundle of per-NE `.cfg` files. |
| `POST` | `/api/export/clipboard` | Ingress-only plaintext configuration. |
| `GET` | `/api/health` | Health probe. |

## Documentation

See `USER_MANUAL.md` for CSV schemas, UI walkthrough, and vendor notes.

## License

MIT — see `LICENSE`.
