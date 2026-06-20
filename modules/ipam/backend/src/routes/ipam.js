import { Router } from 'express';
import { randomUUID } from 'node:crypto';
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
  getCapabilities,
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

router.get('/capabilities', (_req, res) => {
  res.json(getCapabilities());
});

router.get('/picklists', (_req, res) => {
  res.json(listPicklists());
});

router.get('/settings', (_req, res) => {
  res.json({ settings: listSettings(), utilizationAlertPercent: getUtilizationAlertPercent() });
});

router.put('/settings', adminRouteGuard, (req, res) => {
  const body = req.body ?? {};
  if (body.utilization_alert_percent !== undefined) {
    const pct = Number(body.utilization_alert_percent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      res.status(400).json({ detail: 'utilization_alert_percent must be between 1 and 100.' });
      return;
    }
    setSetting('utilization_alert_percent', String(Math.round(pct)));
  }
  res.json({ settings: listSettings(), utilizationAlertPercent: getUtilizationAlertPercent() });
});

router.get('/backup', adminRouteGuard, (_req, res) => {
  res.json(exportBackupBundle());
});

router.post('/backup/db', adminRouteGuard, (_req, res) => {
  const result = createDatabaseBackupFile();
  if (result.error) {
    res.status(500).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.post('/restore', adminRouteGuard, uploadLimiter, (req, res) => {
  const result = restoreFromBackupBundle(req.body ?? {});
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/audit/export.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-unified-audit.csv"');
  res.send(exportUnifiedAuditCsv());
});

router.get('/import/csv/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-import-template.csv"');
  res.send(csvImportTemplate());
});

router.get('/workflow/dashboard', (_req, res) => {
  res.json(buildWorkflowDashboard());
});

router.get('/workflow', (req, res) => {
  const workflows = listWorkflows({
    state: req.query.state,
    q: req.query.q,
    limit: req.query.limit,
  });
  res.json({ workflows });
});

router.post('/workflow', (req, res) => {
  const result = createWorkflowRequest(req.body ?? {});
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.get('/workflow/history', (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.json({ entries: listAllWorkflowHistory(limit) });
});

router.get('/workflow/:id', (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) {
    res.status(404).json({ detail: 'Workflow not found' });
    return;
  }
  res.json({ workflow, history: listWorkflowHistory(req.params.id) });
});

router.post('/workflow/:id/netlens', (req, res) => {
  const result = attachNetLensResult(req.params.id, req.body?.netlens ?? req.body ?? {}, req.body?.actor);
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

router.post('/workflow/:id/action', (req, res) => {
  const result = performWorkflowAction(req.params.id, req.body ?? {});
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

router.get('/records', (req, res) => {
  const filters = {
    status: req.query.status,
    record_type: req.query.type,
    project: req.query.project,
    q: req.query.q,
  };
  const page = req.query.page;
  const pageSize = req.query.pageSize ?? req.query.limit;
  const result = listRecords(filters, page ? { page, pageSize: pageSize ?? 100 } : {});
  if (Array.isArray(result)) {
    res.json({ records: result, total: result.length });
    return;
  }
  res.json(result);
});

router.post('/records/bulk-status', (req, res) => {
  const result = bulkUpdateStatus(req.body?.ids ?? [], req.body?.status);
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.post('/records', (req, res) => {
  try {
    const result = insertRecord(randomUUID(), req.body ?? {});
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
  const result = validateBeforeSave(body, body.exclude_id ?? null);
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

router.get('/integrity/audit', (_req, res) => {
  res.json(buildIntegrityAudit());
});

router.get('/integrity/report', (_req, res) => {
  res.json(buildIntegrityReport());
});

router.get('/integrity/report.txt', (_req, res) => {
  const report = buildIntegrityReport();
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-integrity-report.txt"');
  res.send(report.text);
});

router.post('/integrity/simulate', (req, res) => {
  res.json(simulateRecord(req.body ?? {}, req.body?.exclude_id ?? null));
});

router.post('/integrity/simulate/vlsm', (req, res) => {
  const body = req.body ?? {};
  const result = simulateVlsmImport(body.plan ?? body, body.project ?? '');
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/records/:id', (req, res) => {
  const record = getRecord(req.params.id);
  if (!record) {
    res.status(404).json({ detail: 'Record not found' });
    return;
  }
  res.json(record);
});

router.put('/records/:id', (req, res) => {
  const result = updateRecord(req.params.id, req.body ?? {});
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

router.delete('/records/:id', (req, res) => {
  const cascade = req.query.cascade === '1' || req.query.cascade === 'true';
  const result = deleteRecord(req.params.id, { cascade });
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

router.post('/search', (req, res) => {
  const result = searchQuery(req.body?.query ?? req.body?.q ?? '');
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json(result);
});

router.get('/dashboard', (_req, res) => {
  res.json({ subnets: buildDashboard() });
});

router.get('/analytics', (_req, res) => {
  res.json(buildAnalytics());
});

router.get('/conflicts/scan', (_req, res) => {
  res.json(scanAllConflicts());
});

router.get('/reports/utilization', (_req, res) => {
  const report = buildUtilizationReport();
  res.json(report);
});

router.get('/reports/utilization.txt', (_req, res) => {
  const report = buildUtilizationReport();
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-utilization-report.txt"');
  res.send(report.text);
});

router.get('/subnets/:id', (req, res) => {
  const detail = getSubnetDetail(req.params.id);
  if (detail.error) {
    res.status(404).json({ detail: detail.error });
    return;
  }
  res.json(detail);
});

router.get('/subnets/:id/next-ip', (req, res) => {
  const subnet = getRecord(req.params.id);
  if (!subnet || subnet.record_type !== 'subnet') {
    res.status(404).json({ detail: 'Subnet not found' });
    return;
  }
  res.json({ subnet: subnet.address, nextIp: suggestNextIpInSubnet(subnet) });
});

router.post('/import/vlsm', uploadLimiter, (req, res) => {
  const body = req.body ?? {};
  const result = importVlsmPlan(body.plan ?? body, body.project ?? '', body.parent_subnet_id ?? null);
  if (result.error && !result.created?.length) {
    res.status(400).json({ detail: result.error, errors: result.errors ?? [] });
    return;
  }
  res.status(201).json(result);
});

router.post('/import/csv', uploadLimiter, (req, res) => {
  const csv = req.body?.csv ?? req.body?.content ?? '';
  const result = bulkImportCsv(csv);
  if (result.error) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.status(201).json(result);
});

router.get('/audit', (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const registry = listAudit(limit);
  const workflow = listAllWorkflowHistory(limit);
  res.json({
    entries: registry,
    workflowEntries: workflow,
    unifiedCount: registry.length + workflow.length,
  });
});

router.get('/export/json', (_req, res) => {
  res.json(exportBackupBundle());
});

router.get('/export/csv', (_req, res) => {
  const records = listRecords();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ipam-export.csv"');
  res.send(recordsToCsv(records));
});

export default router;
