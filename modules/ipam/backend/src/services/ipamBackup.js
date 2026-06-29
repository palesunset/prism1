import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { SCHEMA_VERSION } from '../db/migrate.js';
import { listRecords, recordsToCsv } from './ipamService.js';
import { buildAnalytics } from './ipamAnalytics.js';
import { listAudit, logAudit } from './ipamAudit.js';
import { listAllWorkflowHistory, listWorkflows } from './ipamWorkflow.js';
import { listSettings } from './ipamSettings.js';
import { escapeCsvCell } from '../middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = process.env.IPAM_DB_PATH || path.join(__dirname, '..', '..', 'ipam.db');

export async function exportBackupBundle() {
  return {
    exported_at: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    records: await listRecords(),
    workflows: await listWorkflows(),
    workflow_history: await listAllWorkflowHistory(5000),
    audit: await listAudit(5000),
    settings: await listSettings(),
    analytics: await buildAnalytics(),
  };
}

export async function createDatabaseBackupFile() {
  if (!fs.existsSync(defaultDbPath)) {
    return { error: 'Database file not found.' };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(path.dirname(defaultDbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const dest = path.join(backupDir, `ipam-${stamp}.db`);
  fs.copyFileSync(defaultDbPath, dest);
  await logAudit('backup', null, dest, { type: 'sqlite_file' });
  return { path: dest, filename: path.basename(dest) };
}

export async function restoreFromBackupBundle(bundle) {
  if (!bundle?.records || !Array.isArray(bundle.records)) {
    return { error: 'Invalid backup bundle: records array required.' };
  }

  await db.exec('BEGIN');
  try {
    await db.prepare('DELETE FROM ip_workflow_log').run();
    await db.prepare('DELETE FROM ip_workflows').run();
    await db.prepare('DELETE FROM ip_audit').run();
    await db.prepare('DELETE FROM ip_records').run();

    const insertRecord = db.prepare(`
      INSERT INTO ip_records (
        id, address, record_type, status, project, vlan, location, description,
        cidr_prefix, range_start, range_end, hostname, mac_address, gateway,
        dhcp_scope, ptr_record, parent_subnet_id, address_family, v6_range_start, v6_range_end,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of bundle.records) {
      await insertRecord.run(
        r.id,
        r.address,
        r.record_type,
        r.status,
        r.project ?? '',
        r.vlan ?? null,
        r.location ?? null,
        r.description ?? null,
        r.cidr_prefix ?? null,
        r.range_start,
        r.range_end,
        r.hostname ?? null,
        r.mac_address ?? null,
        r.gateway ?? null,
        r.dhcp_scope ?? null,
        r.ptr_record ?? null,
        r.parent_subnet_id ?? null,
        r.address_family ?? 'ipv4',
        r.v6_range_start ?? null,
        r.v6_range_end ?? null,
        r.created_at ?? null,
        r.updated_at ?? null,
      );
    }

    if (Array.isArray(bundle.workflows)) {
      const insertWf = db.prepare(`
        INSERT INTO ip_workflows (
          id, address, record_type, project, location, vlan, description, requester, state,
          netlens_result, ipam_record_id, override_reason, rejected_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const w of bundle.workflows) {
        await insertWf.run(
          w.id,
          w.address,
          w.record_type,
          w.project ?? '',
          w.location ?? null,
          w.vlan ?? null,
          w.description ?? null,
          w.requester ?? 'user',
          w.state,
          w.netlens_result ? JSON.stringify(w.netlens_result) : null,
          w.ipam_record_id ?? null,
          w.override_reason ?? null,
          w.rejected_reason ?? null,
          w.created_at ?? null,
          w.updated_at ?? null,
        );
      }
    }

    if (Array.isArray(bundle.workflow_history)) {
      const insertLog = db.prepare(`
        INSERT INTO ip_workflow_log (id, workflow_id, from_state, to_state, action, actor, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of bundle.workflow_history) {
        await insertLog.run(
          e.id,
          e.workflow_id,
          e.from_state ?? null,
          e.to_state,
          e.action,
          e.actor ?? 'user',
          e.reason ?? null,
          e.created_at ?? null,
        );
      }
    }

    if (Array.isArray(bundle.audit)) {
      const insertAudit = db.prepare(`
        INSERT INTO ip_audit (id, action, record_id, address, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const e of bundle.audit) {
        await insertAudit.run(
          e.id,
          e.action,
          e.record_id ?? null,
          e.address ?? null,
          e.details ? JSON.stringify(e.details) : null,
          e.created_at ?? null,
        );
      }
    }

    if (Array.isArray(bundle.settings)) {
      for (const s of bundle.settings) {
        await db.prepare(
          `INSERT INTO ip_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run(s.key, s.value);
      }
    }

    await db.exec('COMMIT');
    await logAudit('restore', null, null, {
      records: bundle.records.length,
      workflows: bundle.workflows?.length ?? 0,
      workflow_history: bundle.workflow_history?.length ?? 0,
      audit: bundle.audit?.length ?? 0,
    });
    return {
      restored: bundle.records.length,
      workflows: bundle.workflows?.length ?? 0,
      workflow_history: bundle.workflow_history?.length ?? 0,
      audit: bundle.audit?.length ?? 0,
    };
  } catch (e) {
    await db.exec('ROLLBACK');
    return { error: String(e?.message ?? e) };
  }
}

export async function exportUnifiedAuditCsv() {
  const registry = (await listAudit(2000)).map((e) => ({
    source: 'registry',
    at: e.created_at,
    action: e.action,
    ref: e.record_id,
    address: e.address,
    details: JSON.stringify(e.details ?? {}),
  }));
  const workflow = (await listAllWorkflowHistory(2000)).map((e) => ({
    source: 'workflow',
    at: e.created_at,
    action: e.action,
    ref: e.workflow_id,
    address: '',
    details: `${e.from_state ?? '—'} → ${e.to_state}${e.reason ? ` (${e.reason})` : ''}`,
  }));

  const merged = [...registry, ...workflow].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const header = ['Source', 'Timestamp', 'Action', 'Reference', 'Address', 'Details'];
  const rows = merged.map((r) => [r.source, r.at, r.action, r.ref ?? '', r.address ?? '', r.details]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export { recordsToCsv };
