/** Translate common SQLite SQL fragments to Postgres. */

export function translateSql(sql) {
  let out = sql;

  out = out.replace(/datetime\s*\(\s*'now'\s*,\s*'(-?\d+)\s+(\w+)'\s*\)/gi, (_m, n, unit) => {
    const u = unit.toLowerCase().replace(/s$/, "");
    const abs = String(n).replace(/^-/, "");
    const sign = String(n).startsWith("-") ? "-" : "+";
    return `(NOW() ${sign} INTERVAL '${abs} ${u}')`;
  });

  out = out.replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()");
  out = out.replace(/datetime\s*\(\s*([a-zA-Z0-9_."]+)\s*\)/gi, "($1::timestamptz)");

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (/INSERT\s+INTO\s+ip_settings/i.test(out) && !/ON CONFLICT/i.test(out)) {
      out = out.replace(/;\s*$/, "");
      out += " ON CONFLICT (key) DO NOTHING";
    }
  }

  return out;
}

export function toPgParams(sql) {
  let index = 0;
  return translateSql(sql).replace(/\?/g, () => `$${++index}`);
}
