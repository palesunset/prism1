# PRISM Platform — Windows setup guide (new laptop)

Step-by-step instructions for installing and running PRISM on a **fresh Windows PC**. Use this when setting up a colleague’s laptop, a new work machine, or after downloading the project as a ZIP.

**Repository:** [github.com/palesunset/prism1](https://github.com/palesunset/prism1)

For module usage after install, see **`docs/USER_MANUAL.md`**. For LAN sharing, see **`README.md`** → *Run on a local network (LAN)*.

---

## Before you start — install these

| Software | Version | Download |
| --- | --- | --- |
| **Node.js** | 20+ (**22.5+ recommended**) | [nodejs.org](https://nodejs.org) — choose **LTS** |
| **Python** | 3.11+ | [python.org](https://www.python.org/downloads/) — check **“Add Python to PATH”** on Windows |
| **Git** | Optional | Only needed if you `git clone`; a ZIP download is fine |

After installing Node and Python, **close and reopen** your terminal.

---

## Step 1 — Verify tools

Open **Command Prompt** (recommended on new laptops):

1. Press **Win + R**
2. Type **`cmd`**
3. Press **Enter**

Run:

```cmd
node --version
npm --version
python --version
```

You should see something like:

- `v22.x.x` (Node)
- `10.x.x` (npm)
- `Python 3.11.x` or newer

If a command says **“not recognized”**, install that program, restart the terminal, and try again.

---

## Step 2 — Get the project

### Option A — Download ZIP (no Git)

1. Open [github.com/palesunset/prism1](https://github.com/palesunset/prism1)
2. Click **Code** → **Download ZIP**
3. Extract the ZIP (e.g. to `Pictures\prism1-main`)
4. Open **cmd** and go to that folder:

```cmd
cd C:\Users\YOUR_USERNAME\Pictures\prism1-main
```

Replace the path with your actual folder. You must be in the folder that contains **`package.json`**.

### Option B — Git clone

```cmd
git clone https://github.com/palesunset/prism1.git
cd prism1
```

---

## Step 3 — Fix the PowerShell “scripts disabled” error

On many new Windows laptops, **PowerShell blocks npm** with:

```text
npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

This is **not** a PRISM bug. Pick **one** fix:

### Fix A — Use Command Prompt (easiest)

Run all commands in this guide in **cmd**, not PowerShell. No policy change needed.

### Fix B — Use npm.cmd in PowerShell

```powershell
npm.cmd run install:all
npm.cmd run dev
```

Use `npm.cmd` instead of `npm` for every npm command.

### Fix C — Allow scripts for your user (PowerShell)

In **PowerShell**:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Type **Y** when prompted. After that, normal `npm` works in PowerShell.

---

## Step 4 — Install Node dependencies

In **cmd**, from the project root (folder with `package.json`):

```cmd
npm run install:all
```

- First run can take **5–15 minutes**
- Wait until it finishes without red **ERROR** lines

### Optional — skip Oz AI model download (~2 GB)

Inventory works without Oz; only the chat assistant stays disabled.

**Command Prompt:**

```cmd
set SKIP_OZ_MODEL_DOWNLOAD=1
npm run install:all
```

**PowerShell:**

```powershell
$env:SKIP_OZ_MODEL_DOWNLOAD = "1"
npm run install:all
```

---

## Step 5 — Install Python dependencies (LSP)

Still in the project root:

```cmd
pip install -r modules\lsp\backend\requirements.txt
```

If `pip` is not found:

```cmd
python -m pip install -r modules\lsp\backend\requirements.txt
```

---

## Step 6 — Start PRISM

```cmd
npm run dev
```

Wait until the terminal shows **all five** processes:

| Label in terminal | Service | Port |
| --- | --- | --- |
| `lsp-api` | LSP API | 5000 |
| `inv-api` | Inventory API | 3001 |
| `notes-api` | Notes API | 3002 |
| `ipam-api` | IPAM API | 3003 |
| `web` | Platform UI | 5173 |

When **web** (Vite) says it is ready, continue.

**Leave this terminal window open** while you use the app.

---

## Step 7 — Open the app

On the **same laptop**, open Chrome or Edge and go to:

**http://localhost:5173**

You should see the PRISM home screen with three tiles:

1. **LSP Design**
2. **Inventory**
3. **Mini IPAM**

---

## Step 8 — Quick sanity check

1. Press **1** on the keyboard → **LSP Design** opens (empty graph is OK before import).
2. Click the purple **PRISM** floating button → module menu expands.
3. Click **Home** → back to the start screen.

### LSP: “409 Conflict” in the terminal — normal?

Yes, **before you import topology**. Lines like:

```text
GET /api/lsp/topology HTTP/1.1" 409 Conflict
```

mean **no CSV imported yet**. The app handles this and shows an empty map.

**To load a sample topology:**

1. Open **LSP Design**
2. Drag these two files onto the window:
   - `modules\lsp\sample_data\sample_nes.csv`
   - `modules\lsp\sample_data\sample_links.csv`
3. After import, topology requests should return **200** and nodes appear on the map.

---

## Step 9 — Stuck ports (second run)

If `npm run dev` fails with **port already in use**:

```cmd
npm run dev:kill
npm run dev
```

---

## Copy-paste checklist (Command Prompt)

Replace the `cd` path with your folder:

```cmd
cd C:\Users\YOUR_USERNAME\Pictures\prism1-main
node --version
npm --version
python --version
npm run install:all
pip install -r modules\lsp\backend\requirements.txt
npm run dev
```

Then open **http://localhost:5173**

---

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `npm.ps1 cannot be loaded` | Use **cmd**, or `npm.cmd ...`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm` / `node` not recognized | Install Node.js LTS; close and reopen terminal |
| `python` / `pip` not recognized | Reinstall Python with **Add to PATH**, or use `py -3.11 -m pip install ...` |
| `EADDRINUSE` / port in use | `npm run dev:kill` then `npm run dev` |
| Page blank at localhost:5173 | Wait 30 seconds; check terminal for errors; hard refresh **Ctrl+F5** |
| Inventory or IPAM database errors | Upgrade Node to **22.5+** (built-in SQLite) |
| LSP 409 on `/topology` after import | Restart `npm run dev` and re-import CSV (topology is in-memory until you save a project) |

---

## Share on office Wi‑Fi (optional)

Only after local setup works on one PC:

1. Run `ipconfig` → note **IPv4 Address** (e.g. `192.168.1.50`)
2. Edit `platform\frontend\vite.config.ts` → inside `server`, add **`host: true`**
3. Allow **Windows Firewall** inbound **TCP 5173**
4. On other PCs on the same network, open **`http://SERVER_IP:5173`**

Full LAN steps (firewall, API keys, nginx) are in **`docs/USER_MANUAL.md`** → *Hosting on a local network (LAN)*.

---

## What’s next

| Goal | Where to look |
| --- | --- |
| Use each module (LSP, Inventory, IPAM, tools) | **`README.md`** or **`docs/USER_MANUAL.md`** |
| CSV column formats for LSP | **`docs/USER_MANUAL.md`** → LSP Design |
| IPAM workflow and registry | **`modules/ipam/README.md`** |
| Run tests | From repo root: `npm test` |

---

## Credits

Ruel Saria · John Carlo Emberga
