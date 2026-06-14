import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';
import {
  tryInventoryIntent,
  buildInventoryContextBlock,
  formatOzHelp,
} from './ozInventoryIntents.js';
import { orderEquipmentDisplayColumns } from './ozEquipmentDetail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, '..', '..', 'models', 'llama-3.2-3b-instruct-q4_k_m.gguf');

const CURRENT_YEAR = new Date().getFullYear();

const SYSTEM_PROMPT = `You are Oz, a friendly and helpful AI assistant for a Data Center Equipment Inventory system.

## DATABASE SCHEMA (SQLite, read-only)
You may query only these tables:

**sites**
- id TEXT PRIMARY KEY
- name TEXT NOT NULL
- plaid TEXT UNIQUE NOT NULL
- area TEXT NOT NULL (legacy region grouping; often mirrored into territory)
- territory TEXT (preferred label when set; otherwise use area)
- region TEXT NOT NULL
- address TEXT, lat REAL, lng REAL
- router_type TEXT, router_types TEXT (optional metadata)
- created_at TEXT, updated_at TEXT

**equipment**
- id TEXT PRIMARY KEY
- site_id TEXT NOT NULL (FK → sites.id)
- vendor TEXT NOT NULL, model TEXT NOT NULL, serial_number TEXT NOT NULL
- network_element TEXT, router_type TEXT, chassis_slot_count INTEGER, ip_address TEXT, software_version TEXT, descriptor_version TEXT
- end_of_life TEXT (ISO or similar date string)
- status TEXT (e.g. Active, Decommissioned, Maintenance, Spare)
- rack_position TEXT
- created_at TEXT, updated_at TEXT

**equipment_bays**
- id TEXT PRIMARY KEY
- equipment_id TEXT NOT NULL (FK → equipment.id)
- slot_index INTEGER NOT NULL, label TEXT, is_utilized INTEGER (0 or 1)
- created_at TEXT, updated_at TEXT

**slots**
- id TEXT PRIMARY KEY
- equipment_id TEXT NOT NULL (FK → equipment.id)
- slot_name TEXT NOT NULL, total_ports INTEGER NOT NULL
- created_at TEXT

**ports**
- id TEXT PRIMARY KEY
- slot_id TEXT NOT NULL (FK → slots.id)
- port_number INTEGER NOT NULL, is_utilized INTEGER (0 or 1), description TEXT
- created_at TEXT, updated_at TEXT

For **territory** in results, prefer: \`COALESCE(NULLIF(TRIM(s.territory), ''), s.area)\` when joining sites as \`s\`.

## SITE → EQUIPMENT → SLOTS → PORTS (full drill-down)
You can answer everything from **site summary** down to **individual ports** by joining in this order:
\`sites s\` → \`equipment e ON e.site_id = s.id\` → \`slots sl ON sl.equipment_id = e.id\` → \`ports p ON p.slot_id = sl.id\`

Typical patterns:
- **One site’s details + how many devices:** \`SELECT s.*, COUNT(e.id) AS equipment_count FROM sites s LEFT JOIN equipment e ON e.site_id = s.id WHERE LOWER(s.name) LIKE '%nyc%' GROUP BY s.id\`
- **List each device (not just counts by vendor):** \`SELECT e.vendor, e.model, e.serial_number, e.status, e.router_type, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id ORDER BY s.name, e.vendor LIMIT 50\`
- **All ports for one device (by serial):** \`SELECT s.name AS site_name, e.serial_number, sl.slot_name, p.port_number, p.is_utilized, p.description FROM ports p JOIN slots sl ON p.slot_id = sl.id JOIN equipment e ON sl.equipment_id = e.id JOIN sites s ON e.site_id = s.id WHERE e.serial_number LIKE '%SN121%' ORDER BY p.port_number LIMIT 200\`
- **Ports at a site:** join the chain and \`WHERE s.id = ?\` or \`LOWER(s.name) LIKE '%cebu%'\`

When the user asks **what equipment / which devices / list those / show them**, return **one row per piece of equipment** (vendor, model, serial, status, site). Do **not** answer with only **GROUP BY vendor** unless they explicitly ask for counts per vendor.

## YOUR PERSONALITY
- Be warm, conversational, and concise
- For greetings or casual chat, respond naturally without SQL
- For inventory questions, generate a single **SELECT** (or **WITH … SELECT**) query

## HOW TO RESPOND

1. **Greetings / casual chat** ("Hi", "Thanks", "How are you?"):
   Respond in plain language. **Do not** output JSON or SQL.

2. **Inventory questions**:
   Output **only** a JSON object with a \`sql\` string (one line, no markdown fences):
   {"sql":"SELECT ..."}

## NEVER INVENT INVENTORY DATA (CRITICAL)
- Do **not** output \`{"sites":[...]}\`, \`{"equipment":[...]}\`, or **any** JSON except **exactly**: \`{"sql":"…"}\` with a real **SELECT** on the tables above.
- Do **not** invent cities, regions, or a \`description\` column on \`sites\` — that is not your schema. Every row must come from **SQLite** via \`sql\`.
- For "sites in NCR" / a region name: query the **\`sites\`** table and match **\`name\`, \`region\`, \`territory\`, or \`area\`** with \`LIKE\` (e.g. \`%ncr%\`).

## SQL RULES (CRITICAL)
- **Only** \`SELECT\` or \`WITH … SELECT\` — no writes, no DDL, no PRAGMA/ATTACH/VACUUM
- Use JOINs across sites, equipment, slots, ports, equipment_bays as needed
- Use \`LIKE\` with wildcards for fuzzy name/vendor/site matching when appropriate
- Prefer **LIMIT 50** unless the user clearly asks for more (hard cap 500)
- Valid SQLite syntax; qualify column names when joining

### Places / cities (e.g. "Cebu") — **no \`location\` column**
There is **no** \`location\` column on \`sites\` or \`equipment\`. To filter by place, **\`JOIN sites s ON e.site_id = s.id\`** and use e.g. \`LOWER(s.name) LIKE '%cebu%'\`, or \`LOWER(COALESCE(NULLIF(TRIM(s.territory),''), s.area)) LIKE '%cebu%'\`, or \`LOWER(s.region)\`, or \`LOWER(s.address)\`. Site names live on **\`sites\`**; join from **\`equipment\`**.

### equipment / sites — **no \`type\` column (CRITICAL)**
There is **no** \`equipment.type\`, \`e.type\`, or \`device_type\` column. **Never** use \`.type\` on inventory tables. For router / role codes use **\`router_type\`** (on **\`equipment\`** and optionally **\`sites\`** metadata). For product kind use **\`model\`** or **\`vendor\`**.

### Short follow-ups ("what are those?")
If the user only says **"what are those"** / **"list them"** / **"which ones"**, use the **same site/vendor/serial** intent as their **previous** question and return a **SELECT** that lists rows (equipment + \`site_name\`), not a guessed column like \`location\`.

### Short pivots ("What about NCR?")
If the user says **"What about …?"** / **"How about …?"** (same thread), repeat the **same style of query** as their **last** inventory question (e.g. list equipment per site) but for the **new** place or region. Still **\`JOIN sites s\`**, still **no \`location\`** — use **\`s.name\`**, **\`region\`**, **\`territory\` / \`area\`**, or **\`address\`** with **\`LIKE\`**.

### Total counts (do not use GROUP BY vendor unless they ask for that)
- **"How many sites …?"** → \`SELECT COUNT(*) AS site_count FROM sites\` (no \`GROUP BY\` unless they want breakdown **by** territory, etc.)
- **"How many equipment(s) …?"** (total devices) → \`SELECT COUNT(*) AS equipment_count FROM equipment\` — **not** \`SELECT vendor, COUNT(*) … GROUP BY vendor\` unless they explicitly ask for counts **per vendor** or **by vendor**

## ROUTER TYPE QUERIES (IMPORTANT)
\`router_type\` may have stray spaces or different letter case in the DB. Prefer:
- **P, DR, AGG, BR, RR, FMAGG, AG:** \`UPPER(TRIM(e.router_type)) = 'P'\` (use the table alias you already have, e.g. \`e\`)
- **PEc / PEe** (mixed case): \`LOWER(TRIM(e.router_type)) = 'pec'\` or \`= 'pee'\`

Examples:
- "How many P routers?" → \`SELECT COUNT(*) AS count FROM equipment e WHERE UPPER(TRIM(e.router_type)) = 'P'\`
- "Show core routers" → \`SELECT e.* FROM equipment e WHERE UPPER(TRIM(e.router_type)) = 'P' LIMIT 50\`
- "List edge routers" → \`... WHERE LOWER(TRIM(e.router_type)) IN ('pec', 'pee')\`

Valid codes include: **P**, **DR**, **PEc**, **PEe**, **FMAGG**, **AGG**, **BR**, **RR**, **AG**

## ROUTER TYPE MAPPINGS (equipment.router_type)
- "P router", "core router", "provider" → \`'P'\`
- Customer-facing edge → \`'PEc'\`, network/edge-facing → \`'PEe'\`
- "aggregation", "agg" → \`'AGG'\`; "border" → \`'BR'\`; "route reflector" → \`'RR'\`
- Other codes may exist (e.g. \`'DR'\`, \`'FMAGG'\`, \`'AG'\`)

When listing **equipment** / **devices** / **routers**, always SELECT **site_name** and an **equipment** label column:
\`TRIM(e.vendor) || ' ' || TRIM(e.model) || ' · ' || TRIM(e.serial_number) AS equipment\`
Plus any fields the user asked for (ip_address, router_type, software_version, end_of_life, status, network_element, etc.).
Never return only site_name + one field without identifying the device.

## EXAMPLES

User: "Hi Oz"
Response: "Hello! 👋 I'm Oz, your network inventory assistant. How can I help you today?"

User: "How many P routers do we have?"
Response: {"sql":"SELECT COUNT(*) AS count FROM equipment e WHERE UPPER(TRIM(e.router_type)) = 'P'"}

User: "How many sites do we have?"
Response: {"sql":"SELECT COUNT(*) AS site_count FROM sites"}

User: "What sites are in NCR?" or "List sites in NCR"
Response: {"sql":"SELECT s.id, s.name, s.plaid, s.region, COALESCE(NULLIF(TRIM(s.territory),''), s.area) AS territory FROM sites s WHERE LOWER(s.name || ' ' || IFNULL(s.region,'') || ' ' || IFNULL(s.territory,'') || ' ' || s.area) LIKE '%ncr%' LIMIT 50"}

User: "How many equipment do we have?" or "How many equipments?"
Response: {"sql":"SELECT COUNT(*) AS equipment_count FROM equipment"}

User: "How many routers?" (generic — not asking for P / AGG / edge codes)
Response: {"sql":"SELECT COUNT(*) AS router_count FROM equipment"}

User: "How many equipment in Cebu?"
Response: {"sql":"SELECT COUNT(*) AS equipment_count FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(s.name) LIKE '%cebu%' OR LOWER(COALESCE(NULLIF(TRIM(s.territory),''), s.area)) LIKE '%cebu%' OR LOWER(s.region) LIKE '%cebu%'"}

User: "Show me Cisco gear in NYC"
Response: {"sql":"SELECT e.*, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(e.vendor) LIKE '%cisco%' AND LOWER(s.name) LIKE '%nyc%' LIMIT 50"}

User: "What equipment do we have?" or "List those devices"
Response: {"sql":"SELECT e.vendor, e.model, e.serial_number, e.status, e.router_type, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id ORDER BY s.name, e.vendor, e.model LIMIT 50"}

User: "Show ports for serial SN121"
Response: {"sql":"SELECT s.name AS site_name, e.serial_number, sl.slot_name, p.port_number, p.is_utilized, p.description FROM ports p JOIN slots sl ON p.slot_id = sl.id JOIN equipment e ON sl.equipment_id = e.id JOIN sites s ON e.site_id = s.id WHERE e.serial_number LIKE '%SN121%' ORDER BY sl.slot_name, p.port_number LIMIT 200"}

User: "What's the utilization of LON-DC1?"
Response: {"sql":"SELECT s.name AS site_name, COUNT(p.id) AS total_ports, SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END) AS utilized_ports FROM sites s LEFT JOIN equipment e ON e.site_id = s.id LEFT JOIN slots sl ON sl.equipment_id = e.id LEFT JOIN ports p ON p.slot_id = sl.id WHERE LOWER(s.name) LIKE '%lon%' GROUP BY s.id, s.name LIMIT 20"}

User: "Equipment reaching EOL this year"
Response: {"sql":"SELECT s.name AS site_name, TRIM(e.vendor) || ' ' || TRIM(e.model) || ' · ' || TRIM(e.serial_number) AS equipment, TRIM(e.router_type) AS router_type, e.end_of_life FROM equipment e JOIN sites s ON e.site_id = s.id WHERE e.end_of_life IS NOT NULL AND (e.end_of_life LIKE '${CURRENT_YEAR}%' OR e.end_of_life LIKE '%/${CURRENT_YEAR}%' OR e.end_of_life LIKE '%${CURRENT_YEAR}%') ORDER BY e.end_of_life LIMIT 50"}

User: "Show P router end of life"
Response: {"sql":"SELECT s.name AS site_name, TRIM(e.vendor) || ' ' || TRIM(e.model) || ' · ' || TRIM(e.serial_number) AS equipment, TRIM(e.router_type) AS router_type, e.end_of_life FROM equipment e JOIN sites s ON e.site_id = s.id WHERE UPPER(TRIM(e.router_type)) = 'P' ORDER BY (e.end_of_life IS NULL OR TRIM(e.end_of_life) = ''), e.end_of_life, s.name LIMIT 50"}

User: "Show software version for Nokia equipment"
Response: {"sql":"SELECT e.software_version, e.model, e.serial_number, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(e.vendor) LIKE '%nokia%' ORDER BY s.name LIMIT 50"}

User: "List IP address and router type for Active P routers"
Response: {"sql":"SELECT e.ip_address, TRIM(e.router_type) AS router_type, e.serial_number, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(TRIM(e.status)) = 'active' AND UPPER(TRIM(e.router_type)) = 'P' ORDER BY s.name, e.serial_number LIMIT 50"}

User: "Show network element, model, serial, and status at VALERO"
Response: {"sql":"SELECT COALESCE(NULLIF(TRIM(e.network_element), ''), e.model) AS network_element, e.model, e.serial_number, e.status, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(s.name) LIKE '%valero%' ORDER BY s.name, e.serial_number LIMIT 50"}

User: "Thanks!"
Response: "You're welcome! 😊 Let me know if you need anything else."

Now respond to the user's message naturally.`;

/** Common typos / STT so "how many" intent still matches (e.g. hoaw → how). */
function normalizeQueryTypos(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\bhoaw\b/g, 'how')
    .replace(/\bhwo\b/g, 'how');
}

let llamaModule = null;
let loadedModel = null;
let modelLoadError = null;
/** Dedupe concurrent model load attempts from warmup + first chat. */
let ozInitInFlight = null;

async function getLlamaModule() {
  if (llamaModule) return llamaModule;
  try {
    llamaModule = await import('node-llama-cpp');
    return llamaModule;
  } catch (e) {
    modelLoadError = `node-llama-cpp failed to load: ${e.message}`;
    return null;
  }
}

function tryParseLenientJson(str) {
  const s = String(str).trim();
  if (!s || s[0] !== '{') return null;
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/**
 * Model replied with JSON that is not our required {"sql":"SELECT ..."} shape.
 * Those objects are usually hallucinated (e.g. {"sites":[{"description":...}]}) and must not be shown to the user.
 */
function isDisallowedNonSqlModelJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw.startsWith('{')) return false;
  const firstLine = raw.split('\n')[0].trim();
  let obj = tryParseLenientJson(firstLine);
  if (!obj) obj = tryParseLenientJson(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (typeof obj.sql === 'string' && obj.sql.trim().length > 0) return false;
  return true;
}

/** Remove single-quoted string literals so checks do not trip on ';' or keywords inside strings. */
function stripSingleQuotedStrings(sql) {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      out += "''";
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
  }
  return out;
}

const SQL_TABLE_SKIP = new Set([
  'inner',
  'left',
  'right',
  'cross',
  'natural',
  'outer',
  'join',
  'where',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'on',
  'using',
  'select',
  'distinct',
  'union',
  'all',
  'except',
  'intersect',
  'and',
  'or',
  'not',
  'as',
  'case',
  'when',
  'then',
  'else',
  'end',
]);

const ALLOWED_TABLES = new Set(['sites', 'equipment', 'slots', 'ports', 'equipment_bays']);

/** Collect table names after FROM/JOIN, including inside parenthesized subqueries. */
function collectReferencedTablesDeep(sqlNoStrings) {
  const found = new Set();
  function walk(s) {
    const re = /\b(?:FROM|JOIN)\s+/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      let i = m.index + m[0].length;
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '(') {
        let depth = 1;
        const innerStart = i + 1;
        i++;
        while (i < s.length && depth > 0) {
          if (s[i] === '(') depth++;
          else if (s[i] === ')') depth--;
          i++;
        }
        walk(s.slice(innerStart, i - 1));
        continue;
      }
      let raw = '';
      while (i < s.length && /["`\w]/i.test(s[i])) raw += s[i++];
      const name = raw.replace(/["`]/g, '').toLowerCase();
      if (name && !SQL_TABLE_SKIP.has(name)) found.add(name);
    }
  }
  walk(sqlNoStrings);
  return [...found];
}

/**
 * Validate that a SQL query is safe (read-only, allowed tables).
 */
function validateSqlQuery(sql) {
  if (sql == null || typeof sql !== 'string') {
    throw new Error('Invalid SQL');
  }
  const t = sql.trim();
  if (!t) throw new Error('Empty SQL');

  if (/--|\/\*/.test(t)) {
    throw new Error('SQL comments are not allowed');
  }

  const stripped = stripSingleQuotedStrings(t);

  if (
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH|VACUUM|PRAGMA|REINDEX|ANALYZE|EXPLAIN)\b/i.test(
      stripped
    ) ||
    /\bREPLACE\s+INTO\b/i.test(stripped)
  ) {
    throw new Error('Only read-only SELECT queries are allowed');
  }

  if (/\bsqlite_\w+/i.test(stripped)) {
    throw new Error('System tables are not allowed');
  }

  if (stripped.includes(';')) {
    throw new Error('Multiple statements are not allowed');
  }

  if (!/^\s*(WITH|SELECT)\b/is.test(t)) {
    throw new Error('Query must begin with SELECT or WITH');
  }

  const tables = collectReferencedTablesDeep(stripped);
  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Table not allowed: ${table}`);
    }
  }

  return true;
}

function ensureSelectLimit(sql, defaultLimit, hardMax) {
  const trimmed = sql.replace(/;\s*$/, '').trim();
  if (!/\blimit\s+\d+/i.test(trimmed)) {
    return `${trimmed} LIMIT ${defaultLimit}`;
  }
  return trimmed.replace(/\blimit\s+(\d+)/gi, (_, n) => {
    const v = Math.min(parseInt(n, 10) || 0, hardMax);
    return `LIMIT ${v}`;
  });
}

/** Types where equality is safe via UPPER(TRIM(col)) (single uppercase token). */
const ROUTER_TYPE_UPPER_SET = new Set(['P', 'DR', 'FMAGG', 'AGG', 'BR', 'RR', 'AG']);

/**
 * Normalize simple `router_type = '…'` / `alias.router_type = '…'` predicates so
 * trailing spaces and case variants (e.g. 'p', 'P ') still match. PEc/PEe use LOWER.
 */
/**
 * Models often invent `e.type` / `alias.type`; no such column exists — map to router_type.
 * Schema has no `.type` column on allowed tables; safe for inventory SELECTs we allow.
 */
function normalizePhantomTypeColumnToRouterType(sql) {
  return String(sql ?? '').replace(/\b([a-z_][\w]*)\.type\b/gi, '$1.router_type');
}

function normalizeRouterTypeInSql(sql) {
  return sql.replace(
    /(?<![\w])(?:(\w+)\.)?router_type\s*=\s*(['"])([^'"]*)\2/gi,
    (match, qual, _quote, value) => {
      const col = qual ? `${qual}.router_type` : 'router_type';
      const v = String(value ?? '').trim();
      if (!v) return match;
      const lower = v.toLowerCase();
      if (lower === 'pec') return `LOWER(TRIM(${col})) = 'pec'`;
      if (lower === 'pee') return `LOWER(TRIM(${col})) = 'pee'`;
      const upper = v.toUpperCase();
      if (ROUTER_TYPE_UPPER_SET.has(upper)) {
        return `UPPER(TRIM(${col})) = '${upper}'`;
      }
      return match;
    }
  );
}

/**
 * Replace common mistaken LLM SQL for simple "how many sites / equipment" totals.
 */
function coerceInventoryTotalCountSql(sql, userMessage) {
  const q = normalizeQueryTypos(userMessage);
  const flat = sql.trim().replace(/\s+/g, ' ').toLowerCase();

  const asksSiteTotal =
    /\bhow many\s+sites?\b/.test(q) ||
    (/\bhow many\b/.test(q) &&
      /\bsites?\b/.test(q) &&
      !/\bequipments?\b/.test(q) &&
      !/\brouter(s)?\b/.test(q));
  if (asksSiteTotal) {
    if (!/\bwhere\b/.test(flat)) {
      return 'SELECT COUNT(*) AS site_count FROM sites';
    }
    return sql;
  }

  const asksEquipmentTotal = /\bhow many\b/.test(q) && /\bequipments?\b/.test(q);
  if (asksEquipmentTotal) {
    const badVendorRollup = /\bgroup\s+by\b/.test(flat) && /\bvendor\b/.test(flat);
    const hasWhere = /\bwhere\b/.test(flat);
    if (badVendorRollup && !hasWhere) {
      return 'SELECT COUNT(*) AS equipment_count FROM equipment';
    }
    return sql;
  }

  return sql;
}

function debugLogRouterTypesInDb() {
  if (!process.env.DEBUG_OZ) return;
  try {
    const rawTypes = db
      .prepare(
        `SELECT TRIM(router_type) AS router_type, COUNT(*) AS count
         FROM equipment
         WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
         GROUP BY TRIM(router_type)
         ORDER BY count DESC`
      )
      .all();
    console.log('Oz DEBUG distinct TRIM(router_type) in DB:', rawTypes);
  } catch (e) {
    console.warn('Oz DEBUG router_type probe failed:', e?.message || e);
  }
}

/**
 * Execute a validated SQL query and return structured results.
 */
function executeSqlQuery(sql, userMessage = '') {
  try {
    validateSqlQuery(sql);
    const trimmed = sql.trim();
    if (process.env.DEBUG_OZ) debugLogRouterTypesInDb();
    const dePhantom = normalizePhantomTypeColumnToRouterType(trimmed);
    if (process.env.DEBUG_OZ && dePhantom !== trimmed) {
      console.log('Oz SQL .type → .router_type:\n  before:', trimmed, '\n  after: ', dePhantom);
    }
    const normalized = normalizeRouterTypeInSql(dePhantom);
    if (process.env.DEBUG_OZ && normalized !== trimmed) {
      console.log('Oz SQL router_type normalization:\n  before:', trimmed, '\n  after: ', normalized);
    }
    const coerced = coerceInventoryTotalCountSql(normalized, userMessage);
    if (process.env.DEBUG_OZ && coerced !== normalized) {
      console.log('Oz SQL count coercion:\n  before:', normalized, '\n  after: ', coerced);
    }
    validateSqlQuery(coerced);
    const bounded = ensureSelectLimit(coerced, 50, 500);
    if (process.env.DEBUG_OZ) console.log('Oz SQL (final):', bounded);
    const data = db.prepare(bounded).all();
    return { success: true, rowCount: data.length, data };
  } catch (error) {
    console.error('Oz SQL error:', error?.message || error);
    return { success: false, error: error?.message || String(error) };
  }
}

function escapeMdCell(v) {
  if (v == null || v === '') return '—';
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const SQL_FOLLOWUPS = [
  'Want to narrow this by site, vendor, or status?',
  'Should I group or filter this differently (e.g. by site, vendor, or status)?',
  'Would you like port utilization for one of these sites?',
];

function pickSqlFollowup() {
  return SQL_FOLLOWUPS[Math.floor(Math.random() * SQL_FOLLOWUPS.length)];
}

function isNumericScalar(v) {
  if (v == null || v === '') return false;
  if (typeof v === 'number' && !Number.isNaN(v)) return true;
  if (typeof v === 'bigint') return true;
  return /^-?\d+(\.\d+)?$/.test(String(v).trim());
}

/** Single-row aggregate like COUNT(*), SUM(x), or alias `n` / `total`. */
function looksLikeSingleAggregateCount(row) {
  const keys = Object.keys(row);
  if (keys.length !== 1) return false;
  const key = keys[0];
  if (!isNumericScalar(row[key])) return false;
  const kn = String(key).trim();
  return (
    /^count\b/i.test(kn) ||
    /^count\s*\(/i.test(kn) ||
    /^total\b/i.test(kn) ||
    /^sum\b/i.test(kn) ||
    /^avg\b/i.test(kn) ||
    /^min\b/i.test(kn) ||
    /^max\b/i.test(kn) ||
    /^(n|cnt|num|qty)$/i.test(kn) ||
    /^(site_count|equipment_count)$/i.test(kn)
  );
}

function isPOrCoreRouterCountQuestion(question) {
  const q = normalizeQueryTypos(question);
  return (
    /\bp\s+routers?\b/.test(q) ||
    /\bcore\s+routers?\b/.test(q) ||
    /\bprovider\s*\/\s*core\b/.test(q) ||
    (/\bhow many\b/.test(q) && /\bp\b/.test(q) && /\brouter/.test(q))
  );
}

function isSiteCountQuestion(question) {
  const q = normalizeQueryTypos(question);
  return (
    /\bhow many\s+sites?\b/.test(q) ||
    /\bnumber\s+of\s+sites?\b/.test(q) ||
    /\bsite\s+count\b/.test(q) ||
    (/\bhow many\b/.test(q) && /\bsites?\b/.test(q) && !/\bequipments?\b/.test(q))
  );
}

function markdownRouterTypeBreakdown() {
  try {
    const rows = db
      .prepare(
        `SELECT TRIM(router_type) AS router_type, COUNT(*) AS count
         FROM equipment
         WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
         GROUP BY TRIM(router_type)
         ORDER BY count DESC`
      )
      .all();
    if (!rows.length) {
      return 'No **router_type** values are set on equipment yet (or all are blank after trim).';
    }
    let out = 'Here is what is stored (after **TRIM**) in **equipment.router_type**:\n';
    for (const r of rows) {
      out += `• **${escapeMdCell(r.router_type)}**: ${r.count} device(s)\n`;
    }
    return out.trimEnd();
  } catch {
    return 'Could not load router type breakdown from the database.';
  }
}

function summarizeAggregateCount(count, originalQuestion) {
  const q = normalizeQueryTypos(originalQuestion);
  if (isSiteCountQuestion(originalQuestion)) {
    return `You have **${count}** data center site${count === 1 ? '' : 's'} on record.`;
  }
  if (
    /\bp\s+routers?\b|\bprovider\s*\/\s*core\b|\bcore\s+routers?\b|\bhow many\s+p\b/i.test(q) ||
    /\bcount\b.*\bp\b|\bp\b.*\brouter/i.test(q)
  ) {
    return `There ${count === 1 ? 'is' : 'are'} **${count}** P (Provider/Core) router${count === 1 ? '' : 's'} in the inventory.`;
  }
  if (
    /\bhow many\b/i.test(q) &&
    /\b(equipments?|devices?|routers?|switches?|pieces?\s+of\s+equipment)\b/i.test(q)
  ) {
    return `You have **${count}** equipment record${count === 1 ? '' : 's'} in the inventory.`;
  }
  if (/\bhow many\b/i.test(q)) {
    return `The answer is **${count}**.`;
  }
  return `**${count}**`;
}

/** Typical TEXT UUID primary keys in this app — hide from chat tables for readability. */
function isLikelyUuidText(v) {
  const s = String(v ?? '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Omit internal id / *_id columns when every sampled value is a UUID (noise in chat).
 * If you need ids in the answer, ask explicitly (e.g. "include site id").
 */
function filterMarkdownDisplayColumns(keys, rows) {
  return keys.filter((col) => {
    const lc = String(col).toLowerCase();
    const isInternalKey = lc === 'id' || lc.endsWith('_id');
    if (!isInternalKey) return true;
    const samples = [];
    for (const r of rows) {
      const v = r[col];
      if (v == null || String(v).trim() === '') continue;
      samples.push(String(v).trim());
      if (samples.length >= 12) break;
    }
    if (samples.length === 0) return false;
    return !samples.every(isLikelyUuidText);
  });
}

/**
 * Format SQL results conversationally (summary + markdown table + suggestion).
 */
function formatSqlErrorHint(errorText) {
  const err = String(errorText ?? '');
  if (/no such column:.*\blocation\b/i.test(err)) {
    return (
      '\n\nThere is no **location** column. Join **equipment** to **sites** and filter with **s.name**, **territory**, **region**, or **address** (e.g. `LOWER(s.name) LIKE \'%cebu%\'`).'
    );
  }
  return '';
}

function formatUtilizationIntro(data, originalQuestion) {
  const q = normalizeQueryTypos(originalQuestion);
  if (data.length === 1) {
    const r = data[0];
    const total = Number(r.total_ports) || 0;
    const used = Number(r.utilized_ports) || 0;
    const pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';
    const name = r.site_name || 'This site';
    if (total === 0) {
      return `**${escapeMdCell(name)}** has no port records in the inventory yet.\n\n`;
    }
    return `**${escapeMdCell(name)}** is at **${pct}%** port utilization — **${used}** of **${total}** ports in use.\n\n`;
  }
  if (/\bby site\b/.test(q) || data.length > 1) {
    return `Here is **port utilization by site** (${data.length} site${data.length !== 1 ? 's' : ''} with ports):\n\n`;
  }
  return `Port utilization summary:\n\n`;
}

function formatRouterTypeIntro(rowCount) {
  return `Equipment breakdown by **router type** (${rowCount} type${rowCount !== 1 ? 's' : ''}):\n\n`;
}

function formatVendorDistributionIntro(rowCount) {
  return `Top vendors in your inventory (${rowCount} vendor${rowCount !== 1 ? 's' : ''}):\n\n`;
}

function formatEquipmentListIntro(data, originalQuestion) {
  const q = normalizeQueryTypos(originalQuestion);
  const sites = [...new Set(data.map((r) => r.site_name).filter(Boolean))];
  if (sites.length === 1) {
    return `Equipment at **${escapeMdCell(sites[0])}** (${data.length} device${data.length !== 1 ? 's' : ''}):\n\n`;
  }
  if (/\bnokia\b/i.test(q) || /\bcisco\b/i.test(q)) {
    const vendorMatch = q.match(/\b(nokia|cisco|juniper|huawei)\b/i);
    if (vendorMatch) {
      return `**${vendorMatch[1].toUpperCase()}** equipment (${data.length} row${data.length !== 1 ? 's' : ''}):\n\n`;
    }
  }
  if (/\bp\s+router|\bcore router|\bdr router|\bedge router\b/i.test(q)) {
    return `Matching routers (${data.length} device${data.length !== 1 ? 's' : ''}):\n\n`;
  }
  if (data.length === 1) return 'Here is **1** matching device:\n\n';
  return `Here are **${data.length}** matching devices:\n\n`;
}

function formatEolIntro(data, originalQuestion) {
  const q = normalizeQueryTypos(originalQuestion);
  const rtLabel = /\bp\s+router|\bcore router\b/i.test(q)
    ? 'P (core) router'
    : /\bdr router\b/i.test(q)
      ? 'DR router'
      : null;
  const withDate = data.filter((r) => r.end_of_life != null && String(r.end_of_life).trim()).length;
  const label = rtLabel ? `**${rtLabel}** end-of-life` : '**End-of-life** schedule';
  return `${label} — **${withDate}** of **${data.length}** device${data.length !== 1 ? 's' : ''} with a date set:\n\n`;
}

function orderDisplayColumns(columns, originalQuestion) {
  return orderEquipmentDisplayColumns(columns);
}

function formatEmptySitesIntro(rowCount) {
  if (rowCount === 0) {
    return 'Good news — **every site** in the inventory has at least one piece of equipment.\n\n';
  }
  return `These **${rowCount}** site${rowCount !== 1 ? 's have' : ' has'} **no equipment** on record:\n\n`;
}

function buildTabularIntro(columns, rowCount, data, originalQuestion) {
  const cols = columns.map((c) => String(c).toLowerCase());
  const q = normalizeQueryTypos(originalQuestion);

  if (cols.includes('total_ports') && cols.includes('utilized_ports')) {
    return formatUtilizationIntro(data, originalQuestion);
  }
  if (cols.includes('router_type') && cols.includes('equipment_count') && rowCount <= 20) {
    return formatRouterTypeIntro(rowCount);
  }
  if (cols.includes('vendor') && cols.includes('equipment_count') && !cols.includes('site_name')) {
    return formatVendorDistributionIntro(rowCount);
  }
  if (cols.includes('serial_number') && cols.includes('site_name')) {
    return formatEquipmentListIntro(data, originalQuestion);
  }
  if (cols.includes('equipment') && cols.includes('site_name')) {
    return formatEquipmentListIntro(data, originalQuestion);
  }
  if (cols.includes('end_of_life') && cols.includes('site_name')) {
    return formatEolIntro(data, originalQuestion);
  }
  if (
    cols.includes('plaid') &&
    cols.includes('name') &&
    !cols.includes('equipment_count') &&
    /\b(no equipment|empty|without equipment)\b/i.test(q)
  ) {
    return formatEmptySitesIntro(rowCount);
  }
  if (looksLikeSitesOnlyResult(columns)) {
    if (rowCount === 1) return 'Here is **1** site:\n\n';
    return `Here are **${rowCount}** sites from your inventory:\n\n`;
  }
  if (rowCount === 1) return 'Here is **1** matching row:\n\n';
  return `Here are **${rowCount}** rows from the inventory:\n\n`;
}

function formatSqlResults(results, originalQuestion) {
  if (!results.success) {
    const hint = formatSqlErrorHint(results.error);
    return (
      `I could not run that query safely. **${escapeMdCell(results.error)}**${hint}\n\n` +
      'Try rephrasing, or ask for a simpler filter (site name, vendor, or serial).'
    );
  }

  const { rowCount, data } = results;

  if (rowCount === 0) {
    if (isPOrCoreRouterCountQuestion(originalQuestion)) {
      return (
        `I searched the inventory and **did not find any rows** for that query.\n\n${markdownRouterTypeBreakdown()}\n\n` +
        `Try asking for **equipment where UPPER(TRIM(router_type)) = 'P'**, or list a specific site.`
      );
    }
    return (
      'I searched the inventory and **did not find any rows** that match.\n\n' +
      'Try a broader site or vendor name, or check spelling.'
    );
  }

  const row0 = data[0];
  const keys = Object.keys(row0);

  if (rowCount === 1 && looksLikeSingleAggregateCount(row0)) {
    const count = Math.trunc(Number(row0[keys[0]]));
    const lead = summarizeAggregateCount(count, originalQuestion);
    let follow;
    if (count === 0 && isPOrCoreRouterCountQuestion(originalQuestion)) {
      follow =
        `That count is still **0** after normalizing **router_type** (trim + case) on the server.\n\n${markdownRouterTypeBreakdown()}\n\nWould you like to **list equipment** for one of these types, or see all equipment?`;
    } else if (count === 0) {
      follow = `If you expected matches, try broadening **WHERE** filters or checking spelling.\n\n${pickSqlFollowup()}`;
    } else if (isSiteCountQuestion(originalQuestion)) {
      follow =
        'Want a **table of all sites** (name, PLAID, territory, region), or details for one site name?';
    } else if (
      /\bhow many\b/i.test(normalizeQueryTypos(originalQuestion)) &&
      /\bequipments?\b/i.test(normalizeQueryTypos(originalQuestion))
    ) {
      const qn = normalizeQueryTypos(originalQuestion);
      const place = qn.match(/\bin\s+([a-z0-9][a-z0-9\s-]{0,40})/i);
      if (place) {
        const p = place[1].trim();
        follow = `Want each device there? Ask: **List all equipment in ${p}** (vendor, model, serial, site) — use **JOIN sites** and **s.name** / territory, not a **location** column.`;
      } else {
        follow =
          'Want each device listed? Ask: **List all equipment** (vendor, model, serial, status, site).';
      }
    } else {
      follow = 'Want to go deeper on **sites**, **equipment**, or **ports** next?';
    }
    return `${lead}\n\n${follow}`;
  }

  const columns = orderDisplayColumns(filterMarkdownDisplayColumns(keys, data), originalQuestion);
  const intro = buildTabularIntro(columns, rowCount, data, originalQuestion);
  let table = `| ${columns.map((c) => escapeMdCell(c)).join(' | ')} |\n`;
  table += `|${columns.map(() => ' --- ').join('|')}|\n`;
  for (const row of data) {
    table += `| ${columns.map((col) => escapeMdCell(row[col])).join(' | ')} |\n`;
  }

  const follow = pickTabularFollowup(columns, rowCount, originalQuestion);

  return `${intro}${table}\n\n${follow}`;
}

/** Result columns look like rows from **sites** (not equipment joined with site_name). */
function looksLikeSitesOnlyResult(columns) {
  const cols = columns.map((c) => String(c).toLowerCase());
  if (cols.includes('vendor') || cols.includes('serial_number') || cols.includes('router_type')) return false;
  if (cols.includes('site_name')) return false;
  if (cols.includes('plaid')) return true;
  if (cols.includes('name') && (cols.includes('region') || cols.includes('territory') || cols.includes('area')))
    return true;
  return false;
}

const SITE_TABLE_FOLLOWUPS = [
  'Want **equipment** listed for one site (e.g. VALERO), or **counts by site**?',
  'Want **port utilization** for a site, or to filter this list by **territory** (e.g. T2 only)?',
  'Should I open **full details** for a site, or **compare equipment** between two sites?',
];

function pickSiteTableFollowup() {
  return SITE_TABLE_FOLLOWUPS[Math.floor(Math.random() * SITE_TABLE_FOLLOWUPS.length)];
}

/** Follow-up text suited to the shape of the result (sites, ports, vendor-only aggregates, etc.). */
function pickTabularFollowup(columns, rowCount, originalQuestion) {
  const lower = normalizeQueryTypos(originalQuestion);
  const cols = columns.map((c) => String(c).toLowerCase());

  if (cols.some((c) => c.includes('port')) && cols.some((c) => c.includes('slot') || c.includes('serial'))) {
    return 'Want only **free** or **in-use** ports, or the same view for another serial or site?';
  }
  if (cols.includes('site_name') && cols.includes('serial_number') && cols.includes('port_number')) {
    return 'Want **utilization %** rolled up to the device or site, or another serial?';
  }
  if (cols.includes('site_name') && cols.includes('end_of_life')) {
    return 'Want only devices **with an EOL date set**, or filter by **site** / **vendor**?';
  }

  if (looksLikeSitesOnlyResult(columns)) {
    return pickSiteTableFollowup();
  }

  const hasVendorCol = cols.some((c) => c === 'vendor');
  const hasAggCol = cols.some(
    (c) => c === 'n' || /^count\b/i.test(c) || /^count\s*\(/i.test(c) || /^(total|sum)$/i.test(c)
  );
  const looksVendorOnlyAggregate = rowCount <= 10 && cols.length === 2 && hasVendorCol && hasAggCol;

  if (
    looksVendorOnlyAggregate &&
    /\bwhat are\b|\bwhich\b|\blist\b|\bequipments?\b|\bdevices?\b|\bthose\b|\bthem\b/i.test(lower)
  ) {
    return 'That result is **counts by vendor**. For **each device** (model, serial, site), ask: **List all equipment with vendor, model, serial, status, and site.**';
  }

  if (rowCount > 1) return pickSqlFollowup();
  return 'Want **port-level** detail for a serial, or a different breakdown?';
}

/** Balanced-brace JSON object that contains "sql". */
function extractSqlJsonObject(text) {
  const keyIdx = text.indexOf('"sql"');
  if (keyIdx === -1) return null;
  const start = text.lastIndexOf('{', keyIdx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (obj && typeof obj.sql === 'string') return obj;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractSqlJsonRobust(text) {
  const chunks = [];
  const seen = new Set();
  function add(c) {
    const t = String(c).trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    chunks.push(t);
  }
  add(text);
  for (const line of String(text).split('\n')) add(line.trim());
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fm;
  while ((fm = fenceRe.exec(text)) !== null) add(fm[1]);

  for (const chunk of chunks) {
    let obj = extractSqlJsonObject(chunk);
    if (!obj) obj = tryParseLenientJson(chunk);
    if (obj?.sql && typeof obj.sql === 'string') return obj.sql.trim();
  }
  return null;
}

/** True if the user is clearly asking for inventory / DB data (not small talk). */
function hasInventoryQueryIntent(lower) {
  const q = normalizeQueryTypos(lower);
  const queryKeywords = [
    'site',
    'router',
    'switch',
    'equipment',
    'port',
    'utilization',
    'vendor',
    'serial',
    'eol',
    'inventory',
    'data center',
    'datacenter',
    'plaid',
    'bay',
    'slot',
  ];
  if (queryKeywords.some((k) => q.includes(k))) return true;
  if (/\b(show|list|find|display|get|count|how many)\b/i.test(q)) return true;
  return false;
}

/**
 * Check if the message is a greeting or casual chat (not an inventory query).
 */
function isGreetingOrCasual(message) {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (hasInventoryQueryIntent(lower)) return false;

  const phrasePatterns = [
    /\bhi\s+oz\b/i,
    /\bhello\s+oz\b/i,
    /\bhey\s+oz\b/i,
    /\bgood\s+morning\b/i,
    /\bgood\s+afternoon\b/i,
    /\bgood\s+evening\b/i,
    /\bgreetings\b/i,
    /\bhowdy\b/i,
    /\bhiya\b/i,
    /\bwhat(?:'s|s)\s+up\b/i,
    /\bhow\s+are\s+you\b/i,
    /\bhow(?:'s|s)\s+it\s+going\b/i,
    /\bwhat\s+can\s+you\s+do\b/i,
    /\bwho\s+are\s+you\b/i,
    /\bwhat\s+are\s+you\b/i,
    /\bintroduce\s+yourself\b/i,
    /\btell\s+me\s+about\s+yourself\b/i,
  ];
  for (const re of phrasePatterns) {
    if (re.test(lower)) return true;
  }

  if (/^(hi|hello|hey|yo|sup|howdy|hiya)(\s*[!.?])*$/i.test(trimmed)) return true;
  if (/^(hi|hello|hey)\s+there(\s*[!.?])*$/i.test(trimmed)) return true;

  return false;
}

function getGreetingResponse() {
  const greetings = [
    "Hi! I'm **Oz** — I can look up **sites**, **equipment**, and **ports** in your inventory. What do you need?",
    "Hey 👋 I'm **Oz**. Ask me anything about your data centers, gear, or port usage.",
    "Hello! I'm **Oz**, your inventory assistant. What should I check for you?",
    "Hi there! I'm **Oz**. Tell me a site name, vendor, or serial and I’ll dig it up.",
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Thank-you, goodbye, and capability-style replies. Returns null when not a match
 * or when the message is clearly an inventory question.
 */
function getCasualResponse(message) {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (hasInventoryQueryIntent(lower)) return null;

  if (/\b(thank you|thanks)\b/i.test(lower)) {
    const responses = [
      "You're welcome! 😊 Let me know if you need anything else.",
      "Happy to help! 🖥️ Anything else you'd like to know?",
      'Anytime! What else can I help you with?',
      "You're welcome! Feel free to ask more questions about your inventory.",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (/\b(bye|goodbye|see you|cya|farewell)\b/i.test(lower)) {
    const responses = [
      'Goodbye! 👋 Feel free to chat again if you need help with your inventory.',
      "See you later! I'll be here if you need me. 🖥️",
      'Bye for now! Come back anytime you have questions about your network.',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (/\bhow\s+are\s+you\b/i.test(lower) || /\bhow(?:'s|s)\s+it\s+going\b/i.test(lower)) {
    return "I'm running smoothly and ready to help! 💻 How can I assist with your inventory today?";
  }

  if (
    /\bwhat\s+can\s+you\s+do\b/i.test(lower) ||
    /\bcapabilities\b/i.test(lower) ||
    /^help\s*[!?.]*$/i.test(trimmed)
  ) {
    return formatOzHelp();
  }

  return null;
}

/**
 * @param {{ role: string, content: string }[]} conversationHistory
 */
function conversationToChatHistory(conversationHistory) {
  const items = [];
  for (const m of conversationHistory) {
    if (m.role === 'user') items.push({ type: 'user', text: String(m.content ?? '') });
    else if (m.role === 'assistant')
      items.push({ type: 'model', response: [String(m.content ?? '')] });
  }
  return items;
}

export async function initializeOz() {
  if (loadedModel) return { model: loadedModel };
  if (!fs.existsSync(MODEL_PATH)) {
    return null;
  }
  modelLoadError = null;
  const mod = await getLlamaModule();
  if (!mod) return null;
  try {
    const { getLlama } = mod;
    const llama = await getLlama();
    loadedModel = await llama.loadModel({
      modelPath: MODEL_PATH,
      defaultContextFlashAttention: false,
    });
    modelLoadError = null;
    console.log('Oz: Llama model loaded.');
    return { model: loadedModel };
  } catch (e) {
    modelLoadError = e?.message || String(e);
    console.error('Oz model load failed:', modelLoadError);
    return null;
  }
}

/**
 * Start loading the GGUF into memory (non-blocking). Call on server start and on
 * GET /api/chat/status so the FAB shows "loading" then "ready" instead of
 * staying "offline" until the first chat message.
 */
export function ensureOzWarmup() {
  if (!fs.existsSync(MODEL_PATH)) return;
  if (loadedModel) return;
  if (ozInitInFlight) return;
  console.log('Oz: loading model from', MODEL_PATH);
  ozInitInFlight = initializeOz().finally(() => {
    ozInitInFlight = null;
  });
}

export function isOzAvailable() {
  return Boolean(loadedModel) && !modelLoadError;
}

export function getOzStatus() {
  if (loadedModel) {
    return { status: 'ready', message: 'Oz model loaded' };
  }
  if (!fs.existsSync(MODEL_PATH)) {
    return {
      status: 'unavailable',
      message: 'Model file missing. Run npm run download-model in backend.',
    };
  }
  if (modelLoadError) {
    return { status: 'unavailable', message: modelLoadError };
  }
  return {
    status: 'loading',
    message: 'Loading local model…',
  };
}

/**
 * @param {string} userMessage
 * @param {{ role: string, content: string }[]} conversationHistory
 */
function findPreviousUserMessage(conversationHistory) {
  if (!Array.isArray(conversationHistory)) return '';
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    if (m.role === 'user' && String(m.content ?? '').trim()) {
      return String(m.content).trim();
    }
  }
  return '';
}

function isVagueInventoryFollowUp(text) {
  return /^(what are those|what are they|which ones|show those|list them)\b/i.test(String(text ?? '').trim());
}

/** "What about NCR?" style — same thread, new place/filter, short message. */
function isShortPivotInventoryFollowUp(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 140) return false;
  if (/^(what|how) about\b/i.test(t)) return true;
  if (/^and\b/i.test(t) && /\b(ncr|cebu|manila|site|region|equipment|router|vendor)\b/i.test(t)) return true;
  return false;
}

function needsPriorUserInventoryContext(text) {
  return isVagueInventoryFollowUp(text) || isShortPivotInventoryFollowUp(text);
}

/** Inject prior user question so short follow-ups do not hallucinate columns like `location`. */
function enrichInventoryFollowUpPrompt(trimmed, prevUser) {
  const t = trimmed.trim();
  if (!prevUser) return t;
  if (isVagueInventoryFollowUp(t)) {
    return (
      `The user previously asked: "${prevUser}"\n` +
      `Now they say: "${t}"\n\n` +
      'Reply with ONLY one JSON line: a **SELECT** that lists the **equipment** those messages refer to (reuse the same site / place / vendor intent). Use **JOIN sites s ON e.site_id = s.id**. Never use a column named **location** — use **s.name**, **territory**, **region**, or **address** for places. Example: {"sql":"SELECT e.vendor, e.model, e.serial_number, e.status, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id WHERE LOWER(s.name) LIKE \'%cebu%\' LIMIT 50"}'
    );
  }
  if (isShortPivotInventoryFollowUp(t)) {
    return (
      `The user previously asked: "${prevUser}"\n` +
      `Now they say: "${t}"\n\n` +
      'Reply with ONLY one JSON line: **{"sql":"SELECT ..."}**. Use the **same shape** as the earlier answer (e.g. equipment columns + **site_name**), but for the **new** place or region they mention. **JOIN sites s ON e.site_id = s.id**. **Never** use **location** — filter with **LOWER(s.name || \' \' || IFNULL(s.region,\'\') || \' \' || IFNULL(s.territory,\'\') || \' \' || s.area) LIKE** the right pattern (e.g. **%ncr%**).'
    );
  }
  return t;
}

function runIntentOrSql(userMessage) {
  const intent = tryInventoryIntent(userMessage);
  if (!intent) return null;
  if (intent.type === 'direct') return intent.response;
  if (intent.type === 'sql') {
    const results = executeSqlQuery(intent.sql, userMessage);
    return formatSqlResults(results, userMessage);
  }
  return null;
}

export async function processOzQuery(userMessage, conversationHistory = []) {
  const trimmed = String(userMessage ?? '').trim();

  const casualResponse = getCasualResponse(trimmed);
  if (casualResponse) return casualResponse;

  if (isGreetingOrCasual(trimmed)) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return getGreetingResponse();
    }
    return "I'm here to help with your network inventory! What would you like to know?";
  }

  const intentAnswer = runIntentOrSql(trimmed);
  if (intentAnswer) return intentAnswer;

  if (!fs.existsSync(MODEL_PATH)) {
    return 'Oz model is not installed yet. From the `backend` folder run `npm run download-model` (large one-time download), then restart the server.';
  }

  const init = await initializeOz();
  if (!init?.model) {
    return `Oz could not start the local model (${modelLoadError || 'unknown error'}). Check Node version and node-llama-cpp install.`;
  }

  const prevUser = findPreviousUserMessage(conversationHistory);
  const promptForModel = enrichInventoryFollowUpPrompt(trimmed, prevUser);
  const formatContext =
    needsPriorUserInventoryContext(trimmed) && prevUser ? `${prevUser}\n${trimmed}` : trimmed;

  const { LlamaChatSession } = await getLlamaModule();
  const model = loadedModel;

  let context;
  let session;
  try {
    context = await model.createContext({
      contextSize: 4096,
      flashAttention: false,
    });
    const systemPromptWithContext = `${SYSTEM_PROMPT}\n\n${buildInventoryContextBlock()}`;
    session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPromptWithContext,
    });
    const prior = conversationToChatHistory(conversationHistory.slice(-8));
    if (prior.length) session.setChatHistory(prior);

    let lastResponse = '';
    let lastSqlError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      let promptText = promptForModel;
      if (attempt === 1) {
        promptText = `${promptForModel}\n\nReply with ONLY one JSON line (no other text), for example: {"sql":"SELECT e.vendor, e.model, e.serial_number, s.name AS site_name FROM equipment e JOIN sites s ON e.site_id = s.id LIMIT 50"}`;
      } else if (attempt >= 2 && lastSqlError) {
        promptText = `${promptForModel}\n\nYour previous SQL failed with: ${lastSqlError}\nReply with ONLY one corrected JSON line {"sql":"SELECT ..."} using the schema above. Never use a location column.`;
      }

      lastResponse = await session.prompt(promptText, {
        maxTokens: 512,
        temperature: attempt === 0 ? 0.15 : 0.05,
        topP: 0.9,
      });

      if (process.env.DEBUG_OZ) console.log('Oz raw response:', lastResponse);

      const sql = extractSqlJsonRobust(lastResponse);
      if (sql) {
        const results = executeSqlQuery(sql, trimmed);
        if (results.success) return formatSqlResults(results, formatContext);
        lastSqlError = results.error || 'Unknown SQL error';
        if (attempt === 2) return formatSqlResults(results, formatContext);
      }
    }

    const text = String(lastResponse || '').trim();
    if (text && !isDisallowedNonSqlModelJson(text)) return text;
    if (text && isDisallowedNonSqlModelJson(text)) {
      return [
        'I only answer from your real **SQLite** inventory. I must not invent cities, regions, or fabricated **{"sites":[...]}** lists.',
        '',
        'For **sites in NCR**, I must reply with **one** JSON line containing **sql**: a **SELECT** on the **sites** table, matching **name**, **region**, **territory**, or **area** (e.g. **LIKE** with **%ncr%**).',
        '',
        'Please try again, e.g. **List sites in NCR** or **Show all sites**.',
      ].join('\n');
    }
    return (
      'I could not produce a safe **SELECT** for that question.\n\n' +
      'Try asking in smaller pieces (e.g. list sites, count by vendor, or utilization for one site name).'
    );
  } catch (e) {
    console.error('Oz processOzQuery:', e?.message || e, e?.stack);
    return 'I hit an error running the local model. Try a shorter question or restart the server.';
  } finally {
    try {
      session?.dispose?.();
    } catch {
      /* ignore */
    }
    try {
      await context?.dispose?.();
    } catch {
      /* ignore */
    }
  }
}

/** Test helpers — golden-question suite (no LLM). */
export function resolveOzIntent(userMessage) {
  return tryInventoryIntent(userMessage);
}

export function runOzIntentAnswer(userMessage) {
  return runIntentOrSql(userMessage);
}

export function runOzSql(sql, userMessage = '') {
  return executeSqlQuery(sql, userMessage);
}
