const BASE = 'http://127.0.0.1:3003/api/ipam';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail ?? res.statusText);
  return data;
}

async function run() {
  await req('GET', '/health');

  const caps = await req('GET', '/capabilities');
  if (!caps.phases?.['1']?.status) throw new Error('Capabilities manifest missing phases');

  const existing = await req('GET', '/records');
  for (const r of existing.records ?? []) {
    await fetch(`${BASE}/records/${r.id}`, { method: 'DELETE' });
  }

  const created = await req('POST', '/records', {
    address: '192.168.200.0/24',
    record_type: 'subnet',
    status: 'reserved',
    project: 'Test LAN',
    location: 'HQ',
  });
  if (!created.record?.id) throw new Error('Create subnet failed');
  const subnetId = created.record.id;

  await req('POST', '/records', {
    address: '192.168.200.10',
    record_type: 'host',
    status: 'used',
    project: 'Router',
  });

  const search = await req('POST', '/search', { query: '192.168.200.10' });
  if (!search.exactMatches?.length) throw new Error('Search should find host');

  const validate = await req('POST', '/validate', {
    address: '192.168.200.20',
    record_type: 'host',
    status: 'used',
  });
  if (!validate.allowed) throw new Error('Validate should pass for free host');

  const dash = await req('GET', '/dashboard');
  if (!dash.subnets?.length) throw new Error('Dashboard should list subnet');

  const analytics = await req('GET', '/analytics');
  if (analytics.totals.records < 2) throw new Error('Analytics should count records');

  const detail = await req('GET', `/subnets/${subnetId}`);
  if (!detail.subnet?.address) throw new Error('Subnet detail missing');

  const statusUpdate = await req('PUT', `/records/${subnetId}`, { status: 'used' });
  if (statusUpdate.record?.status !== 'used') throw new Error('Subnet status update should succeed when hosts exist inside');

  const nextIp = await req('GET', `/subnets/${subnetId}/next-ip`);
  if (!nextIp.nextIp) throw new Error('Next IP suggestion should exist');

  const conflicts = await req('GET', '/conflicts/scan');
  if (typeof conflicts.count !== 'number') throw new Error('Conflict scan failed');

  const report = await req('GET', '/reports/utilization');
  if (!report.text?.includes('Utilization Report')) throw new Error('Utilization report missing');

  const audit = await req('GET', '/audit');
  if (!Array.isArray(audit.entries)) throw new Error('Audit log failed');

  try {
    await req('POST', '/records', {
      address: '192.168.200.10',
      record_type: 'host',
      status: 'used',
      project: 'Duplicate',
    });
    throw new Error('Duplicate host should fail');
  } catch (e) {
    if (!String(e.message).includes('Duplicate')) throw e;
  }

  const dupRes = await fetch(`${BASE}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: '192.168.200.11',
      record_type: 'host',
      status: 'used',
      project: 'First',
    }),
  });
  if (dupRes.status !== 201) throw new Error('Setup host for duplicate test failed');
  const dupAgain = await fetch(`${BASE}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: '192.168.200.11',
      record_type: 'host',
      status: 'used',
      project: 'Second',
    }),
  });
  if (dupAgain.status !== 409) {
    throw new Error(`Duplicate host should return 409, got ${dupAgain.status}`);
  }
  const dupBody = await dupAgain.json();
  if (!String(dupBody.detail ?? '').includes('already registered')) {
    throw new Error('Duplicate host response should explain address is already registered');
  }

  const vlsm = await req('POST', '/import/vlsm', {
    project: '10.0.0.0/24',
    plan: {
      baseNetwork: '10.0.0.0/24',
      subnets: [
        { cidr: '10.0.0.0/26', site: 'A', requiredHosts: 50, vlanId: '1' },
        { cidr: '10.0.0.64/27', site: 'B', requiredHosts: 25, vlanId: '2' },
        { cidr: '10.0.0.96/28', site: 'C', requiredHosts: 10, vlanId: '3' },
        { cidr: '10.0.0.112/29', site: 'D', requiredHosts: 5, vlanId: '4' },
      ],
    },
  });
  if (vlsm.created?.length !== 4) {
    throw new Error(`VLSM import should create 4 adjacent subnets, got ${vlsm.created?.length} (${vlsm.errors?.length ?? 0} errors)`);
  }

  const integrity = await req('GET', '/integrity/audit');
  if (typeof integrity.summary?.healthScore !== 'number') throw new Error('Integrity audit failed');

  const sim = await req('POST', '/integrity/simulate/vlsm', {
    project: '10.0.0.0/24',
    plan: {
      baseNetwork: '10.0.0.0/24',
      subnets: [{ cidr: '10.0.0.128/25', site: 'X', requiredHosts: 10 }],
    },
  });
  if (sim.summary?.safe !== 1) throw new Error('VLSM simulation should pass for non-overlapping subnet');

  await req('DELETE', `/records/${subnetId}`);

  const wf = await req('POST', '/workflow', {
    address: '10.30.0.0/24',
    record_type: 'subnet',
    project: 'Workflow Test',
    location: 'Lab',
    requester: 'test',
  });
  if (!wf.workflow?.id) throw new Error('Workflow create failed');
  const wfId = wf.workflow.id;

  await req('POST', `/workflow/${wfId}/netlens`, {
    netlens: { valid: true, overlap: false, conflicts: [], validation: { status: 'valid', errors: [], summary: 'OK' } },
    actor: 'test',
  });

  let wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'VALIDATED') throw new Error('Workflow should be VALIDATED after NetLens attach');

  await req('POST', `/workflow/${wfId}/action`, { action: 'submit_approval', actor: 'test' });
  wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'PENDING_APPROVAL') throw new Error('Workflow should be PENDING_APPROVAL');

  const approved = await req('POST', `/workflow/${wfId}/action`, { action: 'approve', actor: 'admin', reason: 'No conflicts' });
  if (approved.workflow.state !== 'APPROVED') throw new Error('Workflow approve failed');
  if (!approved.ipamRecord?.id) throw new Error('Approve should write to IPAM registry');

  const activated = await req('POST', `/workflow/${wfId}/action`, { action: 'activate', actor: 'admin' });
  if (activated.workflow.state !== 'ACTIVE') throw new Error('Workflow activate failed');

  const dashWf = await req('GET', '/workflow/dashboard');
  if (typeof dashWf.counts?.total !== 'number') throw new Error('Workflow dashboard missing counts');

  await req('POST', `/workflow/${wfId}/action`, { action: 'decommission', actor: 'admin', reason: 'Test cleanup' });
  wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'DECOMMISSIONED') throw new Error('Workflow decommission failed');

  console.log('IPAM API tests passed (Phases 1–5)');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
