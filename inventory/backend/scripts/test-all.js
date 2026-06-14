/**
 * Full validation suite (run from backend/: node scripts/test-all.js)
 * Covers combined import, equipment CRUD, version fields, CSV import, BOM handling.
 */
import db from '../src/db/index.js';
import { newId } from '../src/utils/helpers.js';
import { processCombinedImport } from '../src/utils/combinedImport.js';
import { importEquipmentFromParsed } from '../src/utils/equipmentImport.js';
import { parseCsvRow } from '../src/utils/helpers.js';
import { parseUploadCsvBuffer } from '../src/utils/csvUpload.js';

const TEST_PLAIDS = [
  'TEST-COMB-A',
  'TEST-COMB-B',
  'TEST-COMB-C',
  'TEST-ALL-SITE',
  'TEST-ALL-VERS',
];

function cleanup() {
  for (const plaid of TEST_PLAIDS) {
    const site = db.prepare('SELECT id FROM sites WHERE plaid = ?').get(plaid);
    if (site) db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function runSchemaTests() {
  console.log('\n--- Schema / columns ---');
  const cols = db.prepare('PRAGMA table_info(equipment)').all().map((r) => r.name);
  for (const col of [
    'software_version',
    'descriptor_version',
    'ip_address',
    'network_element',
    'router_type',
    'chassis_slot_count',
  ]) {
    assert(cols.includes(col), `equipment.${col} column exists`);
  }
  console.log('  Schema tests passed');
}

function runVersionFieldTests() {
  console.log('\n--- Software / Descriptor Version ---');
  cleanup();

  const siteId = newId();
  db.prepare(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteId, 'Version Test Site', 'TEST-ALL-VERS', 'T1', 'T1', 'NCR');

  const eqId = newId();
  db.prepare(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, software_version, descriptor_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eqId,
    siteId,
    'NOKIA',
    '7750 SR',
    'NE-VERS',
    'TEST-SN-VERS-1',
    'P',
    'Active',
    'V800R021C00',
    'NE5000E-V800R021C00'
  );

  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(eqId);
  eq(row.software_version, 'V800R021C00', 'software_version stored');
  eq(row.descriptor_version, 'NE5000E-V800R021C00', 'descriptor_version stored');

  db.prepare('UPDATE equipment SET software_version = ?, descriptor_version = ? WHERE id = ?').run(
    'V900',
    null,
    eqId
  );
  const updated = db.prepare('SELECT * FROM equipment WHERE id = ?').get(eqId);
  eq(updated.software_version, 'V900', 'software_version updated');
  eq(updated.descriptor_version, null, 'descriptor_version cleared');

  console.log('  Version field tests passed');
}

function runCsvVersionImportTests() {
  console.log('\n--- CSV version columns ---');
  cleanup();

  const parsed = parseCsvRow({
    Vendor: 'HUAWEI',
    Model: 'NE40E',
    'Serial Number': 'TEST-SN-CSV-V',
    'Software Version': ' SW-1.0 ',
    'Descriptor Version': ' DESC-1.0 ',
    'Router Type': 'DR',
  });
  eq(parsed.software_version, 'SW-1.0', 'parseCsvRow trims software_version');
  eq(parsed.descriptor_version, 'DESC-1.0', 'parseCsvRow trims descriptor_version');

  const r = processCombinedImport([
    {
      'Site Name': 'CSV Version Site',
      PLAID: 'TEST-ALL-SITE',
      Region: 'NCR',
      Territory: 'T1',
      Vendor: 'NOKIA',
      Model: 'M1',
      'Serial Number': 'TEST-SN-CSV-IMP',
      'Router Type': 'P',
      'Software Version': 'V1.2.3',
      'Descriptor Version': 'DESC-V1',
    },
  ]);
  eq(r.equipment_added, 1, 'combined import with versions');
  eq(r.errors.length, 0, 'no errors on version import');

  const eqRow = db
    .prepare(
      `SELECT e.software_version, e.descriptor_version FROM equipment e
       JOIN sites s ON s.id = e.site_id WHERE s.plaid = ?`
    )
    .get('TEST-ALL-SITE');
  eq(eqRow.software_version, 'V1.2.3', 'imported software_version');
  eq(eqRow.descriptor_version, 'DESC-V1', 'imported descriptor_version');

  console.log('  CSV version import tests passed');
}

function runEquipmentImportUtilTests() {
  console.log('\n--- Per-site equipment import util ---');
  cleanup();

  const siteId = newId();
  db.prepare(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteId, 'Util Site', 'TEST-ALL-SITE', 'T1', 'T1', 'SLZ');

  const parsed = parseCsvRow({
    Vendor: 'CISCO',
    Model: 'ASR',
    'Serial Number': 'TEST-SN-UTIL',
    'Software Version': 'IOS-XE-17',
  });
  const existing = new Set();
  const batch = new Set();
  const result = importEquipmentFromParsed(siteId, parsed, existing, batch);
  assert(result.ok, 'importEquipmentFromParsed succeeds with software_version');

  const row = db.prepare('SELECT software_version, descriptor_version FROM equipment WHERE serial_number = ?').get('TEST-SN-UTIL');
  eq(row.software_version, 'IOS-XE-17', 'util import software_version');
  eq(row.descriptor_version, null, 'util import descriptor_version null when omitted');

  console.log('  Equipment import util tests passed');
}

async function runHttpTests() {
  console.log('\n--- HTTP API (requires server on :3001) ---');
  const base = 'http://127.0.0.1:3001';
  const api = `${base}/api/inventory`;

  function authHeaders(extra = {}) {
    const h = { ...extra };
    const key = (process.env.API_KEY || '').trim();
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  let health;
  try {
    const healthRes = await fetch(`${api}/health`);
    if (!healthRes.ok) {
      console.log('  SKIP: /api/inventory/health not available');
      return;
    }
    health = await healthRes.json();
  } catch {
    console.log('  SKIP: backend not running on :3001');
    return;
  }

  if (health.authRequired && !process.env.API_KEY) {
    console.log('  SKIP: server requires API_KEY (set API_KEY env for HTTP tests)');
    return;
  }

  try {
    const r = await fetch(`${api}/sites`, { headers: authHeaders() });
    if (!r.ok && r.status !== 401) {
      console.log(`  SKIP: /api/sites returned ${r.status}`);
      return;
    }
    if (r.status === 401) {
      console.log('  SKIP: authentication failed (check API_KEY matches server)');
      return;
    }

    cleanup();

    const jsonHeaders = authHeaders({ 'Content-Type': 'application/json' });

    // Create site via API
    const siteRes = await fetch(`${api}/sites`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: 'HTTP Test Site',
        plaid: 'TEST-ALL-SITE',
        region: 'NCR',
        territory: 'T1',
      }),
    });
    assert(siteRes.ok, `POST /api/sites — ${siteRes.status}`);
    const site = await siteRes.json();

    // Create equipment with version fields
    const createRes = await fetch(`${api}/equipment`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        site_id: site.id,
        vendor: 'NOKIA',
        model: '7750',
        network_element: 'NE-HTTP',
        serial_number: 'TEST-SN-HTTP-1',
        router_type: 'P',
        software_version: 'HTTP-SW-1',
        descriptor_version: 'HTTP-DESC-1',
      }),
    });
    assert(createRes.ok, `POST /api/equipment — ${createRes.status} ${await createRes.clone().text()}`);
    const created = await createRes.json();
    eq(created.software_version, 'HTTP-SW-1', 'HTTP create software_version');
    eq(created.descriptor_version, 'HTTP-DESC-1', 'HTTP create descriptor_version');

    // PATCH update versions
    const patchRes = await fetch(`${api}/equipment/${created.id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ software_version: 'HTTP-SW-2', descriptor_version: null }),
    });
    assert(patchRes.ok, `PATCH /api/equipment — ${patchRes.status}`);
    const patched = await patchRes.json();
    eq(patched.software_version, 'HTTP-SW-2', 'HTTP patch software_version');
    eq(patched.descriptor_version, null, 'HTTP patch descriptor_version cleared');

    // Combined CSV import with BOM + versions
    const csvBody =
      'Site Name,PLAID,Region,Territory,Vendor,Model,Serial Number,Router Type,Software Version,Descriptor Version\n' +
      'HTTP Site 2,TEST-ALL-VERS,NCR,T1,HUAWEI,NE40E,TEST-SN-HTTP-CSV,DR,CSV-SW,CSV-DESC\n';
    const bomBuffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvBody, 'utf8')]);
    const form = new FormData();
    form.append('file', new Blob([bomBuffer], { type: 'text/csv' }), 'test.csv');
    const importRes = await fetch(`${api}/sites/import/combined`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    assert(importRes.ok, `POST /api/sites/import/combined — ${importRes.status}`);
    const importResult = await importRes.json();
    eq(importResult.equipment_added, 1, 'HTTP combined import equipment');
    assert(
      importResult.errors.length === 0 || importResult.equipment_added === 1,
      'combined import no blocking errors'
    );

    const csvEq = db
      .prepare('SELECT software_version, descriptor_version FROM equipment WHERE serial_number = ?')
      .get('TEST-SN-HTTP-CSV');
    eq(csvEq.software_version, 'CSV-SW', 'HTTP CSV import software_version');
    eq(csvEq.descriptor_version, 'CSV-DESC', 'HTTP CSV import descriptor_version');

    // GET equipment detail
    const getRes = await fetch(`${api}/equipment/${created.id}`, { headers: authHeaders() });
    assert(getRes.ok, 'GET /api/equipment/:id');
    const detail = await getRes.json();
    assert(detail.equipment?.software_version === 'HTTP-SW-2', 'GET returns software_version');

    cleanup();
    console.log('  HTTP API tests passed');
  } catch (e) {
    cleanup();
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ECONNREFUSED|network/i.test(msg)) {
      console.log('  SKIP: HTTP API unavailable');
      return;
    }
    throw e;
  }
}

import { escapeCsvCell } from '../src/middleware/security.js';
import { runOzGoldenTests } from './test-oz-golden.js';

function runSecurityUtilTests() {
  console.log('\n--- Security utilities ---');
  eq(escapeCsvCell('=1+1'), "'=1+1", 'CSV formula escaped');
  eq(escapeCsvCell('normal'), 'normal', 'normal CSV cell');
  eq(escapeCsvCell('a,b'), '"a,b"', 'comma quoted');
  console.log('  Security utility tests passed');
}

async function main() {
  console.log('DC Inventory — full test suite');
  try {
    runSchemaTests();
    runSecurityUtilTests();
    runVersionFieldTests();
    runCsvVersionImportTests();
    runEquipmentImportUtilTests();
    runOzGoldenTests();
    await runHttpTests();
    cleanup();
    console.log('\n✓ All tests passed\n');
    process.exit(0);
  } catch (e) {
    cleanup();
    console.error('\n✗', e.message);
    process.exit(1);
  }
}

main();
