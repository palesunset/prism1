const BASE = 'http://127.0.0.1:3003/api/ipam';
const TEST_HEADERS = { 'X-Ipam-Integration-Test': '1' };

async function req(method, path, body) {
  const headers = { ...TEST_HEADERS };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail ?? res.statusText);
  return data;
}

async function run() {
  const health = await req('GET', '/health');
  if (health.service !== 'prism-ipam') throw new Error('Health check failed');
  if (health.version !== '1.3') throw new Error(`Expected API version 1.3, got ${health.version}`);

  const caps = await req('GET', '/capabilities');
  if (!caps.phases?.['1']?.status) throw new Error('Capabilities manifest missing phases');
  if (caps.ipv6 !== true) throw new Error('Expected IPv6 capability in manifest');
  if (caps.inventoryCrossCheck !== true) throw new Error('Expected inventory cross-check capability');

  const picklists = await req('GET', '/picklists');
  if (!Array.isArray(picklists.projects)) throw new Error('Picklists missing projects');

  const existing = await req('GET', '/records');
  for (const r of existing.records ?? []) {
    const cascade = r.record_type === 'subnet' ? '?cascade=true' : '';
    await fetch(`${BASE}/records/${r.id}${cascade}`, { method: 'DELETE', headers: TEST_HEADERS });
  }

  const created = await req('POST', '/records', {
    address: '192.168.200.0/24',
    record_type: 'subnet',
    status: 'reserved',
    project: 'Test LAN',
    location: 'HQ',
    hostname: 'lan-gw.example.com',
  });
  if (!created.record?.id) throw new Error('Create subnet failed');
  const subnetId = created.record.id;

  await req('POST', '/records', {
    address: '192.168.200.10',
    record_type: 'host',
    status: 'used',
    project: 'Router',
    mac_address: '00:11:22:33:44:55',
  });

  const paged = await req('GET', '/records?page=1&pageSize=10');
  if (!paged.total || paged.total < 2) throw new Error('Paginated records should include total');

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
  if (typeof analytics.utilization.alertPercent !== 'number') throw new Error('Analytics alert threshold missing');

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

  const bulk = await req('POST', '/records/bulk-status', {
    ids: [created.record.id],
    status: 'reserved',
  });
  if (bulk.count !== 1) throw new Error('Bulk status update failed');

  try {
    await req('DELETE', `/records/${subnetId}`);
    throw new Error('Subnet delete without cascade should fail when hosts exist');
  } catch (e) {
    if (!String(e.message).includes('host')) throw e;
  }

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
    headers: { ...TEST_HEADERS, 'Content-Type': 'application/json' },
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
    headers: { ...TEST_HEADERS, 'Content-Type': 'application/json' },
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
    throw new Error(`VLSM import should create 4 adjacent subnets, got ${vlsm.created?.length}`);
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

  await req('DELETE', `/records/${subnetId}?cascade=true`);

  const wf = await req('POST', '/workflow', {
    address: '10.30.0.0/24',
    record_type: 'subnet',
    project: 'Workflow Test',
    location: 'Lab',
    requester: 'test',
    netlens: { valid: true, overlap: false, conflicts: [], validation: { status: 'valid', errors: [], summary: 'OK' } },
  });
  if (!wf.workflow?.id) throw new Error('Workflow create failed');
  const wfId = wf.workflow.id;

  let wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'VALIDATED') throw new Error('Workflow should be VALIDATED after create with NetLens');

  await req('POST', `/workflow/${wfId}/action`, { action: 'submit_approval', actor: 'test' });
  wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'PENDING_APPROVAL') throw new Error('Workflow should be PENDING_APPROVAL');

  const approved = await req('POST', `/workflow/${wfId}/action`, { action: 'approve', actor: 'admin', reason: 'No conflicts' });
  if (approved.workflow.state !== 'APPROVED') throw new Error('Workflow approve failed');
  if (approved.ipamRecord?.id) throw new Error('Approve should not write to IPAM registry');

  const reserved = await req('POST', `/workflow/${wfId}/action`, { action: 'reserve', actor: 'admin' });
  if (reserved.workflow.state !== 'RESERVED') throw new Error('Workflow reserve failed');
  if (!reserved.ipamRecord?.id) throw new Error('Reserve should write to IPAM registry');

  const activated = await req('POST', `/workflow/${wfId}/action`, { action: 'activate', actor: 'admin' });
  if (activated.workflow.state !== 'ACTIVE') throw new Error('Workflow activate failed');

  await req('POST', `/workflow/${wfId}/action`, { action: 'decommission', actor: 'admin', reason: 'Test cleanup' });
  wfDetail = await req('GET', `/workflow/${wfId}`);
  if (wfDetail.workflow.state !== 'DECOMMISSIONED') throw new Error('Workflow decommission failed');

  const rejectWf = await req('POST', '/workflow', {
    address: '10.31.0.0/24',
    record_type: 'subnet',
    project: 'Reject Test',
    requester: 'test',
    netlens: { valid: true, validation: { status: 'valid', errors: [], summary: 'OK' } },
  });
  const rejectId = rejectWf.workflow.id;
  await req('POST', `/workflow/${rejectId}/action`, { action: 'submit_approval', actor: 'test' });
  const rejected = await req('POST', `/workflow/${rejectId}/action`, { action: 'reject', actor: 'admin', reason: 'Not needed' });
  if (rejected.workflow.state !== 'REJECTED') throw new Error('Reject should move workflow to REJECTED');

  const backup = await req('GET', '/backup');
  if (!backup.records?.length) throw new Error('Backup bundle should include records');
  if (!Array.isArray(backup.workflow_history)) throw new Error('Backup bundle should include workflow_history');

  const restored = await req('POST', '/restore', backup);
  if (!restored.restored || restored.restored < 1) throw new Error('Restore should report restored count');
  const afterRestore = await req('GET', '/records?page=1&pageSize=500');
  if (afterRestore.total < 2) throw new Error('Restore should preserve registry records');

  const settingsPut = await req('PUT', '/settings', { utilization_alert_percent: 75 });
  if (settingsPut.utilizationAlertPercent !== 75) throw new Error('Settings update failed');
  try {
    await req('PUT', '/settings', { utilization_alert_percent: 101 });
    throw new Error('Settings should reject invalid threshold');
  } catch (e) {
    if (!String(e.message).includes('utilization')) throw e;
  }

  try {
    await req('POST', '/records', {
      address: '192.168.200.12',
      record_type: 'host',
      status: 'used',
      project: 'Bad MAC',
      mac_address: 'not-a-mac',
    });
    throw new Error('Invalid MAC should fail');
  } catch (e) {
    if (!String(e.message).toLowerCase().includes('mac')) throw e;
  }

  try {
    await req('POST', '/records', {
      address: '192.168.200.13',
      record_type: 'host',
      status: 'used',
      project: 'Bad host',
      hostname: '-invalid-',
    });
    throw new Error('Invalid hostname should fail');
  } catch (e) {
    if (!String(e.message).toLowerCase().includes('hostname')) throw e;
  }

  const dashWf = await req('GET', '/workflow/dashboard');
  if (typeof dashWf.counts?.total !== 'number') throw new Error('Workflow dashboard missing counts');

  const v6Subnet = await req('POST', '/records', {
    address: '2001:db8:1000::/48',
    record_type: 'subnet',
    status: 'reserved',
    project: 'IPv6 Lab',
  });
  if (!v6Subnet.record?.id) throw new Error('Create IPv6 subnet failed');

  await req('POST', '/records', {
    address: '2001:db8:1000::1',
    record_type: 'host',
    status: 'used',
    project: 'IPv6 Router',
  });

  await req('POST', '/records', {
    address: '2001:db8:1000::2',
    record_type: 'host',
    status: 'used',
    project: 'IPv6 Switch',
  });

  const v6Dash = await req('GET', '/dashboard');
  const v6SubnetDash = v6Dash.subnets?.find((s) => s.address === '2001:db8:1000::/48');
  if (!v6SubnetDash || v6SubnetDash.usedHosts !== 2) {
    throw new Error(`IPv6 dashboard should count 2 hosts, got ${v6SubnetDash?.usedHosts ?? 'missing'}`);
  }
  if (v6SubnetDash.utilizationPercent != null) {
    throw new Error('Large IPv6 /48 should not report percentage utilization');
  }
  if (v6SubnetDash.freeIps != null) {
    throw new Error('Large IPv6 /48 should not report a finite free count');
  }

  const v6SubnetId = v6Subnet.record.id;
  const v6Detail = await req('GET', `/subnets/${v6SubnetId}`);
  if (!v6Detail.nextSuggestedIp) throw new Error('IPv6 /48 subnet detail should include nextSuggestedIp');
  if (!Array.isArray(v6Detail.freeRanges) || v6Detail.freeRanges.length < 1) {
    throw new Error('IPv6 /48 should include free ranges for quick allocate');
  }

  const v6Next = await req('GET', `/subnets/${v6SubnetId}/next-ip`);
  if (!v6Next.nextIp) throw new Error('IPv6 next-ip should suggest a free address in /48');

  const v6Search = await req('POST', '/search', { query: '2001:db8:1000::1' });
  if (!v6Search.exactMatches?.length) throw new Error('IPv6 search should find host');

  const v6Validate = await req('POST', '/validate', {
    address: '2001:db8:1000::3',
    record_type: 'host',
    status: 'used',
    inventory_crosscheck: true,
  });
  if (!v6Validate.allowed) throw new Error('IPv6 validate should pass for free host');
  if (!v6Validate.inventory || typeof v6Validate.inventory.reachable !== 'boolean') {
    throw new Error('Validate should include inventory cross-check payload');
  }

  const crosscheck = await req('GET', '/crosscheck/inventory?address=2001:db8:1000::1');
  if (typeof crosscheck.reachable !== 'boolean') throw new Error('Inventory cross-check endpoint failed');

  try {
    await req('POST', '/records', {
      address: '2001:db8:1000::/48',
      record_type: 'subnet',
      status: 'reserved',
      project: 'Duplicate v6',
    });
    throw new Error('Duplicate IPv6 subnet should fail');
  } catch (e) {
    if (!/overlap|conflict|duplicate|409|exists|registered|already/i.test(String(e.message))) throw e;
  }

  try {
    await req('GET', '/subnets/nonexistent-subnet-id');
    throw new Error('Missing subnet detail should 404');
  } catch (e) {
    if (!/404|not found/i.test(String(e.message))) throw e;
  }

  const overrideWf = await req('POST', '/workflow', {
    address: '10.32.0.0/24',
    record_type: 'subnet',
    project: 'Override Test',
    requester: 'test',
    netlens: {
      valid: false,
      conflicts: ['Simulated overlap'],
      validation: { status: 'invalid', errors: ['Conflict'], summary: 'Invalid' },
    },
  });
  const overrideId = overrideWf.workflow.id;
  await req('POST', `/workflow/${overrideId}/action`, { action: 'submit_approval', actor: 'test' });
  try {
    await req('POST', `/workflow/${overrideId}/action`, { action: 'approve', actor: 'admin', reason: 'Should fail' });
    throw new Error('Approve should fail without override on invalid NetLens');
  } catch (e) {
    if (!/invalid|conflict|override|approve/i.test(String(e.message))) throw e;
  }
  await req('POST', `/workflow/${overrideId}/action`, {
    action: 'override',
    actor: 'admin',
    reason: 'Lab exception approved',
  });
  const overrideApproved = await req('POST', `/workflow/${overrideId}/action`, {
    action: 'approve',
    actor: 'admin',
    reason: 'After override',
  });
  if (overrideApproved.workflow.state !== 'APPROVED') {
    throw new Error('Approve after override should succeed');
  }

  const modifyWf = await req('POST', '/workflow', {
    address: '10.35.0.0/24',
    record_type: 'subnet',
    project: 'Modify Test',
    requester: 'test',
    netlens: { valid: true, validation: { status: 'valid', errors: [], summary: 'OK' } },
  });
  const modifyId = modifyWf.workflow.id;
  await req('POST', `/workflow/${modifyId}/action`, { action: 'submit_approval', actor: 'test' });
  await req('POST', `/workflow/${modifyId}/action`, { action: 'approve', actor: 'admin', reason: 'OK' });
  await req('POST', `/workflow/${modifyId}/action`, { action: 'reserve', actor: 'admin' });
  await req('POST', `/workflow/${modifyId}/action`, { action: 'activate', actor: 'admin' });
  const modified = await req('POST', `/workflow/${modifyId}/action`, {
    action: 'modify',
    actor: 'admin',
    reason: 'Rename project',
    payload: { project: 'Renamed Project' },
  });
  if (modified.workflow.state !== 'ACTIVE') throw new Error('Modify on ACTIVE should return to ACTIVE');
  if (modified.workflow.project !== 'Renamed Project') throw new Error('Modify should update project field');

  const reopenWf = await req('POST', '/workflow', {
    address: '10.34.0.0/24',
    record_type: 'subnet',
    project: 'Reopen Test',
    requester: 'test',
    netlens: { valid: true, validation: { status: 'valid', errors: [], summary: 'OK' } },
  });
  const reopenId = reopenWf.workflow.id;
  await req('POST', `/workflow/${reopenId}/action`, { action: 'submit_approval', actor: 'test' });
  await req('POST', `/workflow/${reopenId}/action`, { action: 'reject', actor: 'admin', reason: 'Try again later' });
  const reopened = await req('POST', `/workflow/${reopenId}/action`, { action: 'reopen', actor: 'admin' });
  if (reopened.workflow.state !== 'REQUESTED') throw new Error('Reopen should return workflow to REQUESTED');

  console.log('IPAM API tests passed (v1.3)');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
