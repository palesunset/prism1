import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { promisifyRouter } from 'prism-db/expressAsync.js';
import { createAdminRouteGuard, createRateLimiters, getSecurityConfig } from '../middleware/security.js';
import { listAudit } from '../services/ipamAudit.js';
import {
  createDatabaseBackupFile,
  exportBackupBundle,
  exportUnifiedAuditCsv,
  restoreFromBackupBundle,
} from '../services/ipamBackup.js';
import {
  buildAnalytics,
  buildUtilizationReport,
  getSubnetDetail,
  scanAllConflicts,
  suggestNextIpInSubnet,
} from '../services/ipamAnalytics.js';
import {
  buildIntegrityAudit,
  buildIntegrityReport,
  simulateRecord,
  simulateVlsmImport,
  validateBeforeSave,
} from '../services/ipamIntegrity.js';
import {
  getUtilizationAlertPercent,
  listSettings,
  setSetting,
} from '../services/ipamSettings.js';
import {
  buildDashboard,
  bulkImportCsv,
  bulkUpdateStatus,
  csvImportTemplate,
  deleteRecord,
  getRecord,
  importVlsmPlan,
  insertRecord,
  listPicklists,
  listRecords,
  recordsToCsv,
  searchQuery,
  updateRecord,
} from '../services/ipamService.js';
import {
  attachNetLensResult,
  buildWorkflowDashboard,
  createWorkflowRequest,
  getWorkflow,
  listAllWorkflowHistory,
  listWorkflowHistory,
  listWorkflows,
  performWorkflowAction,
} from '../services/ipamWorkflow.js';
import { crossCheckInventory } from '../services/ipamInventoryCrossCheck.js';

const router = Router();
const adminRouteGuard = createAdminRouteGuard(getSecurityConfig());
const uploadLimiter = createRateLimiters(getSecurityConfig()).upload;

router.get('/picklists', async (_req, res) => {
  res.json(await listPicklists());
});

router.get('/bootstrap', async (_req, res) => {
  const [subnets, picklists] = await Promise.all([buildDashboard(), listPicklists()]);
  res.json({ subnets, picklists });
});

router.get('/settings', async (_req, res) => {
  res.json({ settings: await listSettings(), utilizationAlertPercent: await getUtilizationAlertPercent() });
});

router.put('/settings', adminRouteGuard, async (req, res) => {
  const body = req.body ?? {};
  if (body.utilization_alert_percent !== undefined) {
    const pct = Number(body.utilization_alert_percent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      res.status(400).json({ detail: 'utilization_alert_percent must be between 1 and 100.' });
      return;
    }
    await setSetting('utilization_alert_percent', String(Math.round(pct)));
  }
  res.json({ settings: await listSettings(), utilizationAlertPercent: await getUtilizationAlertPercent() });
});

router.get('/backup', adminRouteGuard, async (_req, res) => {
  res.json(await exportBackupBundle());
});

router.post('/backup/db', adminRouteGuard, async (_req, res) => {
  const result = await createDatabaseBackupFile();
  if (result.error) {
    res.status(500).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.post('/restore', adminRouteGuard, uploadLimiter, async (req, res) => {
  const result = await restoreFromBackupBundle(req.body ?? {});
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/audit/export.csv', async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-unified-audit.csv"');
  res.send(await exportUnifiedAuditCsv());
});

router.get('/import/csv/template', async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-import-template.csv"');
  res.send(csvImportTemplate());
});

router.get('/workflow/dashboard', async (_req, res) => {
  res.json(await buildWorkflowDashboard());
});

router.get('/workflow', async (req, res) => {
  const workflows = await listWorkflows({
    state: req.query.state,
    q: req.query.q,
    limit: req.query.limit,
  });
  res.json({ workflows });
});

router.post('/workflow', async (req, res) => {
  const result = await createWorkflowRequest(req.body ?? {});
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.get('/workflow/history', async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.json({ entries: await listAllWorkflowHistory(limit) });
});

router.get('/workflow/:id', async (req, res) => {
  const workflow = await getWorkflow(req.params.id);
  if (!workflow) {
    res.status(404).json({ detail: 'Workflow not found' });
    return;
  }
  res.json({ workflow, history: await listWorkflowHistory(req.params.id) });
});

router.post('/workflow/:id/netlens', async (req, res) => {
  const result = await attachNetLensResult(req.params.id, req.body?.netlens ?? req.body ?? {}, req.body?.actor);
  if (result.error === 'Workflow not found') {
    res.status(404).json({ detail: result.error });
    return;
  }
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.post('/workflow/:id/action', async (req, res) => {
  const result = await performWorkflowAction(req.params.id, req.body ?? {});
  if (result.error === 'Workflow not found') {
    res.status(404).json({ detail: result.error });
    return;
  }
  if (result.error) {
    const status = result.conflicts?.length || result.ipamConflicts?.length ? 409 : 400;
    res.status(status).json({
      detail: result.error,
      conflicts: result.conflicts ?? result.ipamConflicts,
      suggestion: result.suggestion,
      allowed: result.allowed,
      hosts: result.hosts,
      childSubnets: result.childSubnets,
    });
    return;
  }
  if (result.ipamError) {
    res.status(409).json({
      detail: result.ipamError,
      conflicts: result.ipamConflicts ?? [],
    });
    return;
  }
  res.json(result);
});

router.get('/records', async (req, res) => {
  const filters = {
    status: req.query.status,
    record_type: req.query.type,
    project: req.query.project,
    q: req.query.q,
  };
  const page = req.query.page;
  const pageSize = req.query.pageSize ?? req.query.limit;
  const result = await listRecords(filters, page ? { page, pageSize: pageSize ?? 100 } : {});
  if (Array.isArray(result)) {
    res.json({ records: result, total: result.length });
    return;
  }
  res.json(result);
});

router.post('/records/bulk-status', async (req, res) => {
  const result = await bulkUpdateStatus(req.body?.ids ?? [], req.body?.status);
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.post('/records', async (req, res) => {
  try {
    const result = await insertRecord(randomUUID(), req.body ?? {});
    if (result.error) {
      res.status(409).json({ detail: result.error, conflicts: result.conflicts ?? [] });
      return;
    }
    res.status(201).json(result);
  } catch (e) {
    console.error('[ipam] create record failed:', e);
    res.status(500).json({ detail: 'Could not save record. Please try again.' });
  }
});

router.post('/validate', async (req, res) => {
  const body = req.body ?? {};
  const result = await validateBeforeSave(body, body.exclude_id ?? null);
  if (result.error && !result.allowed) {
    res.status(result.outcome === 'block' ? 409 : 400).json(result);
    return;
  }

  const recordType = body.record_type === 'host' ? 'host' : body.record_type === 'subnet' ? 'subnet' : null;
  const address = result.parsed?.normalized ?? body.address;
  if (body.inventory_crosscheck !== false && recordType === 'host' && address) {
    const inventory = await crossCheckInventory(address, body.hostname ?? null);
    result.inventory = inventory;
    if (inventory.warnings?.length) {
      result.warnings = [...(result.warnings ?? []), ...inventory.warnings];
      if (result.allowed && result.outcome === 'allow' && inventory.warnings.length > 0) {
        result.outcome = 'warn';
      }
    }
  }

  res.json(result);
});

router.get('/crosscheck/inventory', async (req, res) => {
  const address = String(req.query.address ?? '').trim();
  if (!address) {
    res.status(400).json({ detail: 'address query parameter is required' });
    return;
  }
  const hostname = req.query.hostname ? String(req.query.hostname) : null;
  res.json(await crossCheckInventory(address, hostname));
});

router.get('/integrity/audit', async (_req, res) => {
  res.json(await buildIntegrityAudit());
});

router.get('/integrity/report', async (_req, res) => {
  res.json(await buildIntegrityReport());
});

router.get('/integrity/report.txt', async (_req, res) => {
  const report = await buildIntegrityReport();
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-integrity-report.txt"');
  res.send(report.text);
});

router.post('/integrity/simulate', async (req, res) => {
  res.json(await simulateRecord(req.body ?? {}, req.body?.exclude_id ?? null));
});

router.post('/integrity/simulate/vlsm', async (req, res) => {
  const body = req.body ?? {};
  const result = await simulateVlsmImport(body.plan ?? body, body.project ?? '');
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/records/:id', async (req, res) => {
  const record = await getRecord(req.params.id);
  if (!record) {
    res.status(404).json({ detail: 'Record not found' });
    return;
  }
  res.json(record);
});

router.put('/records/:id', async (req, res) => {
  const result = await updateRecord(req.params.id, req.body ?? {});
  if (result.error === 'Record not found') {
    res.status(404).json({ detail: result.error });
    return;
  }
  if (result.error) {
    res.status(409).json({ detail: result.error, conflicts: result.conflicts ?? [] });
    return;
  }
  res.json(result);
});

router.delete('/records/:id', async (req, res) => {
  const cascade = req.query.cascade === '1' || req.query.cascade === 'true';
  const result = await deleteRecord(req.params.id, { cascade });
  if (!result.deleted) {
    const status = result.hosts || result.childSubnets ? 409 : 404;
    res.status(status).json({
      detail: result.error ?? 'Record not found',
      hosts: result.hosts,
      childSubnets: result.childSubnets,
    });
    return;
  }
  res.status(204).end();
});

router.post('/search', async (req, res) => {
  const result = await searchQuery(req.body?.query ?? req.body?.q ?? '');
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/dashboard', async (_req, res) => {
  res.json({ subnets: await buildDashboard() });
});

router.get('/analytics', async (req, res) => {
  const includeConflictScan = req.query.scan === '1' || req.query.conflicts === '1';
  const records = await listRecords();
  res.json(
    await buildAnalytics({
      records,
      dashboard: await buildDashboard(records),
      includeConflictScan,
    }),
  );
});

router.get('/conflicts/scan', async (_req, res) => {
  res.json(await scanAllConflicts());
});

router.get('/reports/utilization', async (_req, res) => {
  const report = await buildUtilizationReport();
  res.json(report);
});

router.get('/reports/utilization.txt', async (_req, res) => {
  const report = await buildUtilizationReport();
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-utilization-report.txt"');
  res.send(report.text);
});

router.get('/subnets/:id', async (req, res) => {
  const detail = await getSubnetDetail(req.params.id);
  if (detail.error) {
    res.status(404).json({ detail: detail.error });
    return;
  }
  res.json(detail);
});

router.get('/subnets/:id/next-ip', async (req, res) => {
  const subnet = await getRecord(req.params.id);
  if (!subnet || subnet.record_type !== 'subnet') {
    res.status(404).json({ detail: 'Subnet not found' });
    return;
  }
  res.json({ subnet: subnet.address, nextIp: await suggestNextIpInSubnet(subnet) });
});

router.post('/import/vlsm', uploadLimiter, async (req, res) => {
  const body = req.body ?? {};
  const result = await importVlsmPlan(body.plan ?? body, body.project ?? '', body.parent_subnet_id ?? null);
  if (result.error && !result.created?.length) {
    res.status(400).json({ detail: result.error, errors: result.errors ?? [] });
    return;
  }
  res.status(201).json(result);
});

router.post('/import/csv', uploadLimiter, async (req, res) => {
  const csv = req.body?.csv ?? req.body?.content ?? '';
  const result = await bulkImportCsv(csv);
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.get('/audit', async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const registry = await listAudit(limit);
  const workflow = await listAllWorkflowHistory(limit);
  res.json({
    entries: registry,
    workflowEntries: workflow,
    unifiedCount: registry.length + workflow.length,
  });
});

router.get('/export/json', async (_req, res) => {
  res.json(await exportBackupBundle());
});

router.get('/export/csv', async (_req, res) => {
  const records = await listRecords();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-export.csv"');
  res.send(recordsToCsv(records));
});

promisifyRouter(router);

export default router;
