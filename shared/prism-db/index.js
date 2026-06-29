import { createRequire } from "module";
import { createPgDb, formatPgError } from "./pgSync.js";

const require = createRequire(import.meta.url);

/** One Postgres pool for all backends (notes, IPAM, inventory) on serverless. */
let sharedPgDb = null;
let sharedPgUrl = null;

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for cloud hosting. Set it in Vercel Environment Variables (Supabase Session pooler URI).",
    );
  }
  return url;
}

function isCloudHost() {
  return Boolean(process.env.VERCEL || process.env.PRISM_CLOUD === "1");
}

function openSqliteDatabase(sqlitePath, sqliteInit) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    throw new Error(
      "Local SQLite requires Node.js 22.5+ (node:sqlite). On Vercel, set DATABASE_URL for Supabase Postgres.",
    );
  }
  const db = new DatabaseSync(sqlitePath);
  if (sqliteInit) sqliteInit(db);
  return db;
}

/**
 * Cloud (Vercel): Supabase Postgres via DATABASE_URL.
 * Local dev only when PRISM_CLOUD is unset — uses SQLite (Node 22.5+).
 */
export function createPrismDb({ sqlitePath, sqliteInit }) {
  const cloud = isCloudHost();
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

  if (cloud || url) {
    const connectionUrl = requireDatabaseUrl();
    if (!sharedPgDb || sharedPgUrl !== connectionUrl) {
      sharedPgDb = createPgDb(connectionUrl);
      sharedPgUrl = connectionUrl;
      console.log("[prism-db] Supabase/Postgres (shared pool)");
    }
    return { db: sharedPgDb, dialect: "postgres" };
  }

  const db = openSqliteDatabase(sqlitePath, sqliteInit);
  console.log(`[prism-db] SQLite dev (${sqlitePath})`);
  return { db, dialect: "sqlite" };
}

export function isPostgresMode() {
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  return isCloudHost() || Boolean(url);
}

export { formatPgError };
