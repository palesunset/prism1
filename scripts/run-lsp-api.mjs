#!/usr/bin/env node
/** Cross-platform LSP API launcher with PYTHONPATH set. */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(__dirname, "..", "modules", "lsp", "backend");
const py = process.platform === "win32" ? "python" : "python3";

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
