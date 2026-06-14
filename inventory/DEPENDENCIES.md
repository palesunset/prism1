# Dependencies

This document lists software and npm packages used by the Data Center Equipment Inventory application.

## System Requirements

| Software | Version | Purpose | Installation |
|----------|---------|---------|----------------|
| Node.js | **22.5+** (includes current releases) | JavaScript runtime + built-in SQLite (`node:sqlite`) | [nodejs.org](https://nodejs.org/) |
| npm | 9.x or later (bundled) | Package manager | Included with Node.js |
| Ollama | Latest | Optional AI search | [ollama.com](https://ollama.com/) |

## Node.js Packages

### Root (`package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| concurrently | ^8.2.2 | Run backend + frontend in dev |

### Backend (`backend/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.0 | Web server |
| (Node built-in) | `node:sqlite` | SQLite (`DatabaseSync`); requires Node **22.5+** |
| cors | ^2.8.5 | CORS |
| dotenv | ^16.0.0 | Environment variables |
| multer | ^1.4.5-lts.1 | Multipart CSV upload |
| csv-parser | ^3.0.0 | CSV parsing (import) |
| uuid | ^9.0.0 | UUID generation |

### Frontend (`frontend/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI |
| react-dom | ^18.2.0 | DOM rendering |
| react-router-dom | ^6.20.0 | Routing |
| axios | ^1.6.0 | HTTP client |
| @tanstack/react-query | ^5.0.0 | Data fetching |
| leaflet | ^1.9.4 | Maps |
| react-leaflet | ^4.2.1 | React + Leaflet |
| papaparse | ^5.4.0 | CSV parsing (client template validation) |
| lucide-react | ^0.300.0 | Icons |
| clsx | ^2.0.0 | Class names |
| tailwindcss | ^3.4.0 | Styling |
| jspdf | ^4.2.1 | PDF generation |
| jspdf-autotable | ^5.0.7 | PDF tables |

### Frontend devDependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.3.0 | Types |
| vite | ^6.4.2 | Build / dev server |
| @vitejs/plugin-react | ^5.1.4 | React plugin |
| postcss | ^8.4.0 | CSS pipeline |
| autoprefixer | ^10.4.0 | Prefixes |

## Ollama Setup (optional)

1. Install from [ollama.com](https://ollama.com).
2. `ollama pull tinyllama` (or `phi3:mini`, `llama3.2:1b`).
3. Verify http://localhost:11434.

## Installing everything

From the project root:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

Build and start:

```bash
npm run build
npm start
```

App URL: **http://localhost:3001**.
