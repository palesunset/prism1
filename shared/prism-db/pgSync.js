import { createRequire } from "module";
import pg from "pg";
import { toPgParams, translateSql } from "./translate.js";

const require = createRequire(import.meta.url);
let deasyncModule;
function getDeasync() {
  if (deasyncModule !== undefined) return deasyncModule;
  try {
    deasyncModule = require("deasync");
  } catch {
    deasyncModule = null;
  }
  return deasyncModule;
}

function syncQuery(pool, text, params = []) {
  const deasync = getDeasync();
  if (!deasync) {
    throw new Error(
      "Postgres sync driver requires deasync (installed on Vercel Linux). Deploy to Vercel or use SQLite locally.",
    );
  }
  let done = false;
  let result;
  let error;
  pool.query(text, params, (err, res) => {
    error = err;
    result = res;
    done = true;
  });
  deasync.loopWhile(() => !done);
  if (error) throw error;
  return result;
}

class PgStatement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = toPgParams(sql);
  }

  all(...params) {
    return syncQuery(this.pool, this.sql, params).rows;
  }

  get(...params) {
    const rows = syncQuery(this.pool, this.sql, params).rows;
    return rows[0];
  }

  run(...params) {
    const res = syncQuery(this.pool, this.sql, params);
    return { changes: res.rowCount ?? 0 };
  }
}

function translateSqlBatch(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/PRAGMA\s+\w+[^;]*/gi, ""))
    .filter(Boolean)
    .map((chunk) => translateSql(chunk))
    .join(";\n");
}

export function createPgDb(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    max: 4,
  });

  return {
    dialect: "postgres",
    pool,
    prepare(sql) {
      return new PgStatement(pool, sql);
    },
    exec(sql) {
      const batch = translateSqlBatch(sql);
      if (batch) syncQuery(pool, batch);
    },
    close() {
      pool.end();
    },
  };
}
