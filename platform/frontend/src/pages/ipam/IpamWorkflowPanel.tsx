import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IpamRecordType, IpamWorkflow, IpamWorkflowDashboard, WorkflowState } from '../../services/ipamApi';
import {
  attachWorkflowNetLens,
  createWorkflowRequest,
  fetchWorkflowDashboard,
  workflowAction,
  workflowStateClass,
} from '../../services/ipamApi';
import { analyzeNetLens, netLensResultToWorkflowPayload } from '../../utils/netLens';
import { useIpamStore } from '../../store/useIpamStore';
import { workflowAddressFamily, type IpAddressFamily } from '../../utils/ipamFamily';

const emptyRequest = {
  address: '',
  record_type: 'subnet' as IpamRecordType,
  project: '',
  location: '',
  vlan: '',
  description: '',
  requester: 'user',
};

function StateBadge(props: { state: WorkflowState }) {
  return (
    <span className={clsx('rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1', workflowStateClass(props.state))}>
      {props.state.replace(/_/g, ' ')}
    </span>
  );
}

function WorkflowRow(props: {
  workflow: IpamWorkflow;
  selected: boolean;
  onSelect: () => void;
  blocked?: boolean;
  compact?: boolean;
}) {
  const { workflow: w, blocked, compact } = props;
  const nl = w.netlens_result;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={clsx(
        'w-full rounded-lg border px-2.5 py-1.5 text-left transition',
        props.selected
          ? 'border-indigo-500/40 bg-indigo-950/20'
          : blocked
            ? 'border-amber-500/25 bg-gray-900/40 hover:border-amber-500/40'
            : 'border-white/10 bg-gray-900/40 hover:border-white/20',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-100">{w.address}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {w.project || '—'} · {w.requester}
          </p>
        </div>
        <StateBadge state={w.state} />
      </div>
      {!compact && blocked ? (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Blocked — validation or conflict
        </p>
      ) : null}
      {!compact && nl && !blocked ? (
        <p className="mt-1 text-[10px] text-slate-500">
          NetLens: {nl.validation?.status === 'valid' || nl.valid ? 'valid' : 'invalid'}
          {nl.conflicts?.length ? ` · ${nl.conflicts.length} conflict(s)` : ''}
        </p>
      ) : null}
    </button>
  );
}

function SectionCard(props: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <section className={clsx('flex flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-900/50', props.className)}>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        {props.icon}
        <h3 className="min-w-0 flex-1 text-xs font-semibold text-slate-200">{props.title}</h3>
        {props.trailing}
      </header>
      <div
        className={clsx(
          'scrollbar-hidden overflow-y-auto p-2',
          props.bodyClassName ?? 'max-h-52',
        )}
      >
        {props.children}
      </div>
    </section>
  );
}

/** ~2 compact rows visible; scroll for the rest. */
const QUEUE_LIST_BODY = 'h-[7rem]';

function QueueCount(props: { total: number }) {
  if (props.total <= 2) return null;
  return (
    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-medium tabular-nums text-slate-400">
      {props.total}
    </span>
  );
}

function EmptyQueue(props: { children: string }) {
  return (
    <p className="flex h-full items-center justify-center text-center text-xs text-slate-400">{props.children}</p>
  );
}

function WorkflowReviewContent(props: {
  selected: IpamWorkflow;
  busy: boolean;
  actionReason: string;
  modifyProject: string;
  onActionReason: (v: string) => void;
  onModifyProject: (v: string) => void;
  onAction: (action: Parameters<typeof workflowAction>[1], payload?: Record<string, unknown>) => void;
  onRevalidate: () => void;
  nl: IpamWorkflow['netlens_result'];
  nlValid: boolean;
  nlConflict: boolean;
  suggestion: string | undefined;
}) {
  const { selected, busy, actionReason, modifyProject, nl, nlValid, nlConflict, suggestion } = props;

  const actionButtons = (
    <>
      {selected.state === 'VALIDATED' ? (
        <ActionBtn disabled={busy} onClick={() => props.onAction('submit_approval')}>
          Submit for approval
        </ActionBtn>
      ) : null}
      {selected.state === 'PENDING_APPROVAL' ? (
        <>
          <ActionBtn disabled={busy} onClick={() => props.onAction('approve')} tone="emerald">
            Approve
          </ActionBtn>
          <ActionBtn disabled={busy || !actionReason.trim()} onClick={() => props.onAction('reject')} tone="rose">
            Reject
          </ActionBtn>
          {suggestion ? (
            <ActionBtn disabled={busy} onClick={() => props.onAction('apply_suggestion')}>
              Apply suggestion
            </ActionBtn>
          ) : null}
          <ActionBtn disabled={busy || !actionReason.trim()} onClick={() => props.onAction('override')} tone="amber">
            Override (admin)
          </ActionBtn>
        </>
      ) : null}
      {selected.state === 'APPROVED' ? (
        <>
          <ActionBtn disabled={busy} onClick={() => props.onAction('reserve')}>
            Mark reserved
          </ActionBtn>
          <ActionBtn disabled={busy} onClick={() => props.onAction('activate')} tone="emerald">
            Activate
          </ActionBtn>
        </>
      ) : null}
      {selected.state === 'RESERVED' ? (
        <ActionBtn disabled={busy} onClick={() => props.onAction('activate')} tone="emerald">
          Activate
        </ActionBtn>
      ) : null}
      {selected.state === 'MODIFIED' ? (
        <ActionBtn disabled={busy} onClick={() => props.onAction('activate')} tone="emerald">
          Confirm Active
        </ActionBtn>
      ) : null}
      {selected.state === 'ACTIVE' ? (
        <>
          <ActionBtn disabled={busy || !actionReason.trim()} onClick={() => props.onAction('decommission')} tone="rose">
            Decommission
          </ActionBtn>
          <ActionBtn
            disabled={busy || !modifyProject.trim()}
            onClick={() => props.onAction('modify', { project: modifyProject.trim() })}
          >
            Update Project
          </ActionBtn>
        </>
      ) : null}
      {selected.state === 'REJECTED' ? (
        <ActionBtn disabled={busy} onClick={() => props.onAction('reopen')}>
          Reopen request
        </ActionBtn>
      ) : null}
      {['REQUESTED', 'VALIDATED'].includes(selected.state) ? (
        <ActionBtn disabled={busy} onClick={() => props.onRevalidate()}>
          Re-run NetLens
        </ActionBtn>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-medium text-slate-100">{selected.address}</p>
        <StateBadge state={selected.state} />
        <span className="text-[10px] text-slate-500">{selected.record_type}</span>
        {selected.project ? <span className="text-[10px] text-slate-500">{selected.project}</span> : null}
        {selected.ipam_record_id ? (
          <span className="text-[10px] text-emerald-400">Linked to registry</span>
        ) : null}
      </div>

      {nl ? (
        <div className="rounded-lg border border-white/10 bg-gray-950/50 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              {nlValid ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-rose-400" />
              )}
              NetLens {nlValid ? 'valid' : 'invalid'}
              {nlConflict ? ' · conflicts' : ''}
            </span>
            {suggestion ? <span className="text-cyan-300">Suggestion: {suggestion}</span> : null}
            {selected.rejected_reason ? (
              <span className="text-rose-300">Rejected: {selected.rejected_reason}</span>
            ) : null}
            {selected.override_reason ? (
              <span className="text-amber-300">Override: {selected.override_reason}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          No NetLens result attached.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {selected.state === 'ACTIVE' ? (
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
            placeholder="New project name (for Update Project)"
            value={modifyProject}
            onChange={(e) => props.onModifyProject(e.target.value)}
          />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
            placeholder="Reason (required for reject / override / decommission)"
            value={actionReason}
            onChange={(e) => props.onActionReason(e.target.value)}
          />
          <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">{actionButtons}</div>
        </div>
      </div>
    </div>
  );
}

export function IpamWorkflowPanel(props: { addressFamily?: IpAddressFamily }) {
  const family = props.addressFamily ?? 'ipv4';
  const loadInitial = useIpamStore((s) => s.loadInitial);
  const loadRecords = useIpamStore((s) => s.loadRecords);
  const [dashboard, setDashboard] = useState<IpamWorkflowDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRequest);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [modifyProject, setModifyProject] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowDashboard();
      setDashboard(data);
      if (selectedId && !data.requestsQueue.concat(data.activeWorkflows).concat(data.blockedRequests ?? []).concat(data.rejectedRequests ?? []).some((w) => w.id === selectedId)) {
        const inHistory = data.blockedRequests.some((w) => w.id === selectedId);
        if (!inHistory) setSelectedId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Workflow dashboard failed');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const blockedIds = new Set((dashboard?.blockedRequests ?? []).map((w) => w.id));

  const familyDashboard = useMemo(() => {
    if (!dashboard) return null;
    const match = (w: IpamWorkflow) => workflowAddressFamily(w.address) === family;
    const requestsQueue = dashboard.requestsQueue.filter(match);
    const activeWorkflows = dashboard.activeWorkflows.filter(match);
    const blockedRequests = (dashboard.blockedRequests ?? []).filter(match);
    const rejectedRequests = (dashboard.rejectedRequests ?? []).filter(match);
    const staleRequests = (dashboard.staleRequests ?? []).filter(match);
    return {
      ...dashboard,
      requestsQueue,
      activeWorkflows,
      blockedRequests,
      rejectedRequests,
      staleRequests,
      counts: {
        queue: requestsQueue.length,
        active: activeWorkflows.length,
        blocked: blockedRequests.length,
        total: requestsQueue.length + activeWorkflows.length + blockedRequests.length + rejectedRequests.length,
      },
    };
  }, [dashboard, family]);

  const view = familyDashboard ?? dashboard;

  useEffect(() => {
    setActionReason('');
    const sel = selectedId
      ? [...(view?.requestsQueue ?? []), ...(view?.activeWorkflows ?? []), ...(view?.blockedRequests ?? []), ...(view?.rejectedRequests ?? [])].find(
          (w) => w.id === selectedId,
        )
      : null;
    setModifyProject(sel?.project ?? '');
  }, [selectedId, view]);

  const selected = selectedId
    ? [...(view?.requestsQueue ?? []), ...(view?.activeWorkflows ?? []), ...(view?.blockedRequests ?? []), ...(view?.rejectedRequests ?? [])].find(
        (w) => w.id === selectedId,
      ) ?? null
    : null;

  async function runAction(
    action: Parameters<typeof workflowAction>[1],
    reason?: string,
    payload?: Record<string, unknown>,
  ) {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await workflowAction(selected.id, action, {
        actor: 'user',
        reason: reason ?? (actionReason || undefined),
        payload,
      });
      setActionReason('');
      setModifyProject('');
      setMsg(`Action "${action}" completed.`);
      await refresh();
      await loadInitial();
      await loadRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function createRequest() {
    if (!form.address.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const { workflow } = await createWorkflowRequest(form);
      const netlens = await analyzeNetLens(form.address);
      const payload = netLensResultToWorkflowPayload(netlens);
      await attachWorkflowNetLens(workflow.id, payload, form.requester);
      setForm(emptyRequest);
      setSelectedId(workflow.id);
      setMsg(`Request created and validated for ${workflow.address}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create request');
    } finally {
      setBusy(false);
    }
  }

  async function revalidateSelected() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const netlens = await analyzeNetLens(selected.address);
      await attachWorkflowNetLens(selected.id, netLensResultToWorkflowPayload(netlens), 'user');
      setMsg('NetLens validation refreshed.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-validation failed');
    } finally {
      setBusy(false);
    }
  }

  const nl = selected?.netlens_result;
  const nlValid = nl?.validation?.status === 'valid' || nl?.valid === true;
  const nlConflict = Boolean(nl?.overlap || (nl?.conflicts?.length ?? 0) > 0 || (nl?.insights?.conflicts?.length ?? 0) > 0);
  const suggestion = nl?.suggestion ?? nl?.insights?.suggestions?.[0];

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <GitBranch className="h-4 w-4 text-indigo-400" />
          IP Workflow Manager · {family === 'ipv6' ? 'IPv6' : 'IPv4'} · planning → approval → registry
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/15 disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</div>
      ) : null}
      {msg ? (
        <div className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">{msg}</div>
      ) : null}

      {view?.staleRequests && view.staleRequests.length > 0 ? (
        <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs text-amber-200">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {view.staleRequests.length} stale request{view.staleRequests.length === 1 ? '' : 's'} awaiting action
            — review the requests queue or re-run NetLens.
          </span>
        </div>
      ) : null}

      <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
        {[
          { label: 'Requests Queue', value: view?.counts.queue ?? 0, tone: 'text-amber-300' },
          { label: 'Active Workflows', value: view?.counts.active ?? 0, tone: 'text-emerald-300' },
          { label: 'Blocked', value: view?.counts.blocked ?? 0, tone: 'text-rose-300' },
          { label: 'Total', value: view?.counts.total ?? 0, tone: 'text-slate-200' },
        ].map((c) => (
          <div key={c.label} className="flex h-full flex-col rounded-xl border border-white/10 bg-gray-900/50 p-3">
            <p className="text-[10px] uppercase text-slate-500">{c.label}</p>
            <p className={clsx('mt-auto text-xl font-semibold', c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      <SectionCard title="New Allocation Request" icon={<Plus className="h-3.5 w-3.5 text-indigo-400" />} className="shrink-0">
        <div className="grid gap-2 lg:grid-cols-12 lg:items-end">
          <label className="block lg:col-span-4">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">Address</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder={family === 'ipv6' ? '2001:db8::/64 or 2001:db8::1' : '10.0.0.64/27 or 192.168.1.10'}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">Type</span>
            <select
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
              value={form.record_type}
              onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value as IpamRecordType }))}
            >
              <option value="subnet">Subnet</option>
              <option value="host">Host</option>
            </select>
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">Project</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
              placeholder="Project"
              value={form.project}
              onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">Location</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </label>
          <button
            type="button"
            disabled={busy || !form.address.trim()}
            onClick={() => void createRequest()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 lg:col-span-2 lg:py-2"
          >
            {busy ? 'Creating…' : 'Create & validate'}
          </button>
        </div>
      </SectionCard>

      <section className="space-y-3 rounded-xl border border-white/10 bg-gray-900/40 p-3">
        <header className="flex items-center gap-2 px-0.5">
          <GitBranch className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-100">Processing Pipeline</h3>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <SectionCard
            title="Requests Queue"
            icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
            className="bg-gray-950/40"
            bodyClassName={QUEUE_LIST_BODY}
            trailing={<QueueCount total={view?.requestsQueue.length ?? 0} />}
          >
            {loading && !view ? (
              <EmptyQueue>Loading…</EmptyQueue>
            ) : view?.requestsQueue.length ? (
              <div className="space-y-1">
                {view.requestsQueue.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={selectedId === w.id}
                    blocked={blockedIds.has(w.id)}
                    compact
                    onSelect={() => setSelectedId(w.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyQueue>No pending requests</EmptyQueue>
            )}
          </SectionCard>

          <SectionCard
            title="Blocked Requests"
            icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
            className="bg-gray-950/40"
            bodyClassName={QUEUE_LIST_BODY}
            trailing={<QueueCount total={view?.blockedRequests.length ?? 0} />}
          >
            {view?.blockedRequests.length ? (
              <div className="space-y-1">
                {view.blockedRequests.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={selectedId === w.id}
                    blocked
                    compact
                    onSelect={() => setSelectedId(w.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyQueue>No blocked requests</EmptyQueue>
            )}
          </SectionCard>

          <SectionCard
            title="Rejected"
            icon={<XCircle className="h-3.5 w-3.5 text-rose-400" />}
            className="bg-gray-950/40"
            bodyClassName={QUEUE_LIST_BODY}
            trailing={<QueueCount total={view?.rejectedRequests?.length ?? 0} />}
          >
            {view?.rejectedRequests?.length ? (
              <div className="space-y-1">
                {view.rejectedRequests.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={selectedId === w.id}
                    compact
                    onSelect={() => setSelectedId(w.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyQueue>No rejected requests</EmptyQueue>
            )}
          </SectionCard>
        </div>

        {view?.staleRequests?.length ? (
          <SectionCard
            title="Stale Requests"
            icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
            className="border-amber-500/20 bg-amber-950/10"
            bodyClassName={QUEUE_LIST_BODY}
            trailing={<QueueCount total={view.staleRequests.length} />}
          >
            <div className="space-y-1">
              {view.staleRequests.map((w) => (
                <WorkflowRow
                  key={w.id}
                  workflow={w}
                  selected={selectedId === w.id}
                  compact
                  onSelect={() => setSelectedId(w.id)}
                />
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Review & Act"
          icon={<GitBranch className="h-3.5 w-3.5 text-indigo-400" />}
          className={selected ? 'border-indigo-500/30 bg-indigo-950/10' : 'border-dashed border-white/10 bg-gray-950/25'}
          bodyClassName={selected ? 'max-h-none' : 'py-3'}
        >
          {!selected ? (
            <p className="text-xs text-slate-400">Select a workflow from the queues above to review NetLens results and take action.</p>
          ) : (
            <WorkflowReviewContent
              selected={selected}
              busy={busy}
              actionReason={actionReason}
              modifyProject={modifyProject}
              onActionReason={setActionReason}
              onModifyProject={setModifyProject}
              onAction={(action, payload) => void runAction(action, undefined, payload)}
              onRevalidate={() => void revalidateSelected()}
              nl={nl}
              nlValid={nlValid}
              nlConflict={nlConflict}
              suggestion={suggestion}
            />
          )}
        </SectionCard>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Active Workflows" icon={<ArrowRightLeft className="h-3.5 w-3.5 text-emerald-400" />} bodyClassName="max-h-72">
            {view?.activeWorkflows.length ? (
              <div className="space-y-1.5">
                {view.activeWorkflows.map((w) => (
                  <WorkflowRow key={w.id} workflow={w} selected={selectedId === w.id} onSelect={() => setSelectedId(w.id)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No active allocations in progress.</p>
            )}
          </SectionCard>

          <SectionCard title="History Log" icon={<Shield className="h-3.5 w-3.5 text-slate-400" />} bodyClassName="max-h-72">
            {dashboard?.history.length ? (
              <div className="space-y-2">
                {dashboard.history.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-white/5 bg-gray-950/40 px-2 py-1.5 text-[10px]">
                    <p className="text-slate-300">
                      <span className="font-semibold uppercase text-indigo-300">{entry.action}</span>
                      {entry.from_state ? (
                        <>
                          {' '}
                          {entry.from_state} → {entry.to_state}
                        </>
                      ) : (
                        <> → {entry.to_state}</>
                      )}
                    </p>
                    <p className="text-slate-500">
                      {entry.actor} · {entry.created_at}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No workflow history yet.</p>
            )}
          </SectionCard>
      </div>
    </div>
  );
}

function ActionBtn(props: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'emerald' | 'rose' | 'amber';
}) {
  const toneClass =
    props.tone === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-500'
      : props.tone === 'rose'
        ? 'bg-rose-700 hover:bg-rose-600'
        : props.tone === 'amber'
          ? 'bg-amber-700 hover:bg-amber-600'
          : 'bg-indigo-600 hover:bg-indigo-500';
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={clsx('rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50', toneClass)}
    >
      {props.children}
    </button>
  );
}
