import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { deleteRecord, getRecord, insertRecord, updateRecord } from './ipamService.js';
import { validateBeforeSave } from './ipamIntegrity.js';

async function runInTransaction(fn) {
  await db.exec('BEGIN');
  try {
    const result = await fn();
    if (result?.error) {
      await db.exec('ROLLBACK');
      return result;
    }
    await db.exec('COMMIT');
    return result;
  } catch (e) {
    await db.exec('ROLLBACK');
    return { error: String(e?.message ?? e) };
  }
}

export const WORKFLOW_STATES = [
  'REQUESTED',
  'VALIDATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'RESERVED',
  'ACTIVE',
  'MODIFIED',
  'REJECTED',
  'DECOMMISSIONED',
];

const ALLOWED_TRANSITIONS = {
  REQUESTED: new Set(['VALIDATED']),
  VALIDATED: new Set(['PENDING_APPROVAL', 'REQUESTED', 'REJECTED']),
  PENDING_APPROVAL: new Set(['APPROVED', 'REJECTED', 'REQUESTED']),
  APPROVED: new Set(['RESERVED', 'ACTIVE']),
  RESERVED: new Set(['ACTIVE']),
  ACTIVE: new Set(['MODIFIED', 'DECOMMISSIONED']),
  MODIFIED: new Set(['ACTIVE']),
  REJECTED: new Set(['REQUESTED']),
  DECOMMISSIONED: new Set(),
};

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowToWorkflow(row) {
  if (!row) return null;
  return {
    id: row.id,
    address: row.address,
    record_type: row.record_type,
    project: row.project ?? '',
    location: row.location,
    vlan: row.vlan,
    description: row.description,
    requester: row.requester ?? 'user',
    state: row.state,
    netlens_result: parseJson(row.netlens_result),
    ipam_record_id: row.ipam_record_id,
    override_reason: row.override_reason,
    rejected_reason: row.rejected_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToLog(row) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    from_state: row.from_state,
    to_state: row.to_state,
    action: row.action,
    actor: row.actor ?? 'user',
    reason: row.reason,
    created_at: row.created_at,
  };
}

async function appendLog(workflowId, fromState, toState, action, actor, reason) {
  await db.prepare(
    `INSERT INTO ip_workflow_log (id, workflow_id, from_state, to_state, action, actor, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), workflowId, fromState, toState, action, actor ?? 'user', reason ?? null);
}

async function transition(workflow, toState, action, actor, reason) {
  const allowed = ALLOWED_TRANSITIONS[workflow.state];
  if (!allowed?.has(toState)) {
    return {
      error: `Cannot transition from ${workflow.state} to ${toState}.`,
      allowed: [...(allowed ?? [])],
    };
  }
  await db.prepare(`UPDATE ip_workflows SET state = ?, updated_at = datetime('now') WHERE id = ?`).run(
    toState,
    workflow.id,
  );
  await appendLog(workflow.id, workflow.state, toState, action, actor, reason);
  return { workflow: await getWorkflow(workflow.id) };
}

export function netlensIsValid(result) {
  if (!result) return false;
  if (result.valid === false) return false;
  if (result.validation?.status === 'invalid') return false;
  if (result.validation?.status === 'valid') return true;
  if (result.valid === true) return true;
  return result.validation?.status !== 'invalid';
}

export function netlensHasConflict(result) {
  if (!result) return false;
  if (result.overlap === true) return true;
  if (Array.isArray(result.conflicts) && result.conflicts.length > 0) return true;
  if (Array.isArray(result.insights?.conflicts) && result.insights.conflicts.length > 0) return true;
  return false;
}

export function netlensSuggestion(result) {
  if (!result) return null;
  if (typeof result.suggestion === 'string' && result.suggestion.trim()) return result.suggestion.trim();
  const fromInsights = result.insights?.suggestions?.[0];
  if (typeof fromInsights === 'string' && fromInsights.trim()) return fromInsights.trim();
  return null;
}

function workflowIsBlocked(workflow) {
  const nl = workflow.netlens_result;
  if (workflow.state === 'REQUESTED' && !nl) return true;
  if (workflow.state === 'PENDING_APPROVAL') {
    if (!netlensIsValid(nl) && !workflow.override_reason) return true;
    if (netlensHasConflict(nl) && !workflow.override_reason) return true;
  }
  return false;
}

async function syncIpamRecord(workflow, registryStatus) {
  const payload = {
    address: workflow.address,
    record_type: workflow.record_type,
    status: registryStatus,
    project: workflow.project,
    vlan: workflow.vlan,
    location: workflow.location,
    description: workflow.description ?? `Workflow ${workflow.id}`,
  };

  if (workflow.ipam_record_id) {
    const existing = await getRecord(workflow.ipam_record_id);
    if (existing) {
      return await updateRecord(workflow.ipam_record_id, payload);
    }
  }

  const recordId = randomUUID();
  const result = await insertRecord(recordId, payload);
  if (result.record) {
    await db.prepare(`UPDATE ip_workflows SET ipam_record_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      result.record.id,
      workflow.id,
    );
  }
  return result;
}

export async function listWorkflows(filters = {}) {
  let sql = 'SELECT * FROM ip_workflows WHERE 1=1';
  const params = [];
  if (filters.state) {
    sql += ' AND state = ?';
    params.push(filters.state);
  }
  if (filters.q) {
    sql += ' AND (address LIKE ? OR project LIKE ? OR requester LIKE ? OR location LIKE ?)';
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY updated_at DESC, created_at DESC';
  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(Number(filters.limit));
  }
  return await db.prepare(sql).all(...params).map(rowToWorkflow);
}

export async function getWorkflow(id) {
  return rowToWorkflow(await db.prepare('SELECT * FROM ip_workflows WHERE id = ?').get(id));
}

export async function listWorkflowHistory(workflowId, limit = 100) {
  return (await db
    .prepare(
      `SELECT * FROM ip_workflow_log WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(workflowId, limit)).map(rowToLog);
}

export async function listAllWorkflowHistory(limit = 200) {
  return (await db
    .prepare(`SELECT * FROM ip_workflow_log ORDER BY created_at DESC LIMIT ?`)
    .all(limit)).map(rowToLog);
}

export async function buildWorkflowDashboard() {
  const workflows = await listWorkflows();
  const queueStates = new Set(['REQUESTED', 'VALIDATED', 'PENDING_APPROVAL']);
  const activeStates = new Set(['APPROVED', 'RESERVED', 'ACTIVE', 'MODIFIED']);

  const requestsQueue = workflows.filter((w) => queueStates.has(w.state));
  const activeWorkflows = workflows.filter((w) => activeStates.has(w.state));
  const blockedRequests = workflows.filter((w) => workflowIsBlocked(w));
  const rejectedRequests = workflows.filter((w) => w.state === 'REJECTED');
  const history = await listAllWorkflowHistory(150);
  const staleDays = 7;
  const staleCutoff = Date.now() - staleDays * 86400000;
  const staleRequests = requestsQueue.filter((w) => {
    const ts = Date.parse(w.updated_at ?? w.created_at ?? '');
    return Number.isFinite(ts) && ts < staleCutoff;
  });

  const byState = {};
  for (const state of WORKFLOW_STATES) {
    byState[state] = workflows.filter((w) => w.state === state).length;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      total: workflows.length,
      queue: requestsQueue.length,
      active: activeWorkflows.length,
      blocked: blockedRequests.length,
      stale: staleRequests.length,
      byState,
    },
    requestsQueue,
    activeWorkflows,
    blockedRequests,
    rejectedRequests,
    staleRequests,
    history,
  };
}

export async function createWorkflowRequest(body) {
  const address = String(body.address ?? '').trim();
  if (!address) return { error: 'Address is required.' };

  const recordType = body.record_type === 'host' ? 'host' : 'subnet';
  if (recordType === 'subnet' && !address.includes('/')) {
    return { error: 'Subnet requests must use CIDR notation (e.g. 10.0.0.0/27).' };
  }

  const id = randomUUID();
  await db.prepare(
    `INSERT INTO ip_workflows
     (id, address, record_type, project, location, vlan, description, requester, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED')`,
  ).run(
    id,
    address,
    recordType,
    String(body.project ?? ''),
    body.location ?? null,
    body.vlan ?? null,
    body.description ?? null,
    String(body.requester ?? 'user'),
  );
  await appendLog(id, null, 'REQUESTED', 'create', body.requester ?? 'user', body.reason ?? 'Allocation request created');
  const workflow = await getWorkflow(id);
  if (body.netlens) {
    return await attachNetLensResult(id, body.netlens, body.requester ?? 'user');
  }
  return { workflow };
}

export async function attachNetLensResult(id, netlensResult, actor = 'user') {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (!['REQUESTED', 'VALIDATED'].includes(workflow.state)) {
    return { error: `NetLens results can only be attached while REQUESTED or VALIDATED (current: ${workflow.state}).` };
  }

  const normalized = netlensResult ?? {};
  await db.prepare(
    `UPDATE ip_workflows SET netlens_result = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(normalized), id);

  const updated = await getWorkflow(id);
  if (workflow.state === 'REQUESTED') {
    return await transition(updated, 'VALIDATED', 'attach_netlens', actor, 'NetLens validation attached');
  }

  await appendLog(id, workflow.state, workflow.state, 'attach_netlens', actor, 'NetLens validation updated');
  return { workflow: await getWorkflow(id) };
}

export async function submitForApproval(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (!workflow.netlens_result) {
    return { error: 'Attach a NetLens validation result before submitting for approval.' };
  }
  return await transition(workflow, 'PENDING_APPROVAL', 'submit_approval', actor, reason ?? 'Submitted for approval');
}

export async function approveWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };

  const nl = workflow.netlens_result;
  if (!netlensIsValid(nl) && !workflow.override_reason) {
    return { error: 'Cannot approve: NetLens validation is invalid. Use override with a reason first.' };
  }
  if (netlensHasConflict(nl) && !workflow.override_reason) {
    return {
      error: 'Cannot approve: NetLens detected conflicts. Apply a suggestion, resolve conflicts, or use admin override.',
      conflicts: nl?.conflicts ?? nl?.insights?.conflicts ?? [],
      suggestion: netlensSuggestion(nl),
    };
  }

  const result = await transition(workflow, 'APPROVED', 'approve', actor, reason ?? 'Approved for allocation');
  if (result.error) return result;
  return { ...result, workflow: await getWorkflow(id) };
}

export async function rejectWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (!['VALIDATED', 'PENDING_APPROVAL'].includes(workflow.state)) {
    return { error: `Reject is only allowed from VALIDATED or PENDING_APPROVAL (current: ${workflow.state}).` };
  }
  await db.prepare(
    `UPDATE ip_workflows SET rejected_reason = ?, override_reason = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(reason ?? 'Request rejected', id);
  return await transition(workflow, 'REJECTED', 'reject', actor, reason ?? 'Request rejected');
}

export async function overrideWorkflow(id, actor = 'admin', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (workflow.state !== 'PENDING_APPROVAL') {
    return { error: 'Override is only allowed while PENDING_APPROVAL.' };
  }
  if (!reason?.trim()) {
    return { error: 'Override requires an admin reason.' };
  }

  await db.prepare(
    `UPDATE ip_workflows SET override_reason = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(reason.trim(), id);
  await appendLog(id, workflow.state, workflow.state, 'override', actor, reason.trim());
  return { workflow: await getWorkflow(id) };
}

export async function applyNetLensSuggestion(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  const suggestion = netlensSuggestion(workflow.netlens_result);
  if (!suggestion) return { error: 'No NetLens suggestion available for this workflow.' };

  await db.prepare(
    `UPDATE ip_workflows SET address = ?, netlens_result = NULL, override_reason = NULL, state = 'REQUESTED', updated_at = datetime('now') WHERE id = ?`,
  ).run(suggestion, id);
  await appendLog(
    id,
    workflow.state,
    'REQUESTED',
    'apply_suggestion',
    actor,
    reason ?? `Applied NetLens suggestion: ${suggestion}`,
  );
  return { workflow: await getWorkflow(id), appliedAddress: suggestion };
}

export async function modifyWorkflow(id, body, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };

  const fields = [];
  const params = [];
  const updates = {
    address: body.address,
    project: body.project,
    location: body.location,
    vlan: body.vlan,
    description: body.description,
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      params.push(value === null ? null : String(value));
    }
  }

  if (fields.length === 0) return { error: 'No fields to modify.' };

  const fromActive = workflow.state === 'ACTIVE';
  const nextAddress = body.address !== undefined ? String(body.address) : workflow.address;
  const nextProject = body.project !== undefined ? String(body.project) : workflow.project;
  const nextLocation = body.location !== undefined ? body.location : workflow.location;
  const nextVlan = body.vlan !== undefined ? body.vlan : workflow.vlan;
  const nextDescription = body.description !== undefined ? body.description : workflow.description;

  if (fromActive) {
    const check = await validateBeforeSave(
      {
        address: nextAddress,
        record_type: workflow.record_type,
        status: (await getRecord(workflow.ipam_record_id))?.status ?? 'used',
        project: nextProject,
        vlan: nextVlan,
        location: nextLocation,
        description: nextDescription,
      },
      workflow.ipam_record_id,
    );
    if (!check.allowed) {
      return { error: check.error ?? 'Modification failed validation.', conflicts: check.conflicts ?? [] };
    }
  }

  return await runInTransaction(async () => {
    if (fromActive) {
      await db.prepare(`UPDATE ip_workflows SET state = 'MODIFIED', updated_at = datetime('now') WHERE id = ?`).run(id);
      await appendLog(id, 'ACTIVE', 'MODIFIED', 'modify', actor, reason ?? 'Metadata modified');
    }

    params.push(id);
    await db.prepare(`UPDATE ip_workflows SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);

    let current = await getWorkflow(id);
    if (fromActive) {
      const toActive = await transition(current, 'ACTIVE', 'modify_complete', actor, reason ?? 'Modification applied');
      if (toActive.error) return toActive;
      current = toActive.workflow ?? current;

      if (current.ipam_record_id) {
        const ipam = await syncIpamRecord(current, (await getRecord(current.ipam_record_id))?.status ?? 'used');
        if (ipam.error) {
          return { error: ipam.error, conflicts: ipam.conflicts ?? [] };
        }
      }
    } else {
      await appendLog(id, workflow.state, workflow.state, 'modify', actor, reason ?? 'Request metadata updated');
      current = await getWorkflow(id);
    }

    return { workflow: current };
  });
}

export async function reserveWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };

  return await runInTransaction(async () => {
    const result = await transition(workflow, 'RESERVED', 'reserve', actor, reason ?? 'Reserved in registry');
    if (result.error) return result;

    const ipam = await syncIpamRecord(result.workflow, 'reserved');
    if (ipam.error) {
      return { error: ipam.error, conflicts: ipam.conflicts ?? [] };
    }
    return {
      workflow: await getWorkflow(id),
      ipamRecord: ipam.record ?? (await getRecord((await getWorkflow(id)).ipam_record_id)),
    };
  });
}

export async function activateWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (!['APPROVED', 'RESERVED', 'MODIFIED'].includes(workflow.state)) {
    return { error: 'Only APPROVED, RESERVED, or MODIFIED workflows can be activated.' };
  }

  return await runInTransaction(async () => {
    let current = workflow;
    if (current.state === 'APPROVED' && !current.ipam_record_id) {
      const ipam = await syncIpamRecord(current, 'reserved');
      if (ipam.error) return { error: ipam.error, conflicts: ipam.conflicts ?? [] };
      current = await getWorkflow(id);
    }

    const result = await transition(current, 'ACTIVE', 'activate', actor, reason ?? 'Allocation activated');
    if (result.error) return result;

    const ipam = await syncIpamRecord(result.workflow, 'used');
    if (ipam.error) {
      return { error: ipam.error, conflicts: ipam.conflicts ?? [] };
    }
    return {
      workflow: await getWorkflow(id),
      ipamRecord: ipam.record ?? (await getRecord((await getWorkflow(id)).ipam_record_id)),
    };
  });
}

export async function decommissionWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };

  return await runInTransaction(async () => {
    const result = await transition(workflow, 'DECOMMISSIONED', 'decommission', actor, reason ?? 'Decommissioned');
    if (result.error) return result;

    if (workflow.ipam_record_id) {
      const del = await deleteRecord(workflow.ipam_record_id, { cascade: false });
      if (!del.deleted) {
        return {
          error: del.error ?? 'Could not remove registry record.',
          hosts: del.hosts,
          childSubnets: del.childSubnets,
        };
      }
      await db.prepare(`UPDATE ip_workflows SET ipam_record_id = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
    }

    return { workflow: await getWorkflow(id) };
  });
}

export async function reopenWorkflow(id, actor = 'user', reason) {
  const workflow = await getWorkflow(id);
  if (!workflow) return { error: 'Workflow not found' };
  if (workflow.state !== 'REJECTED') {
    return { error: 'Only REJECTED workflows can be reopened.' };
  }
  await db.prepare(
    `UPDATE ip_workflows SET rejected_reason = NULL, netlens_result = NULL, override_reason = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  return await transition(await getWorkflow(id), 'REQUESTED', 'reopen', actor, reason ?? 'Request reopened');
}

export async function performWorkflowAction(id, body) {
  const action = body.action;
  const actor = body.actor ?? 'user';
  const reason = body.reason;
  const payload = body.payload ?? {};

  switch (action) {
    case 'submit_approval':
      return await submitForApproval(id, actor, reason);
    case 'approve':
      return await approveWorkflow(id, actor, reason);
    case 'reject':
      return await rejectWorkflow(id, actor, reason);
    case 'override':
      return await overrideWorkflow(id, actor, reason);
    case 'apply_suggestion':
      return await applyNetLensSuggestion(id, actor, reason);
    case 'modify':
      return await modifyWorkflow(id, payload, actor, reason);
    case 'reserve':
      return await reserveWorkflow(id, actor, reason);
    case 'activate':
      return await activateWorkflow(id, actor, reason);
    case 'decommission':
      return await decommissionWorkflow(id, actor, reason);
    case 'reopen':
      return await reopenWorkflow(id, actor, reason);
    default:
      return { error: `Unknown workflow action: ${action}` };
  }
}
