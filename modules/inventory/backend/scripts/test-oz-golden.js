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

const dbGet = (sql, ...params) => db.prepare(sql).get(...params);
const dbAll = (sql, ...params) => db.prepare(sql).all(...params);
const dbRun = (sql, ...params) => db.prepare(sql).run(...params);

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function seedOzGoldenData() {
  await cleanupOzGoldenData();

  const siteA = newId();
  const siteB = newId();
  await dbRun(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`,
    siteA,
    'Oz Golden Site Alpha',
    'OZ-GOLD-A',
    'T1',
    'T1',
    'NCR',
  );
  await dbRun(
    `INSERT INTO sites (id, name, plaid, area, territory, region) VALUES (?, ?, ?, ?, ?, ?)`,
    siteB,
    'Oz Golden Site Empty',
    'OZ-GOLD-B',
    'T2',
    'T2',
    'VIS',
  );

  const eqP = newId();
  const eqDR = newId();
  const eqNokia = newId();
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version, descriptor_version, end_of_life)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eqP,
    siteA,
    'CISCO',
    'ASR9000',
    'NE-P-1',
    'OZ-SN-P-1',
    'P',
    'Active',
    '10.1.1.1',
    'V1.0',
    'DESC-P-1',
    `${new Date().getFullYear()}-12-31`,
  );
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eqDR,
    siteA,
    'JUNIPER',
    'MX480',
    'NE-DR-1',
    'OZ-SN-DR-1',
    'DR',
    'Active',
    '10.1.1.2',
    'JUNOS-21',
  );
  await dbRun(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, status, ip_address, software_version, descriptor_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eqNokia,
    siteA,
    'NOKIA',
    '7750 SR',
    'NE-NOKIA-1',
    'OZ-SN-NOKIA-1',
    'P',
    'Active',
    '10.1.1.3',
    'V800R021',
    'DESC-NOKIA-1',
  );

  const slotDR = newId();
  await dbRun(`INSERT INTO slots (id, equipment_id, slot_name, total_ports) VALUES (?, ?, ?, ?)`, slotDR, eqDR, 'Slot-1', 4);

  for (let p = 1; p <= 4; p++) {
    await dbRun(`INSERT INTO ports (id, slot_id, port_number, is_utilized) VALUES (?, ?, ?, ?)`, newId(), slotDR, p, p <= 2 ? 1 : 0);
  }
}

async function cleanupOzGoldenData() {
  for (const plaid of OZ_PLAIDS) {
    const site = await dbGet('SELECT id FROM sites WHERE plaid = ?', plaid);
    if (!site) continue;
    const eqRows = await dbAll('SELECT id FROM equipment WHERE site_id = ?', site.id);
    for (const { id: eqId } of eqRows) {
      const slotRows = await dbAll('SELECT id FROM slots WHERE equipment_id = ?', eqId);
      for (const { id: slotId } of slotRows) {
        await dbRun('DELETE FROM ports WHERE slot_id = ?', slotId);
      }
      await dbRun('DELETE FROM slots WHERE equipment_id = ?', eqId);
    }
    await dbRun('DELETE FROM equipment WHERE site_id = ?', site.id);
    await dbRun('DELETE FROM sites WHERE id = ?', site.id);
  }
}

async function runGoldenCase(testCase) {
  const intent = await resolveOzIntent(testCase.q);
  assert(intent, `${testCase.id}: expected an intent match for "${testCase.q}"`);
  const expectType = testCase.expectIntent ?? 'sql';
  assert(intent.type === expectType, `${testCase.id}: expected intent type ${expectType}, got ${intent.type}`);

  if (expectType === 'sql') {
    const sqlUpper = intent.sql.toUpperCase();
    if (testCase.expectSqlContains) {
      for (const frag of testCase.expectSqlContains) {
        assert(
          sqlUpper.includes(String(frag).toUpperCase()),
          `${testCase.id}: SQL should contain "${frag}" — got: ${intent.sql}`,
        );
      }
    }
    const exec = await runOzSql(intent.sql, testCase.q);
    assert(exec.success, `${testCase.id}: SQL execution failed — ${exec.error}`);
    if (testCase.expectColumns) {
      assert(exec.data?.length || testCase.allowEmptyRows, `${testCase.id}: expected rows to verify columns`);
      if (!exec.data?.length) return;
      const cols = Object.keys(exec.data[0]).map((c) => c.toLowerCase());
      for (const col of testCase.expectColumns) {
        assert(cols.includes(col.toLowerCase()), `${testCase.id}: missing column ${col} — got ${cols.join(', ')}`);
      }
      const deviceCols = new Set([
        'equipment',
        'serial_number',
        'vendor',
        'model',
        'ip_address',
        'network_element',
        'end_of_life',
        'software_version',
        'descriptor_version',
        'router_type',
        'status',
      ]);
      const isDeviceDetail =
        testCase.expectColumns.some((c) => deviceCols.has(c.toLowerCase())) &&
        !testCase.expectColumns.some((c) => /count|total|sum|avg/i.test(String(c)));
      if (isDeviceDetail) {
        assert(cols.includes('site_name'), `${testCase.id}: every device answer must include site_name`);
        assert(
          cols.includes('equipment') || cols.includes('serial_number'),
          `${testCase.id}: every device answer must include equipment or serial_number`,
        );
      }
    }
    if (testCase.expectMinRows != null) {
      assert(
        exec.rowCount >= testCase.expectMinRows,
        `${testCase.id}: expected at least ${testCase.expectMinRows} rows, got ${exec.rowCount}`,
      );
    }
  }

  if (expectType === 'direct') {
    const answer = await runOzIntentAnswer(testCase.q);
    assert(typeof answer === 'string' && answer.length > 0, `${testCase.id}: expected non-empty answer`);
    if (testCase.expectContains) {
      for (const frag of testCase.expectContains) {
        assert(
          answer.toLowerCase().includes(String(frag).toLowerCase()),
          `${testCase.id}: answer should contain "${frag}"`,
        );
      }
    }
    return;
  }

  const answer = await runOzIntentAnswer(testCase.q);
  assert(typeof answer === 'string' && answer.length > 0, `${testCase.id}: expected non-empty answer`);
  if (testCase.expectContains) {
    for (const frag of testCase.expectContains) {
      assert(
        answer.toLowerCase().includes(String(frag).toLowerCase()),
        `${testCase.id}: answer should contain "${frag}"`,
      );
    }
  }
}

async function runCaseFile(label, filePath) {
  const cases = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`\n--- ${label} ---`);
  for (const testCase of cases) {
    await runGoldenCase(testCase);
    console.log(`  ✓ ${testCase.id}`);
  }
  console.log(`  ${cases.length} passed`);
  return cases.length;
}

export async function runOzGoldenTests() {
  await seedOzGoldenData();
  try {
    let total = 0;
    total += await runCaseFile('Oz golden questions', GOLDEN_PATH);
    total += await runCaseFile('Oz field combinations', COMBO_PATH);
    console.log(`\n  Total: ${total} Oz tests passed`);
  } finally {
    await cleanupOzGoldenData();
  }
}

async function main() {
  console.log('Oz golden-question tests');
  try {
    await runOzGoldenTests();
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
