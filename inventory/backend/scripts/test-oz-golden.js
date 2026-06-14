/**
 * Oz golden-question regression tests (deterministic intents only — no LLM).
 * Run from backend/: node scripts/test-oz-golden.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/index.js';
import { newId } from '../src/utils/helpers.js';
import { resolveOzIntent, runOzIntentAnswer, runOzSql } from '../src/services/ozAI.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(__dirname, 'oz-golden-questions.json');
const COMBO_PATH = path.join(__dirname, 'oz-field-combination-tests.json');

const OZ_PLAIDS = ['OZ-GOLD-A', 'OZ-GOLD-B'];

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function seedOzGoldenData() {
  cleanupOzGoldenData();

  const siteA = newId();
  const siteB = newId();
  db.prepare(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteA, 'Oz Golden Site Alpha', 'OZ-GOLD-A', 'T1', 'T1', 'NCR');
  db.prepare(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteB, 'Oz Golden Site Empty', 'OZ-GOLD-B', 'T2', 'T2', 'VIS');

  const eqP = newId();
  const eqDR = newId();
  const eqNokia = newId();
  db.prepare(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version, descriptor_version, end_of_life)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(eqP, siteA, 'CISCO', 'ASR9000', 'NE-P-1', 'OZ-SN-P-1', 'P', 'Active', '10.1.1.1', 'V1.0', 'DESC-P-1', `${new Date().getFullYear()}-12-31`);
  db.prepare(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(eqDR, siteA, 'JUNIPER', 'MX480', 'NE-DR-1', 'OZ-SN-DR-1', 'DR', 'Active', '10.1.1.2', 'JUNOS-21');
  db.prepare(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version, descriptor_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(eqNokia, siteA, 'NOKIA', '7750 SR', 'NE-NOKIA-1', 'OZ-SN-NOKIA-1', 'P', 'Active', '10.1.1.3', 'V800R021', 'DESC-NOKIA-1');

  const slotDR = newId();
  db.prepare(
    `INSERT INTO slots (id, equipment_id, slot_name, total_ports) VALUES (?, ?, ?, ?)`
  ).run(slotDR, eqDR, 'Slot-1', 4);

  for (let p = 1; p <= 4; p++) {
    db.prepare(
      `INSERT INTO ports (id, slot_id, port_number, is_utilized) VALUES (?, ?, ?, ?)`
    ).run(newId(), slotDR, p, p <= 2 ? 1 : 0);
  }
}

function cleanupOzGoldenData() {
  for (const plaid of OZ_PLAIDS) {
    const site = db.prepare('SELECT id FROM sites WHERE plaid = ?').get(plaid);
    if (!site) continue;
    const eqIds = db.prepare('SELECT id FROM equipment WHERE site_id = ?').all(site.id).map((r) => r.id);
    for (const eqId of eqIds) {
      const slotIds = db.prepare('SELECT id FROM slots WHERE equipment_id = ?').all(eqId).map((r) => r.id);
      for (const slotId of slotIds) {
        db.prepare('DELETE FROM ports WHERE slot_id = ?').run(slotId);
      }
      db.prepare('DELETE FROM slots WHERE equipment_id = ?').run(eqId);
    }
    db.prepare('DELETE FROM equipment WHERE site_id = ?').run(site.id);
    db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  }
}

function runGoldenCase(testCase) {
  const intent = resolveOzIntent(testCase.q);
  assert(intent, `${testCase.id}: expected an intent match for "${testCase.q}"`);
  const expectType = testCase.expectIntent ?? 'sql';
  assert(intent.type === expectType, `${testCase.id}: expected intent type ${expectType}, got ${intent.type}`);

  if (expectType === 'sql') {
    const sqlUpper = intent.sql.toUpperCase();
    if (testCase.expectSqlContains) {
      for (const frag of testCase.expectSqlContains) {
        assert(
          sqlUpper.includes(String(frag).toUpperCase()),
          `${testCase.id}: SQL should contain "${frag}" — got: ${intent.sql}`
        );
      }
    }
    const exec = runOzSql(intent.sql, testCase.q);
    assert(exec.success, `${testCase.id}: SQL execution failed — ${exec.error}`);
    if (testCase.expectColumns) {
      assert(exec.data?.length || testCase.allowEmptyRows, `${testCase.id}: expected rows to verify columns`);
      if (!exec.data?.length) return;
      const cols = Object.keys(exec.data[0]).map((c) => c.toLowerCase());
      for (const col of testCase.expectColumns) {
        assert(cols.includes(col.toLowerCase()), `${testCase.id}: missing column ${col} — got ${cols.join(', ')}`);
      }
      const deviceCols = new Set([
        'equipment', 'serial_number', 'vendor', 'model', 'ip_address', 'network_element',
        'end_of_life', 'software_version', 'descriptor_version', 'router_type', 'status',
      ]);
      const isDeviceDetail =
        testCase.expectColumns.some((c) => deviceCols.has(c.toLowerCase())) &&
        !testCase.expectColumns.some((c) => /count|total|sum|avg/i.test(String(c)));
      if (isDeviceDetail) {
        assert(cols.includes('site_name'), `${testCase.id}: every device answer must include site_name`);
        assert(
          cols.includes('equipment') || cols.includes('serial_number'),
          `${testCase.id}: every device answer must include equipment or serial_number`
        );
      }
    }
    if (testCase.expectMinRows != null) {
      assert(
        exec.rowCount >= testCase.expectMinRows,
        `${testCase.id}: expected at least ${testCase.expectMinRows} rows, got ${exec.rowCount}`
      );
    }
  }

  if (expectType === 'direct') {
    const answer = runOzIntentAnswer(testCase.q);
    assert(typeof answer === 'string' && answer.length > 0, `${testCase.id}: expected non-empty answer`);
    if (testCase.expectContains) {
      for (const frag of testCase.expectContains) {
        assert(
          answer.toLowerCase().includes(String(frag).toLowerCase()),
          `${testCase.id}: answer should contain "${frag}"`
        );
      }
    }
    return;
  }

  const answer = runOzIntentAnswer(testCase.q);
  assert(typeof answer === 'string' && answer.length > 0, `${testCase.id}: expected non-empty answer`);
  if (testCase.expectContains) {
    for (const frag of testCase.expectContains) {
      assert(
        answer.toLowerCase().includes(String(frag).toLowerCase()),
        `${testCase.id}: answer should contain "${frag}"`
      );
    }
  }
}

function runCaseFile(label, filePath) {
  const cases = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`\n--- ${label} ---`);
  for (const testCase of cases) {
    runGoldenCase(testCase);
    console.log(`  ✓ ${testCase.id}`);
  }
  console.log(`  ${cases.length} passed`);
  return cases.length;
}

export function runOzGoldenTests() {
  seedOzGoldenData();
  try {
    let total = 0;
    total += runCaseFile('Oz golden questions', GOLDEN_PATH);
    total += runCaseFile('Oz field combinations', COMBO_PATH);
    console.log(`\n  Total: ${total} Oz tests passed`);
  } finally {
    cleanupOzGoldenData();
  }
}

function main() {
  console.log('Oz golden-question tests');
  try {
    runOzGoldenTests();
    console.log('\n✓ All golden questions passed\n');
    process.exit(0);
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
