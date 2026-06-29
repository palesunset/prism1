import { createRequire } from "module";
import pg from "pg";
import { toPgParams, translateSql } from "./translate.js";

const require = createRequire(import.meta.url);

function getDeasync() {
  try {
    return require("deasync");
  } catch {
    return null;
  }
}

function translateSqlBatch(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/PRAGMA\s+\w+[^;]*/gi, ""))
    .filter(Boolean)
    .map((chunk) => translateSql(chunk));
}

function normalizeConnectionString(connectionString) {
  let url = connectionString.trim();
  if (url.includes("@db.") && url.includes("supabase.co") && !url.includes("pooler")) {
    console.warn(
      "[prism-db] DATABASE_URL uses direct db.*.supabase.co — Vercel needs the Session pooler URI (Connect → Session).",
    );
  }
  if (url.includes("pooler.supabase.com") && !/[?&]pgbouncer=/i.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}pgbouncer=true`;
  }
  return url;
}

export function createPgDb(connectionString) {
  const normalized = normalizeConnectionString(connectionString);
  const onServerless = Boolean(process.env.VERCEL);
  const pool = new pg.Pool({
    connectionString: normalized,
    ssl: normalized.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    // Single connection per lambda — deasync serializes queries; avoids pooler exhaustion.
    max: onServerless ? 1 : 2,
    idleTimeoutMillis: onServerless ? 5_000 : 20_000,
    connectionTimeoutMillis: onServerless ? 8_000 : 15_000,
  });

  pool.on("error", (err) => {
    console.error("[prism-db] Postgres pool error:", err.message);
  });

  /** Pinned client while BEGIN…COMMIT/ROLLBACK is active (SQLite-style transactions). */
  let txClient = null;

  function syncQuery(text, params = []) {
    const deasync = getDeasync();
    if (!deasync) {
      throw new Error(
        "Postgres sync driver requires deasync (installed on Vercel Linux). Deploy to Vercel or use SQLite locally without DATABASE_URL.",
      );
    }
    const runner = txClient || pool;
    let done = false;
    let result;
    let error;
    runner.query(text, params, (err, res) => {
      error = err;
      result = res;
      done = true;
    });
    deasync.loopWhile(() => !done);
    if (error) throw error;
    return result;
  }

  function checkoutClient() {
    const deasync = getDeasync();
    if (!deasync) {
      throw new Error(
        "Postgres sync driver requires deasync (installed on Vercel Linux). Deploy to Vercel or use SQLite locally without DATABASE_URL.",
      );
    }
    let done = false;
    let client;
    let error;
    pool.connect((err, c) => {
      error = err;
      client = c;
      done = true;
    });
    deasync.loopWhile(() => !done);
    if (error) throw error;
    return client;
  }

  function releaseTxClient() {
    if (txClient) {
      txClient.release();
      txClient = null;
    }
  }

  function execChunk(chunk) {
    if (/^BEGIN\b/i.test(chunk)) {
      if (txClient) throw new Error("transaction already active");
      txClient = checkoutClient();
      syncQuery("BEGIN");
      return;
    }
    if (/^COMMIT\b/i.test(chunk)) {
      syncQuery("COMMIT");
      releaseTxClient();
      return;
    }
    if (/^ROLLBACK\b/i.test(chunk)) {
      try {
        syncQuery("ROLLBACK");
      } finally {
        releaseTxClient();
      }
      return;
    }
    syncQuery(chunk);
  }

  class PgStatement {
    constructor(sql) {
      this.sql = toPgParams(sql);
    }

    all(...params) {
      return syncQuery(this.sql, params).rows;
    }

    get(...params) {
      const rows = syncQuery(this.sql, params).rows;
      return rows[0];
    }

    run(...params) {
      const res = syncQuery(this.sql, params);
      return { changes: res.rowCount ?? 0 };
    }
  }

  return {
    dialect: "postgres",
    pool,
    prepare(sql) {
      return new PgStatement(sql);
    },
    exec(sql) {
      for (const chunk of translateSqlBatch(sql)) {
        execChunk(chunk);
      }
    },
    close() {
      releaseTxClient();
      pool.end();
    },
    ping() {
      syncQuery("SELECT 1 AS ok");
    },
  };
}

export function formatPgError(err) {
  const msg = String(err?.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return "Database tables missing. Run supabase/migrations/001_prism_schema.sql in Supabase SQL Editor.";
  }
  if (/password authentication failed/i.test(msg)) {
    return "DATABASE_URL password is wrong. Reset in Supabase → Connect → Session pooler.";
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(msg)) {
    return "Cannot reach Postgres. Use Supabase Session pooler URI (not direct db.* host on Vercel).";
  }
  if (/deasync|Postgres sync driver/i.test(msg)) {
    return "Postgres driver failed to initialize on serverless.";
  }
  if (/function printf\(/i.test(msg)) {
    return "IPAM query incompatible with Postgres (printf). Redeploy the latest API build.";
  }
  return msg;
}
