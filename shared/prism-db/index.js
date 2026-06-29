import { DatabaseSync } from "node:sqlite";
import { createPgDb, formatPgError } from "./pgSync.js";

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for cloud hosting. Set it in Vercel Environment Variables (Supabase connection string).",
    );
  }
  return url;
}

function isCloudHost() {
  return Boolean(process.env.VERCEL || process.env.PRISM_CLOUD === "1");
}

/**
 * Cloud (Vercel): Supabase Postgres via DATABASE_URL.
 * Local dev only when PRISM_CLOUD is unset — uses SQLite.
 */
export function createPrismDb({ sqlitePath, sqliteInit }) {
  const cloud = isCloudHost();
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

  if (cloud || url) {
    const db = createPgDb(requireDatabaseUrl());
    console.log("[prism-db] Supabase/Postgres (cloud)");
    return { db, dialect: "postgres" };
  }

  const db = new DatabaseSync(sqlitePath);
  if (sqliteInit) sqliteInit(db);
  console.log(`[prism-db] SQLite dev (${sqlitePath})`);
  return { db, dialect: "sqlite" };
}

export function isPostgresMode() {
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  return isCloudHost() || Boolean(url);
}

export { formatPgError };
