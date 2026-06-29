import path from "path";
import { fileURLToPath } from "url";
import { createPrismDb } from "prism-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "..", "notes.db");

function initSqliteSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner TEXT DEFAULT 'local',
  title TEXT DEFAULT '',
  content TEXT,
  items TEXT,
  note_type TEXT DEFAULT 'note',
  color TEXT,
  label TEXT,
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  due_date TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(archived, pinned, sort_order);
`);
}

const { db, dialect } = createPrismDb({ sqlitePath: dbPath, sqliteInit: initSqliteSchema });

export default db;
export { dialect as dbDialect };
