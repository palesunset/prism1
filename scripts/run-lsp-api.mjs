#!/usr/bin/env node
/** Cross-platform LSP API launcher with PYTHONPATH and repo-root `.env`. */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { loadRootEnv } from "./load-root-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backend = path.join(root, "modules", "lsp", "backend");
const py = process.platform === "win32" ? "python" : "python3";

loadRootEnv(backend);

const child = spawn(
  py,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "5000"],
  {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: "." },
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
