import { Router } from 'express';
import db from '../db/index.js';

import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

const OLLAMA_BASE = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'tinyllama:latest';

function extractJsonFilter(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const slice = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

const SEARCH_STOP_WORDS = new Set([
  'what',
  'the',
  'is',
  'are',
  'of',
  'a',
  'an',
  'to',
  'in',
  'on',
  'for',
  'show',
  'find',
  'list',
  'me',
  'please',
  'tell',
  'give',
  'where',
  'this',
  'that',
  'which',
  'about',
  'equipment',
  'site',
  'sites',
  'check',
  'need',
  'want',
  'get',
  'address',
  'how',
  'many',
  'much',
  'there',
  'number',
  'count',
  'total',
  'some',
  'any',
  'when',
  'does',
  'do',
  'have',
  'has',
  'with',
  'from',
  'in',
  'at',
]);

/** One OR-group: any field matches one LIKE pattern (repeated 9x for bound params). */
const ROW_MATCHES_TOKEN = `(
  lower(e.vendor) LIKE ? OR
  lower(e.model) LIKE ? OR
  lower(e.serial_number) LIKE ? OR
  lower(e.status) LIKE ? OR
  lower(s.name) LIKE ? OR
  lower(s.plaid) LIKE ? OR
  lower(s.area) LIKE ? OR
  lower(s.region) LIKE ? OR
  lower(COALESCE(s.address, '')) LIKE ?
)`;

export function searchTokens(raw) {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return [];
  let words = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  words = words.filter((w) => !SEARCH_STOP_WORDS.has(w));
  // No "whole sentence" fallback — if everything was stop words, match all rows (empty token list).
  return words;
}

const SITE_COUNT_EXTRA_STOP_WORDS = new Set([
  'sites',
  'site',
  'here',
  'datacenter',
  'datacenters',
  'inventory',
  'database',
]);

/** Tokens for scoping site counts (same as search, minus words that only refer to “sites” / the app). */
export function searchTokensForSiteCount(raw) {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return [];
  let words = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  words = words.filter((w) => !SEARCH_STOP_WORDS.has(w) && !SITE_COUNT_EXTRA_STOP_WORDS.has(w));
  return words;
}

/** True when the user is asking how many sites / data centers exist (not equipment count). */
export function isSiteCountIntentQuery(raw) {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return false;
  return (
    /\bhow\s+many\s+sites?\b/.test(q) ||
    /\bnumber\s+of\s+sites?\b/.test(q) ||
    /\bhow\s+many\s+data\s*centers?\b/.test(q) ||
    /\bhow\s+many\s+locations?\b/.test(q) ||
    /\bsite\s+count\b/.test(q) ||
    /\btotal\s+sites?\b/.test(q) ||
    /\bcount\b[\s\w]{0,40}\bsites?\b/.test(q)
  );
}

/** True when the user is asking for a quantity (triggers /api/equipment-count). */
export function isCountIntentQuery(raw) {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return false;
  if (isSiteCountIntentQuery(q)) return false;
  return (
    /\bhow\s+many\b/.test(q) ||
    /\bhow\s+much\b/.test(q) ||
    /\bnumber\s+of\b/.test(q) ||
    /\btotal\s+equipment\b/.test(q) ||
    /\bequipment\s+count\b/.test(q) ||
    /\bcount\b[\s\w]{0,40}\bequipment\b/.test(q)
  );
}

function baseEquipmentQuery() {
  return `
    SELECT
      e.id,
      e.vendor,
      e.model,
      e.serial_number,
      e.status,
      e.end_of_life,
      e.rack_position,
      e.site_id,
      s.name AS site_name,
      s.plaid AS site_plaid,
      s.area,
      s.region,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    GROUP BY e.id
  `;
}

/**
 * How many equipment have EOL on or before Dec 31 of this year (equipment-count intent).
 * Returns null if the question is not a count + EOL + year pattern.
 */
export function parseCountEquipmentEolByYearQuery(raw) {
  const q = (raw || '').toString().trim();
  const s = q.toLowerCase();
  if (/\bhow\s+many\s+sites\b/.test(s) || /\bnumber\s+of\s+sites\b/.test(s)) return null;

  const countish =
    /\bhow\s+many\b/.test(s) ||
    /\bnumber\s+of\b/.test(s) ||
    /\btotal\b/.test(s) ||
    /\bcount\b[\s\w]{0,40}\bequipment\b/.test(s);
  if (!countish) return null;

  const aboutEol = /\bend\s+of\s+life\b/.test(s) || /\beol\b/.test(s);
  if (!aboutEol) return null;

  const aboutEquipment =
    /\bequipment\b/.test(s) ||
    /\bdevices?\b/.test(s) ||
    /\bunits?\b/.test(s) ||
    /\bassets?\b/.test(s) ||
    /\bhow\s+many\b/.test(s);
  if (!aboutEquipment) return null;

  let year = null;
  const by = s.match(
    /\b(?:by|before|on\s+or\s+before|through|until|no\s+later\s+than)\s+(\d{4})\b/
  );
  if (by) year = parseInt(by[1], 10);
  if (year == null) {
    const inn = s.match(/\b(?:in|during)\s+(\d{4})\b/);
    if (inn) year = parseInt(inn[1], 10);
  }
  if (year == null || year < 1970 || year > 2100) return null;
  return { year };
}

/** Rows for equipment with non-null EOL on or before YYYY-12-31. */
export async function equipmentWithEolOnOrBeforeYear(year) {
  const y = Number(year);
  if (Number.isNaN(y) || y < 1970 || y > 2100) return [];
  const end = `${y}-12-31`;
  return await db
    .prepare(
      `${baseEquipmentQuery()} HAVING e.end_of_life IS NOT NULL AND e.end_of_life <= ? ORDER BY e.end_of_life, e.vendor, e.model`
    )
    .all(end);
}

/**
 * Parses questions like:
 * - "what equipment will end of life in 2030?"
 * - "equipment eol on 2030"
 *
 * Returns null if it doesn't look like an EOL-year equipment listing question.
 */
export function parseListEquipmentEolInYearQuery(raw) {
  const q = (raw || '').toString().trim();
  const s = q.toLowerCase();
  if (!q) return null;

  const aboutEol = /\bend\s+of\s+life\b/.test(s) || /\beol\b/.test(s);
  if (!aboutEol) return null;

  // Allow "what equipment..." / "list/show equipment..." / "equipment ..."
  const aboutEquipment =
    /\bequipment\b/.test(s) ||
    /\bdevices?\b/.test(s) ||
    /\bunits?\b/.test(s) ||
    /\bassets?\b/.test(s) ||
    /^what\b/.test(s) ||
    /^list\b/.test(s) ||
    /^show\b/.test(s);
  if (!aboutEquipment) return null;

  let year = null;
  const m1 = s.match(/\b(?:in|during|on|for)\s+(\d{4})\b/);
  if (m1) year = parseInt(m1[1], 10);
  if (year == null) {
    const m2 = s.match(/\b(\d{4})\b/);
    if (m2) year = parseInt(m2[1], 10);
  }
  if (year == null || year < 1970 || year > 2100) return null;

  // If it's explicitly count-ish, let the count parser handle it instead.
  if (/\bhow\s+many\b/.test(s) || /\bnumber\s+of\b/.test(s) || /\btotal\b/.test(s)) return null;

  return { year };
}

/** Rows for equipment with non-null EOL in the calendar year YYYY. */
export async function equipmentWithEolInYear(year) {
  const y = Number(year);
  if (Number.isNaN(y) || y < 1970 || y > 2100) return [];
  const start = `${y}-01-01`;
  const end = `${y}-12-31`;
  return await db
    .prepare(
      `${baseEquipmentQuery()} HAVING e.end_of_life IS NOT NULL AND e.end_of_life >= ? AND e.end_of_life <= ? ORDER BY e.end_of_life, e.vendor, e.model`
    )
    .all(start, end);
}

export async function basicTextSearch(query) {
  const raw = (query || '').toString().trim();
  if (!raw) {
    return await db.prepare(`${baseEquipmentQuery()} ORDER BY e.vendor`).all();
  }
  const tokens = searchTokens(raw);
  if (tokens.length === 0) {
    return await db.prepare(`${baseEquipmentQuery()} ORDER BY e.vendor`).all();
  }
  const having = tokens.map(() => ROW_MATCHES_TOKEN).join(' OR ');
  const params = tokens.flatMap((t) => {
    const like = `%${t}%`;
    return [like, like, like, like, like, like, like, like, like];
  });
  return await db.prepare(`${baseEquipmentQuery()} HAVING ${having} ORDER BY e.vendor`).all(...params);
}

function filterHasAnyCriteria(filter) {
  if (!filter || typeof filter !== 'object') return false;
  return Object.keys(filter).some((k) => {
    const v = filter[k];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return !Number.isNaN(v);
    return true;
  });
}

export async function applyFilter(filter) {
  if (!filter || typeof filter !== 'object') {
    return await basicTextSearch('');
  }

  let sql = baseEquipmentQuery();
  const conditions = [];
  const params = [];

  if (filter.vendor) {
    conditions.push('lower(e.vendor) LIKE ?');
    params.push(`%${String(filter.vendor).toLowerCase()}%`);
  }
  if (filter.model) {
    conditions.push('lower(e.model) LIKE ?');
    params.push(`%${String(filter.model).toLowerCase()}%`);
  }
  if (filter.status) {
    conditions.push('e.status = ?');
    params.push(String(filter.status));
  }
  if (filter.site_name) {
    conditions.push('lower(s.name) LIKE ?');
    params.push(`%${String(filter.site_name).toLowerCase()}%`);
  }
  if (filter.plaid) {
    conditions.push('lower(s.plaid) LIKE ?');
    params.push(`%${String(filter.plaid).toLowerCase()}%`);
  }
  if (filter.area) {
    conditions.push('lower(s.area) LIKE ?');
    params.push(`%${String(filter.area).toLowerCase()}%`);
  }
  if (filter.region) {
    conditions.push('lower(s.region) LIKE ?');
    params.push(`%${String(filter.region).toLowerCase()}%`);
  }
  if (filter.address) {
    conditions.push("lower(COALESCE(s.address, '')) LIKE ?");
    params.push(`%${String(filter.address).toLowerCase()}%`);
  }

  const havingParts = [...conditions];
  const minFree = filter.min_free_ports != null ? Number(filter.min_free_ports) : null;
  const maxFree = filter.max_free_ports != null ? Number(filter.max_free_ports) : null;
  const eolBefore = filter.eol_before ? String(filter.eol_before) : null;
  const eolAfter = filter.eol_after ? String(filter.eol_after) : null;

  if (eolBefore) {
    havingParts.push('e.end_of_life IS NOT NULL AND e.end_of_life <= ?');
    params.push(eolBefore);
  }
  if (eolAfter) {
    havingParts.push('e.end_of_life IS NOT NULL AND e.end_of_life >= ?');
    params.push(eolAfter);
  }

  if (havingParts.length) {
    sql += ` HAVING ${havingParts.join(' AND ')}`;
  }

  sql += ' ORDER BY e.vendor';

  let rows = await db.prepare(sql).all(...params);

  if (minFree != null && !Number.isNaN(minFree)) {
    rows = rows.filter((r) => r.total_ports - r.utilized_ports >= minFree);
  }
  if (maxFree != null && !Number.isNaN(maxFree)) {
    rows = rows.filter((r) => r.total_ports - r.utilized_ports <= maxFree);
  }

  return rows;
}

router.post('/equipment-count', async (req, res) => {
  const query = (req.body?.query || '').toString().trim();
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!isCountIntentQuery(query)) {
    return res.status(400).json({
      error:
        'Use a count-style phrase, e.g. "How many equipment", "How many equipment in Davao", or "Total equipment".',
    });
  }

  const eolYear = parseCountEquipmentEolByYearQuery(query);
  const rows = eolYear
    ? await equipmentWithEolOnOrBeforeYear(eolYear.year)
    : await basicTextSearch(query);
  const bySite = new Map();
  for (const r of rows) {
    const sid = r.site_id;
    if (!bySite.has(sid)) {
      bySite.set(sid, {
        site_id: sid,
        site_name: r.site_name,
        site_plaid: r.site_plaid,
        area: r.area,
        region: r.region,
        equipment_count: 0,
      });
    }
    bySite.get(sid).equipment_count += 1;
  }
  const sites = [...bySite.values()].sort((a, b) => b.equipment_count - a.equipment_count);
  res.json({
    query,
    total_equipment: rows.length,
    site_count: sites.length,
    sites,
    note: eolYear
      ? `Equipment with an EOL date on or before ${eolYear.year}-12-31 (only rows that have EOL set). Not the Ollama model.`
      : 'Uses the same keyword rules as search (site name, PLAID, area, region, address, equipment fields). Not the Ollama model.',
  });
});

router.post('/ai-search', async (req, res) => {
  const { query } = req.body || {};
  const q = (query || '').toString().trim();
  if (!q) {
    return res.json({ success: true, fallback: false, results: await basicTextSearch('') });
  }

  try {
    const url = `${OLLAMA_BASE}/api/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `You are a strict JSON generator. Output a single JSON object only (no markdown, no explanation).

Map the user's inventory question to this shape. Use only keys that apply; omit keys you cannot infer.

Fields (all optional except you must output at least one key when possible):
- vendor (string, substring match)
- model (string, substring match)
- status: one of Active, Decommissioned, Maintenance, Spare
- site_name (string, substring match on data center site name)
- plaid (string, substring match on site PLAID code)
- area (string)
- region (string)
- address (string, substring match on site address / city)
- min_free_ports (number)
- max_free_ports (number)
- eol_before (date string YYYY-MM-DD)
- eol_after (date string YYYY-MM-DD)

User query: ${JSON.stringify(q)}

JSON object:`,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status} ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = (data.response || '').trim();
    const filter = extractJsonFilter(text);
    if (!filter) {
      return res.json({
        success: false,
        fallback: true,
        fallbackReason:
          'The model did not return valid JSON. Try setting OLLAMA_MODEL=gemma2:2b in backend/.env (better at JSON than tiny models).',
        results: await basicTextSearch(q),
      });
    }
    if (!filterHasAnyCriteria(filter)) {
      return res.json({
        success: false,
        fallback: true,
        fallbackReason: 'The model returned an empty filter; using keyword search instead.',
        results: await basicTextSearch(q),
      });
    }
    const results = await applyFilter(filter);
    return res.json({ success: true, fallback: false, results });
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Ollama request timed out (120s).' : String(e?.message || e);
    const conn =
      /ECONNREFUSED|fetch failed|network/i.test(msg) || e?.cause?.code === 'ECONNREFUSED'
        ? ` Cannot reach Ollama at ${OLLAMA_BASE}. Is it running?`
        : '';
    return res.json({
      success: false,
      fallback: true,
      fallbackReason: `${msg}.${conn}`.trim(),
      results: await basicTextSearch(q),
    });
  }
});

promisifyRouter(router);

export default router;
