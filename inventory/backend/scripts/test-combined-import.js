/**
 * Combined import validation tests (run from backend/: node scripts/test-combined-import.js)
 * Uses real DB with TEST-* PLAIDs; cleans up after run.
 */
import db from '../src/db/index.js';
import { processCombinedImport } from '../src/utils/combinedImport.js';
import { rowHasEquipment, rowHasCompleteEquipment, validateEquipmentRow } from '../src/utils/equipmentImport.js';
import { parseCsvRow } from '../src/utils/helpers.js';
import { stripUtf8Bom, parseUploadCsvBuffer } from '../src/utils/csvUpload.js';

const TEST_PLAIDS = ['TEST-COMB-A', 'TEST-COMB-B', 'TEST-COMB-C'];

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
  if (actual !== expected) throw new Error(`FAIL: ${msg} — expected ${expected}, got ${actual}`);
}

function runUnitTests() {
  console.log('\n--- Unit tests ---');

  eq(rowHasEquipment(parseCsvRow({ Vendor: 'A', Model: 'M', 'Serial Number': 'S' })), true, 'full equipment row');
  eq(rowHasCompleteEquipment(parseCsvRow({ Vendor: 'A', Model: 'M', 'Serial Number': 'S' })), true, 'complete equipment row');
  eq(rowHasEquipment(parseCsvRow({ Vendor: 'A' })), true, 'partial equipment row detected');
  eq(rowHasCompleteEquipment(parseCsvRow({ Vendor: 'A' })), false, 'partial equipment row not complete');
  eq(rowHasEquipment(parseCsvRow({})), false, 'empty row not equipment');
  eq(
    validateEquipmentRow(parseCsvRow({ Vendor: 'A', Model: 'M', 'Serial Number': 'S', 'Router Type': 'XX' })),
    'Invalid Router Type: XX',
    'invalid router type'
  );
  eq(
    validateEquipmentRow(parseCsvRow({ Vendor: 'A', Model: 'M', 'Serial Number': 'S' })),
    null,
    'valid equipment row'
  );

  console.log('  Unit tests passed');
}

function runIntegrationTests() {
  console.log('\n--- Integration tests ---');
  cleanup();

  // 1. Happy path: 2 sites, 3 equipment
  const r1 = processCombinedImport([
    {
      'Site Name': 'Test Site A',
      PLAID: 'TEST-COMB-A',
      Region: 'NCR',
      Territory: 'Territory 1',
      Address: 'Addr A',
      Latitude: '14.5',
      Longitude: '121.0',
      Vendor: 'NOKIA',
      'Network Element': 'NE-A1',
      Model: 'M1',
      'Serial Number': 'TEST-SN-A1',
      'Router Type': 'P',
      Status: 'Active',
      'Total Chassis Slot': '4',
    },
    {
      'Site Name': 'Test Site A',
      PLAID: 'TEST-COMB-A',
      Region: 'NCR',
      Territory: 'Territory 1',
      Vendor: 'HUAWEI',
      Model: 'M2',
      'Serial Number': 'TEST-SN-A2',
      'Router Type': 'DR',
      Status: 'Decom',
    },
    {
      'Site Name': 'Test Site B',
      PLAID: 'TEST-COMB-B',
      Region: 'VIS',
      Territory: 'Territory 2',
      Vendor: 'NOKIA',
      Model: 'M3',
      'Serial Number': 'TEST-SN-B1',
      'Router Type': 'P',
    },
  ]);
  eq(r1.sites_added, 2, 'sites added');
  eq(r1.equipment_added, 3, 'equipment added');
  eq(r1.errors.length, 0, 'no errors on happy path');

  const siteA = db.prepare('SELECT * FROM sites WHERE plaid = ?').get('TEST-COMB-A');
  assert(siteA, 'site A exists');
  const eqA = db.prepare('SELECT COUNT(*) AS c FROM equipment WHERE site_id = ?').get(siteA.id);
  eq(eqA.c, 2, 'site A has 2 equipment');

  const decom = db
    .prepare('SELECT status FROM equipment WHERE serial_number = ?')
    .get('TEST-SN-A2');
  eq(decom.status, 'Decommissioned', 'Decom status normalized');

  const bays = db
    .prepare(
      `SELECT COUNT(*) AS c FROM equipment_bays b
       JOIN equipment e ON e.id = b.equipment_id
       WHERE e.serial_number = 'TEST-SN-A1'`
    )
    .get();
  eq(bays.c, 4, 'chassis bays created');

  // 2. Duplicate serial in same file
  const r2 = processCombinedImport([
    {
      'Site Name': 'Test Site C',
      PLAID: 'TEST-COMB-C',
      Region: 'NCR',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M',
      'Serial Number': 'TEST-SN-DUP',
      'Router Type': 'P',
    },
    {
      'Site Name': 'Test Site C',
      PLAID: 'TEST-COMB-C',
      Region: 'NCR',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M2',
      'Serial Number': 'TEST-SN-DUP',
      'Router Type': 'P',
    },
  ]);
  eq(r2.sites_added, 1, 'one site for dup serial test');
  eq(r2.equipment_added, 1, 'only one equipment on dup serial');
  assert(r2.errors.some((e) => e.message.includes('Duplicate serial')), 'dup serial error');

  // 3. Missing PLAID with equipment
  const r3 = processCombinedImport([
    {
      'Site Name': 'X',
      Region: 'NCR',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M',
      'Serial Number': 'TEST-SN-NOPLAID',
    },
  ]);
  eq(r3.equipment_added, 0, 'no equipment without PLAID');
  assert(r3.errors.some((e) => e.message.includes('PLAID')), 'PLAID required error');

  // 4. Invalid region
  const r4 = processCombinedImport([
    {
      'Site Name': 'Bad Region',
      PLAID: 'TEST-COMB-BADREG',
      Region: 'INVALID',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M',
      'Serial Number': 'TEST-SN-BAD',
    },
  ]);
  eq(r4.sites_added, 0, 'no site on bad region');
  assert(r4.errors.some((e) => e.message.includes('Invalid Region')), 'invalid region error');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-BADREG');

  // 5. Reuse existing site (TEST-COMB-A already exists)
  const r5 = processCombinedImport([
    {
      'Site Name': 'Test Site A',
      PLAID: 'TEST-COMB-A',
      Region: 'NCR',
      Territory: 'Territory 1',
      Vendor: 'CISCO',
      Model: 'MX',
      'Serial Number': 'TEST-SN-A3',
      'Router Type': 'P',
    },
  ]);
  eq(r5.sites_added, 0, 'no new site when PLAID exists');
  eq(r5.equipment_added, 1, 'equipment added to existing site');

  // 6. Site-only row (no equipment columns)
  const r6 = processCombinedImport([
    {
      'Site Name': 'Site Only',
      PLAID: 'TEST-COMB-SITEONLY',
      Region: 'SLZ',
      Territory: 'T3',
    },
  ]);
  eq(r6.sites_added, 1, 'site-only row creates site');
  eq(r6.equipment_added, 0, 'site-only no equipment');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-SITEONLY');

  // 7. Partial equipment row — site created, equipment skipped (edit later)
  const r7 = processCombinedImport([
    {
      PLAID: 'TEST-COMB-PARTIAL',
      Vendor: 'NOKIA',
      Model: 'M1',
      'Serial Number': '',
    },
  ]);
  eq(r7.sites_added, 1, 'site created for partial equipment row');
  eq(r7.equipment_added, 0, 'no equipment on partial row');
  eq(r7.errors.length, 0, 'partial equipment row does not error');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-PARTIAL');

  // 8. PLAID-only new site (blank site name / region / territory)
  const r8 = processCombinedImport([{ PLAID: 'TEST-COMB-PLAID-ONLY' }]);
  eq(r8.sites_added, 1, 'PLAID-only row creates site');
  eq(r8.errors.length, 0, 'no errors on PLAID-only row');
  const siteOnly = db.prepare('SELECT name, region, area FROM sites WHERE plaid = ?').get('TEST-COMB-PLAID-ONLY');
  eq(siteOnly.name, 'TEST-COMB-PLAID-ONLY', 'blank site name defaults to PLAID');
  eq(siteOnly.region, '', 'blank region allowed');
  eq(siteOnly.area, '', 'blank territory allowed');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-PLAID-ONLY');

  console.log('  Integration tests passed');
}

function runSecurityChecks() {
  console.log('\n--- Security / data-integrity checks ---');

  // SQL injection in PLAID — parameterized queries should store literally
  const injPlaid = "TEST-COMB-'; DROP TABLE sites; --";
  cleanup();
  const r = processCombinedImport([
    {
      'Site Name': 'Inject Test',
      PLAID: injPlaid,
      Region: 'NCR',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M',
      'Serial Number': 'TEST-SN-INJ',
      'Router Type': 'P',
    },
  ]);
  const sitesStill = db.prepare('SELECT COUNT(*) AS c FROM sites').get();
  assert(sitesStill.c > 0, 'sites table intact after injection attempt in PLAID');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run(injPlaid);

  // CSV formula stored as data (document risk, not server RCE)
  const formulaSerial = '=1+1';
  const r2 = processCombinedImport([
    {
      'Site Name': 'Formula',
      PLAID: 'TEST-COMB-FORM',
      Region: 'NCR',
      Territory: 'T',
      Vendor: 'NOKIA',
      Model: 'M',
      'Serial Number': formulaSerial,
      'Router Type': 'P',
    },
  ]);
  if (r2.equipment_added === 1) {
    const row = db.prepare('SELECT serial_number FROM equipment WHERE serial_number = ?').get(formulaSerial);
    assert(row, 'formula serial stored as literal string');
    db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-FORM');
  }

  console.log('  Security checks passed (see report for app-level findings)');
}

async function runBomTests() {
  console.log('\n--- UTF-8 BOM handling ---');
  const csvBody =
    'Site Name,PLAID,Region,Territory,Vendor,Model,Serial Number,Router Type\n' +
    'BOM Site,TEST-COMB-BOM,NCR,T1,NOKIA,M1,TEST-SN-BOM,P\n';
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvBody, 'utf8')]);
  eq(stripUtf8Bom(withBom).length, Buffer.from(csvBody, 'utf8').length, 'BOM stripped from buffer');
  const rows = await parseUploadCsvBuffer(withBom);
  eq(rows.length, 1, 'one data row from BOM CSV');
  assert(rows[0]['Site Name'] === 'BOM Site', 'Site Name column parses after BOM strip');
  cleanup();
  const r = processCombinedImport(rows);
  eq(r.sites_added, 1, 'site from BOM CSV');
  eq(r.equipment_added, 1, 'equipment from BOM CSV');
  db.prepare('DELETE FROM sites WHERE plaid = ?').run('TEST-COMB-BOM');
  console.log('  BOM tests passed');
}

try {
  runUnitTests();
  runIntegrationTests();
  runSecurityChecks();
  await runBomTests();
  cleanup();
  console.log('\n✓ All automated tests passed\n');
  process.exit(0);
} catch (e) {
  cleanup();
  console.error('\n✗', e.message);
  process.exit(1);
}
