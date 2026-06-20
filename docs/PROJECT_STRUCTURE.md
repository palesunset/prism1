# PRISM Platform — Project Structure

This document describes the repository layout, how services connect in development, and a summary of major features delivered in the unified platform.

## Top-level layout

| Path | Role |
| --- | --- |
| `platform/frontend/` | **Shell UI** — home screen, React Router, IPAM pages, floating tools (Notes, IP Calculator, VLSM Planner, NetLens) |
| `modules/lsp/backend/` | **LSP API** — FastAPI, CSPF, vendor config templates, traffic simulation (port **5000**) |
| `modules/lsp/frontend/` | **LSP UI source** — Cytoscape topology, compute, config export (embedded via `@lsp`) |
| `modules/lsp/sample_data/` | LSP CSV fixtures (`sample_nes.csv`, `sample_links.csv`) |
| `modules/inventory/` | **Inventory module** — Express API (port **3001**) + React UI (embedded via `@inventory`) |
| `modules/ipam/backend/` | **IPAM API v1.3** — registry, workflow, audit, backup/restore, VLSM import, IPv6, inventory cross-check (port **3003**) |
| `modules/notes/backend/` | **Notes API** — floating notes/todos (port **3002**) |
| `scripts/` | Root dev helpers (`run-lsp-api.mjs`, `kill-dev-ports.mjs`, `smoke-test.mjs`) |
| `packaging/` | PyInstaller spec for single-file `prism.exe` |
| `docs/` | User manual and this structure guide |

## Development wiring

Run from repository root:

```powershell
npm run install:all
pip install -r modules/lsp/backend/requirements.txt
npm run dev
```

`npm run dev` starts five processes:

| Process | Port | Path |
| --- | --- | --- |
| LSP API | 5000 | `modules/lsp/backend` |
| Inventory API | 3001 | `modules/inventory/backend` |
| Notes API | 3002 | `modules/notes/backend` |
| IPAM API | 3003 | `modules/ipam/backend` |
| Platform UI | 5173 | `platform/frontend` |

The platform Vite dev server proxies `/api/*` to the APIs above. Open **http://localhost:5173**.

### Module composition (platform shell)

```
platform/frontend
  ├── @lsp      → modules/lsp/frontend/src
  ├── @inventory → modules/inventory/frontend/src
  └── pages/ipam → IPAM UI (lives in platform; API in modules/ipam/backend)
```

Standalone development (optional):

| Command | Use when |
| --- | --- |
| `npm run dev:lsp-only` | LSP API + LSP Vite only |
| `npm run dev:inventory-only` | Inventory API + inventory Vite only |

## Feature summary (recent platform work)

### Unified PRISM shell

- Home module picker (LSP Design, Inventory, Mini IPAM)
- Floating **PRISM** module switcher with draggable position memory
- Keyboard shortcuts on home (`1` / `2` / `3`)

### Mini IPAM (phases 1–5)

- **Registry** — subnet/host CRUD with integrity validation
- **Subnets** — picker, detail, free ranges, host allocation
- **Search / Analytics / Audit / System Control**
- **IP Workflow Manager** — allocation lifecycle with approvals and change log
- Registry writes from workflow only on approve / reserve / activate

### Floating tools (PRISM menu)

| Tool | Storage |
| --- | --- |
| **NetLens** | Read-only validation; **Submit to Workflow** |
| **IP Calculator** | Browser-only |
| **VLSM Planner** | Dry-run + Save to IPAM |
| **Quick Notes** | `modules/notes/backend/notes.db` |

### LSP Design

- CSPF primary/backup paths, failure simulation, multi-vendor config export
- Traffic simulation workspace mode
- Project save/load (`.lsp.json`)

### Equipment Inventory

- Sites, equipment, ports, dashboard, map, CSV import
- **Oz** local Llama assistant (optional GGUF model)

## Data files

| Module | Database / store |
| --- | --- |
| Inventory | `modules/inventory/backend/inventory.db` |
| Notes | `modules/notes/backend/notes.db` |
| IPAM | `modules/ipam/backend/ipam.db` |
| LSP | In-memory topology + localStorage / project files |

## Tests

```powershell
npm test              # all suites
npm run test:ipam     # IPAM integration + ipMath unit tests
npm run test:platform # platform build + IPAM Vitest smoke tests
npm run smoke         # live LSP + inventory + IPAM health (APIs must be running)
```

## Packaging

```powershell
npm run build:platform
pyinstaller .\packaging\pyinstaller.spec
```

Output: `dist/prism.exe` (Windows). Serves built UI from bundled `frontend_dist`.

## Documentation index

| Document | Location |
| --- | --- |
| Quick start & module overview | `README.md` (root) |
| Full user manual | `docs/USER_MANUAL.md` |
| Inventory API (standalone) | `modules/inventory/README.md` |
