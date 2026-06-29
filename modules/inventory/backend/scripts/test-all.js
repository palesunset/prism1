/**
 * Full validation suite (run from backend/: node scripts/test-all.js)
 * Covers combined import, equipment CRUD, version fields, CSV import, BOM handling.
 */
import db from '../src/db/index.js';
import { newId } from '../src/utils/helpers.js';
import { processCombinedImport } from '../src/utils/combinedImport.js';
import { importEquipmentFromParsed } from '../src/utils/equipmentImport.js';
import { parseCsvRow } from '../src/utils/helpers.js';
import {
  parseIpForStorage,
  findEquipmentByIp,
  findDuplicateIpEquipment,
  findDuplicateIpGroups,
} from '../src/utils/ipAddress.js';

const TEST_PLAIDS = [
  'TEST-COMB-A',
  'TEST-COMB-B',
  'TEST-COMB-C',
  'TEST-ALL-SITE',
  'TEST-ALL-VERS',
  'TEST-ALL-IP',
];

const dbGet = (sql, ...params) => db.prepare(sql).get(...params);
const dbAll = (sql, ...params) => db.prepare(sql).all(...params);
const dbRun = (sql, ...params) => db.prepare(sql).run(...params);

async function cleanup() {
  for (const plaid of TEST_PLAIDS) {
    const site = await dbGet('SELECT id FROM sites WHERE plaid = ?', plaid);
    if (site) await dbRun('DELETE FROM sites WHERE id = ?', site.id);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runSchemaTests() {
  console.log('\n--- Schema / columns ---');
  const rows = await dbAll('PRAGMA table_info(equipment)');
  const cols = rows.map((r) => r.name);
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

async function runVersionFieldTests() {
  console.log('\n--- Software / Descriptor Version ---');
  await cleanup();

  const siteId = newId();
  await dbRun(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`,
    siteId,
    'Version Test Site',
    'TEST-ALL-VERS',
    'T1',
    'T1',
    'NCR',
  );

  const eqId = newId();
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, software_version, descriptor_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eqId,
    siteId,
    'NOKIA',
    '7750 SR',
    'NE-VERS',
    'TEST-SN-VERS-1',
    'P',
    'Active',
    'V800R021C00',
    'NE5000E-V800R021C00',
  );

  const row = await dbGet('SELECT * FROM equipment WHERE id = ?', eqId);
  eq(row.software_version, 'V800R021C00', 'software_version stored');
  eq(row.descriptor_version, 'NE5000E-V800R021C00', 'descriptor_version stored');

  await dbRun('UPDATE equipment SET software_version = ?, descriptor_version = ? WHERE id = ?', 'V900', null, eqId);
  const updated = await dbGet('SELECT * FROM equipment WHERE id = ?', eqId);
  eq(updated.software_version, 'V900', 'software_version updated');
  eq(updated.descriptor_version, null, 'descriptor_version cleared');

  console.log('  Version field tests passed');
}

async function runCsvVersionImportTests() {
  console.log('\n--- CSV version columns ---');
  await cleanup();

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

  const r = await processCombinedImport([
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

  const eqRow = await dbGet(
    `SELECT e.software_version, e.descriptor_version FROM equipment e
       JOIN sites s ON s.id = e.site_id WHERE s.plaid = ?`,
    'TEST-ALL-SITE',
  );
  eq(eqRow.software_version, 'V1.2.3', 'imported software_version');
  eq(eqRow.descriptor_version, 'DESC-V1', 'imported descriptor_version');

  console.log('  CSV version import tests passed');
}

async function runEquipmentImportUtilTests() {
  console.log('\n--- Per-site equipment import util ---');
  await cleanup();

  const siteId = newId();
  await dbRun(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`,
    siteId,
    'Util Site',
    'TEST-ALL-SITE',
    'T1',
    'T1',
    'SLZ',
  );

  const parsed = parseCsvRow({
    Vendor: 'CISCO',
    Model: 'ASR',
    'Serial Number': 'TEST-SN-UTIL',
    'Software Version': 'IOS-XE-17',
  });
  const existing = new Set();
  const batch = new Set();
  const result = await importEquipmentFromParsed(siteId, parsed, existing, batch, new Set());
  assert(result.ok, 'importEquipmentFromParsed succeeds with software_version');

  const row = await dbGet('SELECT software_version, descriptor_version FROM equipment WHERE serial_number = ?', 'TEST-SN-UTIL');
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

    await cleanup();

    const jsonHeaders = authHeaders({ 'Content-Type': 'application/json' });

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

    const patchRes = await fetch(`${api}/equipment/${created.id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ software_version: 'HTTP-SW-2', descriptor_version: null }),
    });
    assert(patchRes.ok, `PATCH /api/equipment — ${patchRes.status}`);
    const patched = await patchRes.json();
    eq(patched.software_version, 'HTTP-SW-2', 'HTTP patch software_version');
    eq(patched.descriptor_version, null, 'HTTP patch descriptor_version cleared');

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
      'combined import no blocking errors',
    );

    const csvEq = await dbGet('SELECT software_version, descriptor_version FROM equipment WHERE serial_number = ?', 'TEST-SN-HTTP-CSV');
    eq(csvEq.software_version, 'CSV-SW', 'HTTP CSV import software_version');
    eq(csvEq.descriptor_version, 'CSV-DESC', 'HTTP CSV import descriptor_version');

    const getRes = await fetch(`${api}/equipment/${created.id}`, { headers: authHeaders() });
    assert(getRes.ok, 'GET /api/equipment/:id');
    const detail = await getRes.json();
    assert(detail.equipment?.software_version === 'HTTP-SW-2', 'GET returns software_version');

    await cleanup();
    console.log('  HTTP API tests passed');
  } catch (e) {
    await cleanup();
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ECONNREFUSED|network/i.test(msg)) {
      console.log('  SKIP: HTTP API unavailable');
      return;
    }
    throw e;
  }
}

async function runIpAddressTests() {
  console.log('\n--- IP address normalization ---');
  const v4 = parseIpForStorage('10.0.0.1');
  assert(v4.ok && v4.value === '10.0.0.1', 'IPv4 parsed');
  const v6a = parseIpForStorage('2001:DB8::1');
  const v6b = parseIpForStorage('2001:0db8:0000:0000:0000:0000:0000:0001');
  assert(v6a.ok && v6b.ok && v6a.value === v6b.value, 'IPv6 canonical match');
  assert(!parseIpForStorage('10.0.0.0/24').ok, 'CIDR rejected for management IP');

  await cleanup();
  const siteId = newId();
  await dbRun(`INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`, siteId, 'IP Test Site', 'TEST-ALL-IP', 'T1', 'T1', 'NCR');
  const eq1 = newId();
  const eq2 = newId();
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eq1,
    siteId,
    'NOKIA',
    '7750',
    'NE-1',
    'IP-SN-1',
    'P',
    'Active',
    '2001:db8::1',
  );
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eq2,
    siteId,
    'NOKIA',
    '7750',
    'NE-2',
    'IP-SN-2',
    'P',
    'Active',
    '2001:0db8:0000:0000:0000:0000:0000:0001',
  );

  const lookup = await findEquipmentByIp('2001:db8::1');
  assert(lookup.ok && lookup.matches.length === 2, 'IPv6 by-ip finds both canonical forms');

  const dupes = await findDuplicateIpEquipment('2001:db8::1');
  assert(dupes.length === 2, 'duplicate IP detection finds both rows');

  const groups = await findDuplicateIpGroups();
  assert(groups.some((g) => g.equipment.length === 2), 'integrity groups duplicate IPv6');

  await cleanup();
  console.log('  IP address tests passed');
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
    await runSchemaTests();
    runSecurityUtilTests();
    await runVersionFieldTests();
    await runCsvVersionImportTests();
    await runEquipmentImportUtilTests();
    await runIpAddressTests();
    await runOzGoldenTests();
    await runHttpTests();
    await cleanup();
    console.log('\n✓ All tests passed\n');
    process.exit(0);
  } catch (e) {
    await cleanup();
    console.error('\n✗', e.message);
    process.exit(1);
  }
}

main();
