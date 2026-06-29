import pg from "pg";
import { toPgParams, translateSql } from "./translate.js";

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

/** Async Postgres pool — non-blocking for Vercel serverless (no deasync). */
export function createPgDb(connectionString) {
  const normalized = normalizeConnectionString(connectionString);
  const onServerless = Boolean(process.env.VERCEL);
  const pool = new pg.Pool({
    connectionString: normalized,
    ssl: normalized.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    max: onServerless ? 2 : 6,
    idleTimeoutMillis: onServerless ? 5_000 : 20_000,
    connectionTimeoutMillis: onServerless ? 5_000 : 15_000,
    allowExitOnIdle: onServerless,
  });

  pool.on("error", (err) => {
    console.error("[prism-db] Postgres pool error:", err.message);
  });

  let txClient = null;

  async function query(text, params = []) {
    const runner = txClient || pool;
    return runner.query(text, params);
  }

  async function execChunk(chunk) {
    if (/^BEGIN\b/i.test(chunk)) {
      if (txClient) throw new Error("transaction already active");
      txClient = await pool.connect();
      await txClient.query("BEGIN");
      return;
    }
    if (/^COMMIT\b/i.test(chunk)) {
      await query("COMMIT");
      txClient?.release();
      txClient = null;
      return;
    }
    if (/^ROLLBACK\b/i.test(chunk)) {
      try {
        await query("ROLLBACK");
      } finally {
        txClient?.release();
        txClient = null;
      }
      return;
    }
    await query(chunk);
  }

  class PgStatement {
    constructor(sql) {
      this.sql = toPgParams(sql);
    }

    async all(...params) {
      return (await query(this.sql, params)).rows;
    }

    async get(...params) {
      const rows = (await query(this.sql, params)).rows;
      return rows[0];
    }

    async run(...params) {
      const res = await query(this.sql, params);
      return { changes: res.rowCount ?? 0 };
    }
  }

  return {
    dialect: "postgres",
    pool,
    prepare(sql) {
      return new PgStatement(sql);
    },
    async exec(sql) {
      for (const chunk of translateSqlBatch(sql)) {
        await execChunk(chunk);
      }
    },
    async close() {
      if (txClient) {
        txClient.release();
        txClient = null;
      }
      await pool.end();
    },
    async ping() {
      await query("SELECT 1 AS ok");
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
  if (/function printf\(/i.test(msg)) {
    return "IPAM query incompatible with Postgres (printf). Redeploy the latest API build.";
  }
  return msg;
}
