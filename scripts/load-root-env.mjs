import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

function applyEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

/** Load repo-root `.env` then optional local `.env` (does not override existing env). */
export function loadRootEnv(localDir = process.cwd()) {
  applyEnvFile(path.join(repoRoot, ".env"));
  applyEnvFile(path.join(localDir, ".env"));
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() || "";
}
