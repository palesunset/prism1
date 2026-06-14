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
import { useCallback, useEffect, useState } from 'react';
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
}) {
  const { workflow: w, blocked } = props;
  const nl = w.netlens_result;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={clsx(
        'w-full rounded-lg border px-3 py-2 text-left transition',
        props.selected
          ? 'border-indigo-500/40 bg-indigo-950/20'
          : 'border-white/10 bg-gray-900/40 hover:border-white/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-100">{w.address}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {w.project || '—'} · {w.location || '—'} · {w.requester}
          </p>
        </div>
        <StateBadge state={w.state} />
      </div>
      {blocked ? (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Blocked — validation or conflict
        </p>
      ) : null}
      {nl && !blocked ? (
        <p className="mt-1 text-[10px] text-slate-500">
          NetLens: {nl.validation?.status === 'valid' || nl.valid ? 'valid' : 'invalid'}
          {nl.conflicts?.length ? ` · ${nl.conflicts.length} conflict(s)` : ''}
        </p>
      ) : null}
    </button>
  );
}

function SectionCard(props: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('flex min-h-0 flex-col rounded-xl border border-white/10 bg-gray-900/50', props.className)}>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        {props.icon}
        <h3 className="text-xs font-semibold text-slate-200">{props.title}</h3>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{props.children}</div>
    </section>
  );
}

export function IpamWorkflowPanel() {
  const loadAll = useIpamStore((s) => s.loadAll);
  const [dashboard, setDashboard] = useState<IpamWorkflowDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRequest);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowDashboard();
      setDashboard(data);
      if (selectedId && !data.requestsQueue.concat(data.activeWorkflows).some((w) => w.id === selectedId)) {
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

  const selected = selectedId
    ? [...(dashboard?.requestsQueue ?? []), ...(dashboard?.activeWorkflows ?? []), ...(dashboard?.blockedRequests ?? [])].find(
        (w) => w.id === selectedId,
      ) ?? null
    : null;

  const blockedIds = new Set((dashboard?.blockedRequests ?? []).map((w) => w.id));

  async function runAction(action: Parameters<typeof workflowAction>[1], reason?: string) {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await workflowAction(selected.id, action, { actor: 'user', reason: reason ?? (actionReason || undefined) });
      setActionReason('');
      setMsg(`Action "${action}" completed.`);
      await refresh();
      await loadAll();
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <GitBranch className="h-4 w-4 text-indigo-400" />
          IP Workflow Manager · planning → approval → registry
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

      <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Requests queue', value: dashboard?.counts.queue ?? 0, tone: 'text-amber-300' },
          { label: 'Active workflows', value: dashboard?.counts.active ?? 0, tone: 'text-emerald-300' },
          { label: 'Blocked', value: dashboard?.counts.blocked ?? 0, tone: 'text-rose-300' },
          { label: 'Total', value: dashboard?.counts.total ?? 0, tone: 'text-slate-200' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
            <p className="text-[10px] uppercase text-slate-500">{c.label}</p>
            <p className={clsx('text-xl font-semibold', c.tone)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-4">
          <section className="shrink-0 rounded-xl border border-white/10 bg-gray-900/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Plus className="h-3.5 w-3.5 text-indigo-400" />
              New allocation request
            </p>
            <div className="space-y-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                placeholder="10.0.0.64/27 or 192.168.1.10"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
                  value={form.record_type}
                  onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value as IpamRecordType }))}
                >
                  <option value="subnet">Subnet</option>
                  <option value="host">Host</option>
                </select>
                <input
                  className="rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
                  placeholder="Project"
                  value={form.project}
                  onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
                />
              </div>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy || !form.address.trim()}
                onClick={() => void createRequest()}
                className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create & validate with NetLens'}
              </button>
            </div>
          </section>

          <SectionCard title="Requests queue" icon={<Clock className="h-3.5 w-3.5 text-amber-400" />} className="min-h-[8rem] flex-1">
            {loading && !dashboard ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : dashboard?.requestsQueue.length ? (
              <div className="space-y-1.5">
                {dashboard.requestsQueue.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={selectedId === w.id}
                    blocked={blockedIds.has(w.id)}
                    onSelect={() => setSelectedId(w.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No pending requests.</p>
            )}
          </SectionCard>

          <SectionCard title="Blocked requests" icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-400" />} className="min-h-[6rem]">
            {dashboard?.blockedRequests.length ? (
              <div className="space-y-1.5">
                {dashboard.blockedRequests.map((w) => (
                  <WorkflowRow key={w.id} workflow={w} selected={selectedId === w.id} blocked onSelect={() => setSelectedId(w.id)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No blocked requests.</p>
            )}
          </SectionCard>
        </div>

        <div className="flex min-h-0 flex-col gap-3 lg:col-span-4">
          <SectionCard title="Active workflows" icon={<ArrowRightLeft className="h-3.5 w-3.5 text-emerald-400" />} className="min-h-[10rem] flex-1">
            {dashboard?.activeWorkflows.length ? (
              <div className="space-y-1.5">
                {dashboard.activeWorkflows.map((w) => (
                  <WorkflowRow key={w.id} workflow={w} selected={selectedId === w.id} onSelect={() => setSelectedId(w.id)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No active allocations in progress.</p>
            )}
          </SectionCard>

          <section className="min-h-0 flex-1 rounded-xl border border-white/10 bg-gray-900/50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-200">Selected workflow</p>
            {!selected ? (
              <p className="text-xs text-slate-500">Select a request to review actions.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-sm text-slate-100">{selected.address}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StateBadge state={selected.state} />
                    <span className="text-[10px] text-slate-500">{selected.record_type}</span>
                    {selected.ipam_record_id ? (
                      <span className="text-[10px] text-emerald-400">Linked to registry</span>
                    ) : null}
                  </div>
                </div>

                {nl ? (
                  <div className="rounded-lg border border-white/5 bg-gray-950/50 p-2 text-[10px]">
                    <p className="mb-1 font-semibold uppercase text-slate-500">NetLens</p>
                    <div className="flex items-center gap-1">
                      {nlValid ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3 w-3 text-rose-400" />
                      )}
                      <span className={nlValid ? 'text-emerald-200' : 'text-rose-200'}>
                        {nlValid ? 'Valid' : 'Invalid'}
                        {nlConflict ? ' · conflicts detected' : ''}
                      </span>
                    </div>
                    {suggestion ? <p className="mt-1 text-cyan-300">Suggestion: {suggestion}</p> : null}
                    {selected.override_reason ? (
                      <p className="mt-1 text-amber-300">Override: {selected.override_reason}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-300">No NetLens result attached.</p>
                )}

                <input
                  className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
                  placeholder="Reason (required for reject / override / decommission)"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />

                <div className="flex flex-wrap gap-1.5">
                  {selected.state === 'VALIDATED' ? (
                    <ActionBtn disabled={busy} onClick={() => void runAction('submit_approval')}>
                      Submit for approval
                    </ActionBtn>
                  ) : null}
                  {selected.state === 'PENDING_APPROVAL' ? (
                    <>
                      <ActionBtn disabled={busy} onClick={() => void runAction('approve')} tone="emerald">
                        Approve
                      </ActionBtn>
                      <ActionBtn disabled={busy} onClick={() => void runAction('reject')} tone="rose">
                        Reject
                      </ActionBtn>
                      {suggestion ? (
                        <ActionBtn disabled={busy} onClick={() => void runAction('apply_suggestion')}>
                          Apply suggestion
                        </ActionBtn>
                      ) : null}
                      <ActionBtn
                        disabled={busy || !actionReason.trim()}
                        onClick={() => void runAction('override')}
                        tone="amber"
                      >
                        Override (admin)
                      </ActionBtn>
                    </>
                  ) : null}
                  {selected.state === 'APPROVED' ? (
                    <>
                      <ActionBtn disabled={busy} onClick={() => void runAction('reserve')}>
                        Mark reserved
                      </ActionBtn>
                      <ActionBtn disabled={busy} onClick={() => void runAction('activate')} tone="emerald">
                        Activate
                      </ActionBtn>
                    </>
                  ) : null}
                  {selected.state === 'RESERVED' ? (
                    <ActionBtn disabled={busy} onClick={() => void runAction('activate')} tone="emerald">
                      Activate
                    </ActionBtn>
                  ) : null}
                  {selected.state === 'ACTIVE' ? (
                    <ActionBtn disabled={busy || !actionReason.trim()} onClick={() => void runAction('decommission')} tone="rose">
                      Decommission
                    </ActionBtn>
                  ) : null}
                  {['REQUESTED', 'VALIDATED'].includes(selected.state) ? (
                    <ActionBtn disabled={busy} onClick={() => void revalidateSelected()}>
                      Re-run NetLens
                    </ActionBtn>
                  ) : null}
                </div>

                <p className="text-[10px] text-slate-600">
                  Registry writes occur on approve (reserved), reserve, and activate (used). NetLens validates only — it never saves.
                </p>
              </div>
            )}
          </section>
        </div>

        <SectionCard
          title="History log"
          icon={<Shield className="h-3.5 w-3.5 text-slate-400" />}
          className="min-h-0 lg:col-span-4"
        >
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
      className={clsx('rounded-md px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50', toneClass)}
    >
      {props.children}
    </button>
  );
}
