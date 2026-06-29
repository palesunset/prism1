/** Promise-based wrapper over node:sqlite DatabaseSync for a unified async db API. */

export function wrapSqliteDb(rawDb) {
  return {
    dialect: "sqlite",
    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      return {
        all: async (...params) => stmt.all(...params),
        get: async (...params) => stmt.get(...params),
        run: async (...params) => stmt.run(...params),
      };
    },
    exec: async (sql) => {
      rawDb.exec(sql);
    },
    close: () => {
      rawDb.close();
    },
    ping: async () => {},
  };
}
