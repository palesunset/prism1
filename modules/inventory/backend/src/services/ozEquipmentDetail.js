/**
 * Shared equipment row SQL for Oz — every device-level answer includes site + equipment label.
 */
import db from '../db/index.js';

export const EQUIPMENT_FIELD_COLS = {
  network_element: `COALESCE(NULLIF(TRIM(e.network_element), ''), e.model) AS network_element`,
  ip_address: 'e.ip_address',
  router_type: 'TRIM(e.router_type) AS router_type',
  software_version: 'e.software_version',
  descriptor_version: 'e.descriptor_version',
  model: 'e.model',
  serial_number: 'e.serial_number',
  end_of_life: 'e.end_of_life',
  status: 'e.status',
  vendor: 'e.vendor',
  site_name: 's.name AS site_name',
  equipment: `TRIM(e.vendor) || ' ' || TRIM(e.model) || ' · ' || TRIM(e.serial_number) AS equipment`,
};

/** Full inventory row (compact — equipment column replaces separate vendor/model/serial). */
export const FULL_EQUIPMENT_DETAIL_FIELDS = [
  'site_name',
  'equipment',
  'network_element',
  'ip_address',
  'router_type',
  'software_version',
  'descriptor_version',
  'end_of_life',
  'status',
];

export const DETAIL_FIELD_ORDER = [
  'site_name',
  'equipment',
  'network_element',
  'ip_address',
  'router_type',
  'software_version',
  'descriptor_version',
  'model',
  'serial_number',
  'end_of_life',
  'status',
  'vendor',
];

function sqlLit(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

/**
 * Resolve SELECT columns: always site_name + equipment, plus anything the user asked for.
 */
export function resolveDetailSelectFields(requested, filters = {}) {
  const req = new Set(Array.isArray(requested) ? requested : []);
  const full =
    req.has('network_element') &&
    req.has('ip_address') &&
    req.has('router_type') &&
    (req.has('software_version') || req.has('descriptor_version')) &&
    req.has('end_of_life') &&
    req.has('status');

  if (full || req.size >= 9) {
    return FULL_EQUIPMENT_DETAIL_FIELDS.filter((f) => EQUIPMENT_FIELD_COLS[f]);
  }

  const set = new Set(['site_name', 'equipment', ...req]);
  if (filters.rt) set.add('router_type');
  if (set.has('equipment')) {
    if (req.has('vendor') === false) set.delete('vendor');
    if (req.has('model') === false) set.delete('model');
    if (req.has('serial_number') === false) set.delete('serial_number');
  }
  return DETAIL_FIELD_ORDER.filter((f) => set.has(f));
}

export function appendEquipmentFilters(sql, filters) {
  const { site, vendor, region, territory, rt, statusFilter, serialHint } = filters;
  let out = sql;
  if (region) out += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
  if (territory) {
    out += ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.territory), ''), s.area))) = LOWER(${sqlLit(territory)})`;
  }
  if (site) out += ` AND s.id = ${sqlLit(site.id)}`;
  if (vendor) out += ` AND LOWER(TRIM(e.vendor)) = LOWER(${sqlLit(vendor)})`;
  if (statusFilter) out += ` AND LOWER(TRIM(e.status)) = LOWER(${sqlLit(statusFilter)})`;
  if (serialHint) out += ` AND e.serial_number LIKE ${sqlLit(`%${serialHint}%`)}`;
  if (rt) {
    if (rt === 'PEe' || rt === 'PEc') out += ` AND LOWER(TRIM(e.router_type)) = ${sqlLit(rt.toLowerCase())}`;
    else out += ` AND UPPER(TRIM(e.router_type)) = ${sqlLit(rt.toUpperCase())}`;
  }
  return out;
}

/**
 * Device-level SELECT — always includes site_name + equipment unless aggregate query.
 */
export function buildEquipmentDetailSql(requestedFields, filters, options = {}) {
  const { eolYear = null } = options;
  const fields = resolveDetailSelectFields(requestedFields, filters);
  const selectCols = fields.map((f) => EQUIPMENT_FIELD_COLS[f]).filter(Boolean);
  let sql = `SELECT ${selectCols.join(', ')}
    FROM equipment e JOIN sites s ON e.site_id = s.id WHERE 1=1`;
  sql = appendEquipmentFilters(sql, filters);
  if (eolYear) {
    sql += ` AND e.end_of_life IS NOT NULL AND (
      e.end_of_life LIKE '${eolYear}%' OR e.end_of_life LIKE '%/${eolYear}%' OR e.end_of_life LIKE '%-${eolYear}%'
    )`;
  }
  if (fields.includes('end_of_life')) {
    sql += ` ORDER BY (e.end_of_life IS NULL OR TRIM(e.end_of_life) = ''), e.end_of_life, s.name LIMIT 50`;
  } else {
    sql += ` ORDER BY s.name, e.vendor, e.serial_number LIMIT 50`;
  }
  return sql;
}

/** Parse which equipment columns the user mentioned. */
export function parseRequestedEquipmentFields(text) {
  const t = String(text ?? '')
    .toLowerCase()
    .replace(/\bhoaw\b/g, 'how')
    .replace(/\bhwo\b/g, 'how')
    .trim();
  const fields = new Set();
  const rules = [
    ['network_element', /\b(network element|network elements|\bne\b)/],
    ['ip_address', /\b(ip address|ip addresses|\bip\b(?!\s*address))/],
    ['router_type', /\brouter types?\b/],
    ['software_version', /\b(software version|software versions|sw version)\b/],
    ['descriptor_version', /\b(descriptor version|descriptor versions)\b/],
    ['model', /\bmodels?\b/],
    ['serial_number', /\b(serial number|serial numbers|serials?)\b/],
    ['end_of_life', /\b(end of life|end-of-life|\beol\b)/],
    ['status', /\bstatus\b/],
  ];
  for (const [key, re] of rules) {
    if (re.test(t)) fields.add(key);
  }
  if (/\b(equipment details|device details|full equipment|all fields)\b/.test(t)) {
    return [...FULL_EQUIPMENT_DETAIL_FIELDS];
  }
  if (fields.size === 0) return null;
  if (fields.size === 1 && fields.has('status') && !/\bequipment\b|\bdevices?\b|\brouters?\b/.test(t)) {
    return null;
  }
  if (fields.size === 1 && fields.has('router_type') && /\bcounts?\b/.test(t)) return null;
  return [...fields];
}

export function orderEquipmentDisplayColumns(columns) {
  const lower = columns.map((c) => String(c).toLowerCase());
  if (!lower.includes('site_name')) return columns;
  if (!lower.includes('equipment') && !lower.includes('serial_number')) return columns;
  const preferred = DETAIL_FIELD_ORDER;
  const ordered = preferred.filter((p) => lower.includes(p));
  const rest = columns.filter((c) => !ordered.includes(String(c).toLowerCase()));
  return [...ordered.map((p) => columns[lower.indexOf(p)]), ...rest];
}
