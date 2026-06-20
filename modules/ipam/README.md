# Mini IPAM (v1.3)

Local IPv4/IPv6 address management API for PRISM. The UI lives in `platform/frontend` (`/ipam`); this folder contains the Node.js backend.

## Quick start

```bash
# From repo root (starts IPAM on port 3003 with other services)
npm run dev

# Or IPAM API only
cd modules/ipam/backend
npm install
npm start
```

API base: `http://127.0.0.1:3003/api/ipam`  
Health: `GET /api/ipam/health`

Platform frontend proxies `/api/ipam` → port 3003 when using `npm run dev`.

## Data

SQLite database: `modules/ipam/backend/ipam.db` (created on first run). Migrations run automatically at startup.

**Schema v5:** `address_family`, `v6_range_start`, `v6_range_end` for IPv6 records (v4 uses `range_start`/`range_end` uint32).

## Environment (optional)

| Variable | Purpose |
| --- | --- |
| `INVENTORY_API_URL` | Base URL for inventory cross-check (default `http://127.0.0.1:3001`) |
| `INVENTORY_API_KEY` | Bearer key for Inventory API when `API_KEY` is enabled there (same value as Inventory `API_KEY`) |
| `IPAM_API_KEY` | When set, requires `Authorization: Bearer <key>` on all routes except `/health` and `/capabilities` |
| `IPAM_ADMIN_KEY` | When set, admin routes require `X-Ipam-Admin-Key` (backup GET, restore POST, settings PUT, DB backup POST) |
| `IPAM_FULL_INTEGRITY_SCAN` | Set to `1` to run full post-save integrity scan (default: targeted scan only) |

In the browser, keys can be stored in `localStorage` as `prism-ipam-api-key` and `prism-ipam-admin-key` (System Control → API Keys panel).

**Public routes (no API key):** `/health`, `/capabilities`

## v1.3 (current)

- **IPv6** — Register/search/validate IPv6 subnets and hosts; family-aware overlap detection; schema v5 columns
- **Inventory cross-check** — `POST /validate` (hosts) and `GET /crosscheck/inventory?address=` compare against Equipment Inventory
- **Frontend** — Lazy-loaded Inventory/LSP/IPAM routes; dedicated Vite chunks (`inventory`, `lsp`, `ipam`)

## v1.2

- **Validation** — MAC address and hostname format checks on create/update; parent subnet must exist and contain the address
- **Workflow integrity** — Atomic reserve/activate/decommission/modify (registry sync rolls back on failure)
- **Backup/restore** — Full JSON bundle (records, workflows, history, audit, settings); UI in System Control
- **Security** — Admin routes use `X-Ipam-Admin-Key` only; authenticated blob downloads in UI
- **UI** — Processing pipeline layout, parent subnet picker, merged activity log, tab a11y (`tablist` / `tabpanel`), split React modules
- **Tests** — Integration suite + `ipMath` unit tests; platform Vitest smoke tests for form helpers

## v1.1 features

- **Security** — Helmet, CORS, optional API/admin keys, rate limiting
- **Schema** — Host fields: hostname, MAC, gateway, DHCP scope, PTR; workflow `REJECTED` state
- **Workflow** — Approve = intent only; **reserve** writes `reserved`; **activate** writes `used`; reject/reopen
- **Imports** — CSV template, row-level error report, VLSM dry-run before import
- **Operations** — Bulk status update, cascade subnet delete, paginated records, picklists
- **Settings** — Configurable utilization alert threshold (`utilization_alert_percent`, default 80)
- **Audit** — Unified audit CSV export (registry + workflow log)

**Not included in v1.1:** workflow manager (added in v1.2), backup/restore UI (v1.2). IPv6 and inventory cross-check were added in **v1.3**.

## Tests

Start the API, then:

```bash
cd modules/ipam/backend
npm test
```

Runs integration tests (`test-ipam-api.js`) and unit tests (`test-ipam-ipmath.js`).

The integration suite covers registry CRUD, IPv6 duplicate-subnet rejection, large IPv6 `/48` dashboard (Used count, no finite Free/Util), subnet detail + next-ip, subnet detail 404, workflow override/approve gating, ACTIVE metadata modify, and reject/reopen — in addition to v1.2 scenarios (VLSM import, backup/restore, duplicate-host 409, full workflow reserve/activate/decommission).

Platform UI smoke tests: `cd platform/frontend && npm test` (form helpers + NetLens IPAM reachable mapping; no API required).

## Key endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Service status |
| GET | `/capabilities` | Feature flags |
| GET/POST | `/records` | Registry CRUD; `?page`, `?pageSize`, filters |
| POST | `/records/bulk-status` | Bulk status change |
| GET | `/picklists` | Distinct projects, VLANs, locations |
| GET/PUT | `/settings` | Utilization alert threshold |
| POST | `/import/csv` | Bulk CSV with per-row errors |
| GET | `/import/csv/template` | Download template |
| POST | `/integrity/simulate/vlsm` | VLSM dry-run |
| GET | `/backup` | Full JSON backup bundle (admin key when configured) |
| POST | `/restore` | Replace all data from backup bundle (admin key when configured) |
| GET | `/audit/export.csv` | Unified audit export |
| GET | `/workflow/dashboard` | Workflow queues + history |

See `src/routes/ipam.js` for the full route list.
