import clsx from 'clsx';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Home,
  Plus,
  Search,
  Server,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IpamRecord, IpamRecordType, IpamStatus, IpamSubnetDetail } from '../../services/ipamApi';
import {
  exportCsvUrl,
  exportJson,
  statusClass,
  utilizationReportUrl,
} from '../../services/ipamApi';
import { useIpamStore } from '../../store/useIpamStore';
import { octetsToString, uint32ToIp } from '../../utils/ipCalculator';
import { IpamAuditPanel } from './IpamAuditPanel';
import { IpamWorkflowPanel } from './IpamWorkflowPanel';

type TabId = 'dashboard' | 'registry' | 'subnets' | 'search' | 'workflow' | 'analytics' | 'audit' | 'system';

const emptyForm = {
  address: '',
  record_type: 'host' as IpamRecordType,
  status: 'used' as IpamStatus,
  project: '',
  vlan: '',
  location: '',
  description: '',
};

function TabButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        props.active
          ? 'bg-indigo-600/25 text-indigo-200 ring-1 ring-indigo-500/40'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
      )}
    >
      {props.children}
    </button>
  );
}

function StatusBadge(props: { status: IpamStatus }) {
  return (
    <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1', statusClass(props.status))}>
      {props.status}
    </span>
  );
}

function recordMetaLine(record: IpamRecord): string {
  const parts = [
    record.project?.trim() || null,
    record.location?.trim() || null,
    record.vlan?.trim() ? `VLAN ${record.vlan}` : null,
    record.description?.trim() &&
    record.description.trim() !== record.project?.trim()
      ? record.description.trim()
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function RecordSummaryRow(props: { record: IpamRecord; tone?: 'host' | 'subnet'; showMeta?: boolean }) {
  const addrClass = props.tone === 'host' ? 'text-emerald-300' : 'text-indigo-200';
  const showMeta = props.showMeta !== false;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={clsx('font-mono text-xs font-medium', addrClass)}>{props.record.address}</span>
        <StatusBadge status={props.record.status} />
      </div>
      {showMeta ? (
        <p className="line-clamp-2 text-[10px] leading-snug text-slate-500">{recordMetaLine(props.record)}</p>
      ) : null}
    </div>
  );
}

function subnetNetworkBroadcast(subnet: IpamRecord): { network: string; broadcast: string } {
  return {
    network: octetsToString(uint32ToIp(subnet.range_start)),
    broadcast: octetsToString(uint32ToIp(subnet.range_end)),
  };
}

/** e.g. 10.0.0.0/26 — 10.0.0.63/26 */
function subnetRangeLabel(subnet: IpamRecord): string {
  const prefix = subnet.cidr_prefix ?? 32;
  const broadcast = `${octetsToString(uint32ToIp(subnet.range_end))}/${prefix}`;
  return `${subnet.address} — ${broadcast}`;
}

function SubnetDetailCard(props: { detail: IpamSubnetDetail }) {
  const { subnet, usableRange, nextSuggestedIp } = props.detail;
  const { network, broadcast } = subnetNetworkBroadcast(subnet);

  return (
    <div className="rounded-md border border-indigo-500/20 bg-indigo-950/10 px-2.5 py-2">
      <RecordSummaryRow record={subnet} tone="subnet" showMeta={false} />
      <dl className="mt-1.5 space-y-0.5 text-[10px] leading-snug">
        <div>
          <dt className="inline text-slate-500">Network address: </dt>
          <dd className="inline font-mono text-slate-300">{network}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Broadcast address: </dt>
          <dd className="inline font-mono text-slate-300">{broadcast}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Usable: </dt>
          <dd className="inline font-mono text-emerald-300/90">
            {usableRange ?? '—'}
          </dd>
          {nextSuggestedIp ? (
            <>
              <span className="text-slate-600"> · </span>
              <dt className="inline text-slate-500">Next </dt>
              <dd className="inline font-mono text-indigo-300/90">{nextSuggestedIp}</dd>
            </>
          ) : usableRange ? (
            <span className="text-amber-400/90"> · Full</span>
          ) : null}
        </div>
      </dl>
      <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{recordMetaLine(subnet)}</p>
    </div>
  );
}

function SubnetSidebarItem(props: {
  subnet: IpamRecord;
  selected: boolean;
  dense?: boolean;
  onSelect: () => void;
}) {
  const { subnet, dense } = props;

  if (dense) {
    return (
      <button
        type="button"
        onClick={props.onSelect}
        className={clsx(
          'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
          props.selected ? 'border-indigo-500/40 bg-indigo-950/30' : 'border-white/10 bg-gray-900/40 hover:border-white/20',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] font-medium text-indigo-200">{subnetRangeLabel(subnet)}</span>
          <StatusBadge status={subnet.status} />
        </div>
        <p className="truncate text-[10px] text-slate-500">{recordMetaLine(subnet)}</p>
      </button>
    );
  }

  const meta = [subnet.location?.trim(), subnet.vlan?.trim() ? `VLAN ${subnet.vlan}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={clsx(
        'w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors',
        props.selected ? 'border-indigo-500/40 bg-indigo-950/30' : 'border-white/10 bg-gray-900/40 hover:border-white/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[11px] font-medium leading-snug text-indigo-200 sm:text-xs">{subnetRangeLabel(subnet)}</p>
        <StatusBadge status={subnet.status} />
      </div>
      <p className="mt-1 text-slate-300">{subnet.project?.trim() || '—'}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{meta || 'No location · no VLAN'}</p>
      {subnet.description?.trim() ? (
        <p className="mt-0.5 truncate text-[10px] italic text-slate-500">{subnet.description}</p>
      ) : null}
    </button>
  );
}

type SubnetProjectGroup = { key: string; subnets: IpamRecord[] };

function groupSubnetsByProject(subnets: IpamRecord[]): SubnetProjectGroup[] {
  const map = new Map<string, IpamRecord[]>();
  for (const s of subnets) {
    const key = s.project?.trim() || '(unassigned)';
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupSubnets]) => ({ key, subnets: groupSubnets }));
}

/** Dropdown + scrollable list — dropdown shows CIDR range; list shows metadata below. */
function SubnetPicker(props: {
  subnets: IpamRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [narrowQ, setNarrowQ] = useState('');
  const [groupByProject, setGroupByProject] = useState(() => props.subnets.length > 6);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const showSearch = props.subnets.length > 15;

  const filtered = useMemo(
    () => props.subnets.filter((s) => recordMatchesFilter(s, narrowQ)),
    [props.subnets, narrowQ],
  );

  const selected = props.selectedId
    ? props.subnets.find((s) => s.id === props.selectedId)
    : undefined;

  const dropdownSubnets = useMemo(() => {
    if (!selected || filtered.some((s) => s.id === selected.id)) return filtered;
    return [...filtered, selected].sort((a, b) => a.range_start - b.range_start);
  }, [filtered, selected]);

  const dropdownGroups = useMemo(() => groupSubnetsByProject(dropdownSubnets), [dropdownSubnets]);
  const listGroups = useMemo(
    () => (groupByProject ? groupSubnetsByProject(filtered) : [{ key: '', subnets: filtered }]),
    [filtered, groupByProject],
  );

  const narrowing = narrowQ.trim().length > 0;
  const dense = props.subnets.length > 12;

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="shrink-0 space-y-2">
        <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Select subnet
        </label>

        {showSearch ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 py-1.5 pl-8 pr-2 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Type to narrow list…"
              value={narrowQ}
              onChange={(e) => setNarrowQ(e.target.value)}
              spellCheck={false}
            />
          </div>
        ) : null}

        <select
          value={props.selectedId ?? ''}
          onChange={(e) => {
            if (e.target.value) props.onSelect(e.target.value);
          }}
          className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-2 font-mono text-xs text-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          {!props.selectedId ? (
            <option value="" disabled>
              Choose a subnet…
            </option>
          ) : null}
          {dropdownGroups.map((group) => (
            <optgroup key={group.key} label={`${group.key} (${group.subnets.length})`}>
              {group.subnets.map((s) => (
                <option key={s.id} value={s.id}>
                  {subnetRangeLabel(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
          <span>
            {narrowing
              ? `${filtered.length} of ${props.subnets.length} match`
              : `${props.subnets.length} subnet${props.subnets.length === 1 ? '' : 's'}`}
          </span>
          {props.subnets.length > 6 ? (
            <button
              type="button"
              onClick={() => setGroupByProject((v) => !v)}
              className={clsx(
                'rounded px-1.5 py-0.5 ring-1 transition-colors',
                groupByProject
                  ? 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30'
                  : 'text-slate-400 ring-white/10 hover:bg-white/5',
              )}
            >
              {groupByProject ? 'Grouped' : 'Flat list'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-500">
            {narrowing ? 'No subnets match — clear the search box.' : 'No subnets registered yet.'}
          </p>
        ) : (
          <div className={clsx(dense ? 'space-y-1' : 'space-y-2')}>
            {listGroups.map((group) => {
              const collapsed = groupByProject && group.key && collapsedGroups.has(group.key);
              return (
                <div key={group.key || 'flat'}>
                  {groupByProject && group.key ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="mb-1 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500 hover:bg-white/5 hover:text-slate-400"
                    >
                      {collapsed ? (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{group.key}</span>
                      <span className="shrink-0 text-slate-600">({group.subnets.length})</span>
                    </button>
                  ) : null}
                  {!collapsed ? (
                    <div className={clsx(dense ? 'space-y-1' : 'space-y-2')}>
                      {group.subnets.map((s) => (
                        <SubnetSidebarItem
                          key={s.id}
                          subnet={s}
                          selected={props.selectedId === s.id}
                          dense={dense}
                          onSelect={() => props.onSelect(s.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordForm(props: {
  initial?: typeof emptyForm;
  recordId?: string;
  submitLabel: string;
  onSubmit: (data: typeof emptyForm) => Promise<void>;
  onCancel?: () => void;
}) {
  const validateInput = useIpamStore((s) => s.validateInput);
  const [form, setForm] = useState(props.initial ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await props.onSubmit(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runValidate = async () => {
    setValidation(null);
    try {
      const result = await validateInput({
        ...form,
        vlan: form.vlan || null,
        location: form.location || null,
        description: form.description || null,
        exclude_id: props.recordId,
      });
      if (result.allowed) {
        const warn = result.warnings?.length ? ` · ${result.warnings.length} warning(s)` : '';
        setValidation(`Valid — ${result.parsed?.normalized ?? form.address}${warn}`);
      } else {
        const blocking = result.conflicts?.[0]?.message ?? result.error ?? 'Validation failed';
        setValidation(blocking);
      }
    } catch (err) {
      setValidation(err instanceof Error ? err.message : 'Validation failed');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-gray-900/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            IP / Subnet (CIDR for subnets)
          </span>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={form.record_type === 'subnet' ? '10.1.1.0/24' : '10.1.1.10'}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Type</span>
          <select
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.record_type}
            onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value as IpamRecordType }))}
          >
            <option value="host">Host</option>
            <option value="subnet">Subnet</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Status</span>
          <select
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IpamStatus }))}
          >
            <option value="used">Used</option>
            <option value="free">Free</option>
            <option value="reserved">Reserved</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Project / Service</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.project}
            onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">VLAN</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.vlan}
            onChange={(e) => setForm((f) => ({ ...f, vlan: e.target.value }))}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Location / Site</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Description</span>
          <textarea
            className="min-h-[60px] w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
      </div>
      {validation ? (
        <div className={clsx('rounded-lg border p-2 text-xs', validation.startsWith('Valid') ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200' : 'border-amber-500/30 bg-amber-950/20 text-amber-200')}>
          {validation}
        </div>
      ) : null}
      {formError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-xs text-rose-200">{formError}</div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runValidate()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/15"
        >
          Validate
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : props.submitLabel}
        </button>
        {props.onCancel ? (
          <button type="button" onClick={props.onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/15">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function recordToForm(r: IpamRecord): typeof emptyForm {
  return {
    address: r.address,
    record_type: r.record_type,
    status: r.status,
    project: r.project,
    vlan: r.vlan ?? '',
    location: r.location ?? '',
    description: r.description ?? '',
  };
}

function looksLikeIpOrCidr(q: string): boolean {
  const t = q.trim();
  return t.length > 0 && /^[\d./a-fA-F:]+/.test(t);
}

function recordMatchesFilter(r: IpamRecord, filterQ: string): boolean {
  const q = filterQ.trim().toLowerCase();
  if (!q) return true;
  return (
    r.address.toLowerCase().includes(q) ||
    r.project.toLowerCase().includes(q) ||
    (r.location ?? '').toLowerCase().includes(q) ||
    (r.description ?? '').toLowerCase().includes(q) ||
    (r.vlan ?? '').toLowerCase().includes(q)
  );
}

function findContainingSubnet(host: IpamRecord, subnets: IpamRecord[]): IpamRecord | null {
  const matches = subnets.filter(
    (s) => host.range_start >= s.range_start && host.range_start <= s.range_end,
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, s) => ((s.cidr_prefix ?? 0) > (best.cidr_prefix ?? 0) ? s : best));
}

type RegistrySubnetGroup = {
  subnet: IpamRecord;
  hosts: IpamRecord[];
};

function buildRegistryTree(records: IpamRecord[], filterQ: string): {
  groups: RegistrySubnetGroup[];
  orphanHosts: IpamRecord[];
} {
  const subnets = records
    .filter((r) => r.record_type === 'subnet')
    .sort((a, b) => a.range_start - b.range_start || (b.cidr_prefix ?? 0) - (a.cidr_prefix ?? 0));
  const hosts = records.filter((r) => r.record_type === 'host');

  const hostBySubnet = new Map<string, IpamRecord[]>();
  const orphanHosts: IpamRecord[] = [];

  for (const host of hosts) {
    const parent = findContainingSubnet(host, subnets);
    if (!parent) {
      orphanHosts.push(host);
      continue;
    }
    const list = hostBySubnet.get(parent.id) ?? [];
    list.push(host);
    hostBySubnet.set(parent.id, list);
  }

  for (const [, list] of hostBySubnet) {
    list.sort((a, b) => a.range_start - b.range_start);
  }
  orphanHosts.sort((a, b) => a.range_start - b.range_start);

  const q = filterQ.trim();
  const groups: RegistrySubnetGroup[] = [];

  for (const subnet of subnets) {
    const hostsInSubnet = hostBySubnet.get(subnet.id) ?? [];
    const subnetMatches = recordMatchesFilter(subnet, q);
    const visibleHosts = q
      ? hostsInSubnet.filter((h) => recordMatchesFilter(h, q))
      : hostsInSubnet;
    if (!q || subnetMatches || visibleHosts.length > 0) {
      groups.push({
        subnet,
        hosts: subnetMatches && q ? hostsInSubnet : visibleHosts,
      });
    }
  }

  const visibleOrphans = q ? orphanHosts.filter((h) => recordMatchesFilter(h, q)) : orphanHosts;

  return { groups, orphanHosts: visibleOrphans };
}

function RegistryRowCells(props: {
  r: IpamRecord;
  indent?: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <td className="px-3 py-2">
        <div className={clsx('font-mono font-medium', props.indent ? 'pl-6 text-emerald-300' : 'text-indigo-200')}>
          {props.indent ? <span className="mr-1.5 text-slate-600">↳</span> : null}
          {props.r.address}
        </div>
      </td>
      <td className="px-3 py-2 capitalize text-slate-400">{props.r.record_type}</td>
      <td className="px-3 py-2"><StatusBadge status={props.r.status} /></td>
      <td className="px-3 py-2 text-slate-300">{props.r.project || '—'}</td>
      <td className="px-3 py-2 text-slate-400">{props.r.location || '—'}</td>
      <td className="px-3 py-2 text-slate-400">{props.r.vlan || '—'}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button type="button" onClick={() => props.onEdit(props.r.id)} className="mr-2 text-indigo-400 hover:text-indigo-300">
          Edit
        </button>
        <button type="button" onClick={() => void props.onRemove(props.r.id)} className="text-rose-400 hover:text-rose-300">
          <Trash2 className="inline h-3.5 w-3.5" />
        </button>
      </td>
    </>
  );
}

function RegistryTreeTable(props: {
  records: IpamRecord[];
  filterQ: string;
  expandedSubnetIds: Set<string>;
  onToggleExpand: (subnetId: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { groups, orphanHosts } = useMemo(
    () => buildRegistryTree(props.records, props.filterQ),
    [props.records, props.filterQ],
  );

  if (groups.length === 0 && orphanHosts.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No records match your filter.</p>;
  }

  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
      <thead className="sticky top-0 z-10 bg-gray-900 text-slate-500">
        <tr className="border-b border-white/10">
          <th className="px-3 py-2 font-medium">Address</th>
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 font-medium">Status</th>
          <th className="px-3 py-2 font-medium">Project</th>
          <th className="px-3 py-2 font-medium">Location</th>
          <th className="px-3 py-2 font-medium">VLAN</th>
          <th className="px-3 py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {groups.map(({ subnet, hosts }) => {
          const filtering = props.filterQ.trim().length > 0;
          const expanded = filtering
            ? hosts.length > 0
            : props.expandedSubnetIds.has(subnet.id);
          const hasHosts = hosts.length > 0;
          return (
            <Fragment key={subnet.id}>
              <tr className="border-b border-white/10 bg-gray-900/30 hover:bg-white/5">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => props.onToggleExpand(subnet.id)}
                      className={clsx(
                        'rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-300',
                        (!hasHosts || filtering) && 'invisible',
                      )}
                      aria-label={expanded ? 'Collapse subnet' : 'Expand subnet'}
                      disabled={!hasHosts || filtering}
                    >
                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <span className="font-mono font-medium text-indigo-200">{subnet.address}</span>
                    {hasHosts ? (
                      <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-300">
                        {hosts.length} host{hosts.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 capitalize text-slate-400">subnet</td>
                <td className="px-3 py-2"><StatusBadge status={subnet.status} /></td>
                <td className="px-3 py-2 text-slate-300">{subnet.project || '—'}</td>
                <td className="px-3 py-2 text-slate-400">{subnet.location || '—'}</td>
                <td className="px-3 py-2 text-slate-400">{subnet.vlan || '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => props.onEdit(subnet.id)} className="mr-2 text-indigo-400 hover:text-indigo-300">
                    Edit
                  </button>
                  <button type="button" onClick={() => void props.onRemove(subnet.id)} className="text-rose-400 hover:text-rose-300">
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
              {expanded
                ? hosts.map((host) => (
                    <tr key={host.id} className="border-b border-white/5 bg-gray-950/40 hover:bg-white/5">
                      <RegistryRowCells r={host} indent onEdit={props.onEdit} onRemove={props.onRemove} />
                    </tr>
                  ))
                : null}
            </Fragment>
          );
        })}

        {orphanHosts.length > 0 ? (
          <>
            <tr className="border-b border-white/10 bg-gray-900/50">
              <td colSpan={7} className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Unassigned hosts
              </td>
            </tr>
            {orphanHosts.map((host) => (
              <tr key={host.id} className="border-b border-white/5 hover:bg-white/5">
                <RegistryRowCells r={host} onEdit={props.onEdit} onRemove={props.onRemove} />
              </tr>
            ))}
          </>
        ) : null}
      </tbody>
    </table>
  );
}

function SubnetHostAllocator(props: {
  detail: IpamSubnetDetail;
  allRecords: IpamRecord[];
  onAllocate: (payload: {
    address: string;
    project: string;
    vlan: string | null;
    location: string | null;
    description: string | null;
    status: IpamStatus;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { detail } = props;
  const [hostIp, setHostIp] = useState('');
  const [hostLabel, setHostLabel] = useState('');
  const [hostStatus, setHostStatus] = useState<IpamStatus>('used');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHostIp(detail.nextSuggestedIp ?? '');
    setHostLabel('');
  }, [detail.subnet.id, detail.nextSuggestedIp]);

  useEffect(() => {
    setError(null);
  }, [detail.subnet.id]);

  const findExistingHost = (address: string): IpamRecord | undefined => {
    const normalized = address.trim();
    return props.allRecords.find(
      (r) => r.record_type === 'host' && r.address === normalized,
    );
  };

  const allocate = async (ip: string, label?: string) => {
    const address = ip.trim();
    if (!address) {
      setError('Enter a host IP within this subnet.');
      return;
    }
    const existing = findExistingHost(address);
    if (existing) {
      const label = existing.description || existing.project || existing.status;
      setError(`${address} is already in use${label ? ` (${label})` : ''}. Edit the existing record or pick another address.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.onAllocate({
        address,
        project: label?.trim() || detail.subnet.project || detail.subnet.location || '',
        vlan: detail.subnet.vlan,
        location: detail.subnet.location,
        description: label?.trim() || null,
        status: hostStatus,
      });
      setHostLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setSaving(false);
    }
  };

  const canAllocate = Boolean(detail.nextSuggestedIp);

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/15 p-3">
      <p className="mb-2 text-xs font-medium text-indigo-200">Allocate host</p>
      {!canAllocate ? (
        <p className="text-[10px] text-amber-300">This subnet has no free host addresses.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[8rem] flex-1 rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="10.0.0.1"
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              disabled={saving || !detail.nextSuggestedIp}
              onClick={() => {
                setHostIp(detail.nextSuggestedIp ?? '');
                void allocate(detail.nextSuggestedIp ?? '', hostLabel);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              Next IP
            </button>
          </div>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Device / service name (optional)"
            value={hostLabel}
            onChange={(e) => setHostLabel(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none"
              value={hostStatus}
              onChange={(e) => setHostStatus(e.target.value as IpamStatus)}
            >
              <option value="used">Used</option>
              <option value="reserved">Reserved</option>
              <option value="free">Free</option>
            </select>
            <button
              type="button"
              disabled={saving || !hostIp.trim()}
              onClick={() => void allocate(hostIp, hostLabel)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Allocating…' : 'Allocate'}
            </button>
          </div>
        </div>
      )}
      {error ? (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1.5 text-[10px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="mb-2 font-medium uppercase tracking-wide text-slate-500">
          Hosts ({detail.hosts.length})
        </p>
        {detail.hosts.length === 0 ? (
          <p className="text-slate-500">No hosts assigned yet</p>
        ) : (
          <ul className="space-y-1">
            {detail.hosts.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-gray-950/40 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <RecordSummaryRow record={h} tone="host" />
                </div>
                <button
                  type="button"
                  onClick={() => void props.onRemove(h.id)}
                  className="shrink-0 text-rose-400 hover:text-rose-300"
                  aria-label={`Remove ${h.address}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function IpamPage() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [searchInput, setSearchInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importProject, setImportProject] = useState('');
  const [importCsv, setImportCsv] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selectedSubnetId, setSelectedSubnetId] = useState<string | null>(null);
  const [expandedSubnetIds, setExpandedSubnetIds] = useState<Set<string>>(() => new Set());

  const records = useIpamStore((s) => s.records);
  const dashboard = useIpamStore((s) => s.dashboard);
  const analytics = useIpamStore((s) => s.analytics);
  const integrityAudit = useIpamStore((s) => s.integrityAudit);
  const conflictScan = useIpamStore((s) => s.conflictScan);
  const subnetDetail = useIpamStore((s) => s.subnetDetail);
  const auditLog = useIpamStore((s) => s.auditLog);
  const loading = useIpamStore((s) => s.loading);
  const error = useIpamStore((s) => s.error);
  const searchResult = useIpamStore((s) => s.searchResult);
  const searchLoading = useIpamStore((s) => s.searchLoading);
  const loadAll = useIpamStore((s) => s.loadAll);
  const loadIntegrity = useIpamStore((s) => s.loadIntegrity);
  const loadAudit = useIpamStore((s) => s.loadAudit);
  const scanConflicts = useIpamStore((s) => s.scanConflicts);
  const loadSubnetDetail = useIpamStore((s) => s.loadSubnetDetail);
  const search = useIpamStore((s) => s.search);
  const addRecord = useIpamStore((s) => s.addRecord);
  const editRecord = useIpamStore((s) => s.editRecord);
  const removeRecord = useIpamStore((s) => s.removeRecord);
  const importVlsm = useIpamStore((s) => s.importVlsm);
  const bulkImportCsv = useIpamStore((s) => s.bulkImportCsv);
  const openWorkflowTabRequest = useIpamStore((s) => s.openWorkflowTabRequest);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (openWorkflowTabRequest > 0) setTab('workflow');
  }, [openWorkflowTabRequest]);

  useEffect(() => {
    if (tab === 'audit' || tab === 'dashboard') {
      void loadIntegrity();
    }
    if (tab === 'system') {
      void loadAudit();
    }
  }, [tab, loadIntegrity, loadAudit]);

  const subnetRecords = useMemo(
    () => records.filter((r) => r.record_type === 'subnet').sort((a, b) => a.range_start - b.range_start),
    [records],
  );

  useEffect(() => {
    if (subnetRecords.length === 0) {
      if (selectedSubnetId) setSelectedSubnetId(null);
      return;
    }
    const valid = selectedSubnetId && subnetRecords.some((s) => s.id === selectedSubnetId);
    if (!valid) {
      setSelectedSubnetId(subnetRecords[0].id);
      return;
    }
    void loadSubnetDetail(selectedSubnetId);
  }, [selectedSubnetId, subnetRecords, loadSubnetDetail]);

  useEffect(() => {
    if (tab !== 'subnets' || selectedSubnetId || subnetRecords.length === 0) return;
    setSelectedSubnetId(subnetRecords[0].id);
  }, [tab, selectedSubnetId, subnetRecords]);

  const runSearch = useCallback(() => {
    void search(searchInput);
  }, [search, searchInput]);

  const projectMatches = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q || looksLikeIpOrCidr(q)) return [];
    const byProject = new Map<string, IpamRecord[]>();
    for (const r of records) {
      if (!r.project.toLowerCase().includes(q)) continue;
      const list = byProject.get(r.project) ?? [];
      list.push(r);
      byProject.set(r.project, list);
    }
    return [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [records, searchInput]);

  const orphanWarnings = useMemo(
    () => integrityAudit?.warnings.filter((w) => w.type === 'orphan_host') ?? [],
    [integrityAudit],
  );

  const editingRecord = editId ? records.find((r) => r.id === editId) : null;

  const toggleSubnetExpand = useCallback((subnetId: string) => {
    setExpandedSubnetIds((prev) => {
      const next = new Set(prev);
      if (next.has(subnetId)) next.delete(subnetId);
      else next.add(subnetId);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-950 text-slate-100">
      <header className="shrink-0 border-b border-white/10 bg-gray-950/90 px-3 py-2.5 sm:px-4 lg:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-950/40 text-indigo-300">
              <Database className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-50 sm:text-lg">IPAM System</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Core system of record</p>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <Home className="h-3.5 w-3.5" strokeWidth={2} />
            Home
          </Link>
        </div>
      </header>

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
        <div className="mb-2 flex shrink-0 flex-wrap gap-2">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard</TabButton>
          <TabButton active={tab === 'registry'} onClick={() => setTab('registry')}>Registry</TabButton>
          <TabButton active={tab === 'subnets'} onClick={() => setTab('subnets')}>Subnets</TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>Search</TabButton>
          <TabButton active={tab === 'workflow'} onClick={() => setTab('workflow')}>IP Workflow</TabButton>
          <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')}>Analytics</TabButton>
          <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}>Audit</TabButton>
          <TabButton active={tab === 'system'} onClick={() => setTab('system')}>System Control</TabButton>
        </div>

        {error ? (
          <div className="mb-3 shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {loading && records.length === 0 ? (
          <p className="shrink-0 text-sm text-slate-500">Loading IP database…</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'dashboard' ? (
            <div className="h-full space-y-4 overflow-y-auto pr-1">
              {analytics ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Totals</p>
                    <p className="text-xl font-semibold text-slate-100">{analytics.totals.records}</p>
                    <p className="text-[10px] text-slate-500">{analytics.totals.subnets} subnets · {analytics.totals.hosts} hosts</p>
                  </div>
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/10 p-3">
                    <p className="text-[10px] uppercase text-slate-500">System health</p>
                    <p className={clsx(
                      'text-xl font-semibold',
                      (integrityAudit?.summary.healthScore ?? 100) >= 90 ? 'text-emerald-300' : (integrityAudit?.summary.healthScore ?? 0) >= 70 ? 'text-amber-300' : 'text-rose-300',
                    )}>
                      {integrityAudit?.summary.healthScore ?? '—'}{integrityAudit ? '%' : ''}
                    </p>
                    <button type="button" onClick={() => setTab('audit')} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                      Open audit →
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Utilization</p>
                    <p className="text-xl font-semibold text-indigo-300">{analytics.utilization.averagePercent}%</p>
                    <p className="text-[10px] text-slate-500">{analytics.utilization.subnetsOver80} subnets ≥80%</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Status mix</p>
                    <p className="text-sm text-slate-200">
                      <span className="text-emerald-300">{analytics.totals.used}</span> used ·{' '}
                      <span className="text-amber-300">{analytics.totals.reserved}</span> reserved ·{' '}
                      <span className="text-slate-400">{analytics.totals.free}</span> free
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Conflicts</p>
                    <p className={clsx('text-xl font-semibold', analytics.openConflicts > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                      {analytics.openConflicts}
                    </p>
                    <button type="button" onClick={() => { setTab('audit'); void scanConflicts(); }} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                      View in audit →
                    </button>
                  </div>
                </div>
              ) : null}

              {dashboard.length === 0 ? (
                <p className="text-sm text-slate-500">No subnets registered yet. Add records in Registry or import via System Control.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {dashboard.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedSubnetId(s.id); setTab('subnets'); }}
                      className="rounded-xl border border-white/10 bg-gray-900/50 p-4 text-left transition-colors hover:border-indigo-500/30"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-semibold text-indigo-200">{s.address}</p>
                          <p className="text-xs text-slate-500">{s.project || 'No project'} · {s.location || 'No location'}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mb-3 font-mono text-[10px] text-slate-500">{s.rangeLabel}</p>
                      <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-gray-950/60 p-2">
                          <p className="text-slate-500">Used</p>
                          <p className="font-semibold text-emerald-300">{s.usedHosts}</p>
                        </div>
                        <div className="rounded-lg bg-gray-950/60 p-2">
                          <p className="text-slate-500">Free</p>
                          <p className="font-semibold text-slate-200">{s.freeIps}</p>
                        </div>
                        <div className="rounded-lg bg-gray-950/60 p-2">
                          <p className="text-slate-500">Util</p>
                          <p className="font-semibold text-indigo-300">{s.utilizationPercent}%</p>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                          style={{ width: `${Math.min(100, s.utilizationPercent)}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'registry' ? (
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                  placeholder="Filter registry…"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => { setShowAdd((v) => !v); setEditId(null); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add record
                </button>
              </div>

              {(showAdd || editingRecord) ? (
                <div className="max-h-[40vh] shrink-0 overflow-y-auto">
                  {showAdd ? (
                    <RecordForm
                      submitLabel="Register"
                      onSubmit={async (data) => {
                        await addRecord({
                          address: data.address,
                          record_type: data.record_type,
                          status: data.status,
                          project: data.project,
                          vlan: data.vlan || null,
                          location: data.location || null,
                          description: data.description || null,
                        });
                        setShowAdd(false);
                      }}
                      onCancel={() => setShowAdd(false)}
                    />
                  ) : null}
                  {editingRecord ? (
                    <RecordForm
                      recordId={editingRecord.id}
                      initial={recordToForm(editingRecord)}
                      submitLabel="Update"
                      onSubmit={async (data) => {
                        await editRecord(editingRecord.id, {
                          address: data.address,
                          record_type: data.record_type,
                          status: data.status,
                          project: data.project,
                          vlan: data.vlan || null,
                          location: data.location || null,
                          description: data.description || null,
                        });
                        setEditId(null);
                      }}
                      onCancel={() => setEditId(null)}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/10">
                <RegistryTreeTable
                  records={records}
                  filterQ={filterQ}
                  expandedSubnetIds={expandedSubnetIds}
                  onToggleExpand={toggleSubnetExpand}
                  onEdit={(id) => { setEditId(id); setShowAdd(false); }}
                  onRemove={(id) => void removeRecord(id)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'subnets' ? (
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:flex-row">
              <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden lg:w-72 xl:w-80">
                {subnetRecords.length === 0 ? (
                  <p className="text-sm text-slate-500">No subnets. Add CIDR blocks in Registry or import via System Control.</p>
                ) : (
                  <SubnetPicker
                    subnets={subnetRecords}
                    selectedId={selectedSubnetId}
                    onSelect={setSelectedSubnetId}
                  />
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-gray-900/30 p-4">
                {!subnetDetail ? (
                  <p className="text-sm text-slate-500">Select a subnet to view free space and allocate hosts.</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <SubnetDetailCard detail={subnetDetail} />

                    <div>
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Free ranges</p>
                      {subnetDetail.freeRanges.length === 0 ? (
                        <p className="text-slate-500">No contiguous free blocks</p>
                      ) : (
                        subnetDetail.freeRanges.map((r) => (
                          <p key={`${r.start}-${r.end}`} className="font-mono text-slate-300">
                            {r.start} – {r.end} ({r.count} IPs)
                          </p>
                        ))
                      )}
                    </div>

                    <SubnetHostAllocator
                      detail={subnetDetail}
                      allRecords={records}
                      onAllocate={async (payload) => {
                        await addRecord({
                          address: payload.address,
                          record_type: 'host',
                          status: payload.status,
                          project: payload.project,
                          vlan: payload.vlan,
                          location: payload.location,
                          description: payload.description,
                        });
                      }}
                      onRemove={async (id) => {
                        await removeRecord(id);
                        if (selectedSubnetId) await loadSubnetDetail(selectedSubnetId);
                      }}
                    />

                    {subnetDetail.childSubnets.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Child subnets</p>
                        <ul className="space-y-1">
                          {subnetDetail.childSubnets.map((c) => (
                            <li key={c.id} className="rounded-md border border-white/5 bg-gray-950/40 px-2 py-1.5">
                              <RecordSummaryRow record={c} tone="subnet" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'search' ? (
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                  placeholder="IP, CIDR, or project name"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                />
                <button type="button" onClick={runSearch} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </div>

              {searchLoading ? <p className="text-sm text-slate-500">Searching…</p> : null}

              {!searchLoading && projectMatches.length > 0 && !looksLikeIpOrCidr(searchInput) ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Project mapping</p>
                  {projectMatches.map(([project, items]) => (
                    <div key={project} className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                      <p className="mb-2 font-medium text-indigo-200">{project}</p>
                      <div className="space-y-1">
                        {items.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono text-slate-200">{r.address}</span>
                            <span className="capitalize text-slate-500">{r.record_type}</span>
                            <StatusBadge status={r.status} />
                            <span className="text-slate-500">{r.location || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {searchResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4">
                    <p className="mb-2 font-mono text-sm text-indigo-200">{searchResult.query}</p>
                    <p className="text-xs text-slate-400">{searchResult.membership}</p>
                    <p className="mt-1 text-xs">
                      Assignment status:{' '}
                      <span className="font-medium capitalize text-slate-200">{searchResult.assignmentStatus}</span>
                    </p>
                  </div>

                  {searchResult.containingSubnets.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Parent subnet(s)</p>
                      {searchResult.containingSubnets.map((r) => (
                        <div key={r.id} className="mb-2 rounded-lg border border-white/10 bg-gray-900/40 p-3 text-xs">
                          <p className="font-mono text-indigo-200">{r.address}</p>
                          <p className="text-slate-400">{r.project} · {r.location ?? '—'} · <StatusBadge status={r.status} /></p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {searchResult.members.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Hosts in subnet ({searchResult.members.length})</p>
                      <div className="rounded-xl border border-white/10 bg-gray-900/40 p-3">
                        {searchResult.members.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1.5 text-xs last:border-0">
                            <span className="font-mono text-emerald-300">{r.address}</span>
                            <StatusBadge status={r.status} />
                            <span className="text-slate-400">{r.project || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4 text-xs">
                    <p className="mb-2 font-medium text-slate-400">Calculated context</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      <p><span className="text-slate-500">Network:</span> <span className="font-mono text-slate-200">{searchResult.parsed.network}</span></p>
                      <p><span className="text-slate-500">Broadcast:</span> <span className="font-mono text-slate-200">{searchResult.parsed.broadcast}</span></p>
                      <p><span className="text-slate-500">Usable range:</span> <span className="font-mono text-emerald-300">{searchResult.parsed.usableRange}</span></p>
                      <p><span className="text-slate-500">Role:</span> <span className="capitalize text-slate-200">{searchResult.parsed.role}</span></p>
                    </div>
                  </div>

                  {searchResult.exactMatches.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Exact matches</p>
                      {searchResult.exactMatches.map((r) => (
                        <div key={r.id} className="mb-2 rounded-lg border border-white/10 bg-gray-900/40 p-3 text-xs">
                          <p className="font-mono text-slate-200">{r.address}</p>
                          <p className="text-slate-400">{r.project} · {r.location ?? '—'} · VLAN {r.vlan ?? '—'} · <StatusBadge status={r.status} /></p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {searchResult.conflicts.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-400">Conflicts</p>
                      {searchResult.conflicts.map((c) => (
                        <div key={c.message} className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs">
                          <div className="mb-1 flex items-start gap-1.5 text-amber-200">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{c.message}</span>
                          </div>
                          {c.suggestion ? <p className="ml-5 text-slate-400">{c.suggestion}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'workflow' ? (
            <div className="h-full min-h-0 overflow-hidden">
              <IpamWorkflowPanel />
            </div>
          ) : null}

          {tab === 'analytics' ? (
            <div className="h-full space-y-4 overflow-y-auto pr-1">
              {!analytics ? (
                <p className="text-sm text-slate-500">Loading analytics…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <BarChart3 className="h-4 w-4 text-indigo-400" />
                      {new Date(analytics.generatedAt).toLocaleString()}
                    </div>
                    <a
                      href={utilizationReportUrl()}
                      download
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download utilization report
                    </a>
                  </div>

                  {integrityAudit ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/10 p-4">
                        <p className="text-[10px] uppercase text-slate-500">Allocation efficiency</p>
                        <p className="text-2xl font-semibold text-indigo-300">{integrityAudit.summary.efficiencyPercent}%</p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                        <p className="text-[10px] uppercase text-slate-500">Average utilization</p>
                        <p className="text-2xl font-semibold text-emerald-300">{analytics.utilization.averagePercent}%</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-300">By project</p>
                    {analytics.byProject.length === 0 ? (
                      <p className="text-xs text-slate-500">No project assignments</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 text-left font-medium">Project</th>
                            <th className="py-1 text-right font-medium">Records</th>
                            <th className="py-1 text-right font-medium">Subnets</th>
                            <th className="py-1 text-right font-medium">Hosts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.byProject.map((p) => (
                            <tr key={p.project} className="border-t border-white/5">
                              <td className="py-1.5 text-slate-200">{p.project}</td>
                              <td className="py-1.5 text-right text-slate-300">{p.records}</td>
                              <td className="py-1.5 text-right text-slate-400">{p.subnets}</td>
                              <td className="py-1.5 text-right text-slate-400">{p.hosts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {analytics.utilization.highUtilizationSubnets.length > 0 ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                      <p className="mb-2 text-sm font-medium text-amber-200">High utilization (≥80%)</p>
                      {analytics.utilization.highUtilizationSubnets.map((addr) => (
                        <p key={addr} className="font-mono text-xs text-slate-300">{addr}</p>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-300">Subnet utilization table</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 text-left font-medium">Subnet</th>
                            <th className="py-1 text-right font-medium">Used</th>
                            <th className="py-1 text-right font-medium">Free</th>
                            <th className="py-1 text-right font-medium">Util %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.subnetSummaries.map((s) => (
                            <tr key={s.id} className="border-t border-white/5">
                              <td className="py-1.5 font-mono text-indigo-200">{s.address}</td>
                              <td className="py-1.5 text-right text-emerald-300">{s.usedHosts}</td>
                              <td className="py-1.5 text-right text-slate-400">{s.freeIps}</td>
                              <td className="py-1.5 text-right text-slate-300">{s.utilizationPercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {tab === 'audit' ? (
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void scanConflicts()}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600/80 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Run conflict detection
                </button>
                {conflictScan ? (
                  <span className={clsx('text-xs', conflictScan.count > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                    {conflictScan.count === 0 ? 'No subnet/host pair conflicts' : `${conflictScan.count} conflict pair(s)`}
                  </span>
                ) : null}
              </div>
              {conflictScan && conflictScan.count > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 text-xs">
                  {conflictScan.issues.map((issue) => (
                    <p key={issue.message} className="border-b border-white/5 py-1.5 last:border-0 text-slate-300">{issue.message}</p>
                  ))}
                </div>
              ) : null}
              {orphanWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                  <p className="mb-2 text-sm font-medium text-amber-200">Orphan IPs ({orphanWarnings.length})</p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {orphanWarnings.map((w) => (
                      <li key={w.message} className="font-mono">{w.address ?? w.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <IpamAuditPanel
                audit={integrityAudit}
                loading={loading}
                onRescan={() => void loadIntegrity()}
              />
            </div>
          ) : null}

          {tab === 'system' ? (
            <div
              className="scrollbar-hidden h-full min-h-0 space-y-4 overflow-y-auto pr-1 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
              tabIndex={0}
              role="region"
              aria-label="System Control"
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-400" />
                    <p className="text-sm font-medium text-slate-300">Bulk CSV import</p>
                  </div>
                  <p className="mb-2 text-[10px] text-slate-500">Header: Address, Type, Status, Project, VLAN, Location, Description</p>
                  <textarea
                    className="mb-2 min-h-[100px] w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-[10px] text-slate-100 outline-none"
                    placeholder={'Address,Type,Status,Project\n10.2.1.0/24,subnet,reserved,Branch\n10.2.1.1,host,used,Router'}
                    value={importCsv}
                    onChange={(e) => setImportCsv(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await bulkImportCsv(importCsv);
                        setImportMsg(`CSV: ${result.created} imported, ${result.errors} failed.`);
                        setImportCsv('');
                        void loadAudit();
                      } catch (e) {
                        setImportMsg(e instanceof Error ? e.message : 'CSV import failed');
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import CSV
                  </button>
                </div>

                <div className="rounded-xl border border-violet-500/20 bg-violet-950/10 p-4">
                  <p className="mb-2 text-sm font-medium text-slate-300">VLSM import</p>
                  <p className="mb-2 text-[10px] text-slate-500">Import VLSM Planner JSON export or paste plan results here.</p>
                  <input
                    className="mb-2 w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none"
                    placeholder="Project name (optional)"
                    value={importProject}
                    onChange={(e) => setImportProject(e.target.value)}
                  />
                  <textarea
                    className="mb-2 min-h-[100px] w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 font-mono text-[10px] text-slate-100 outline-none"
                    placeholder='{"baseNetwork":"10.0.0.0/24","subnets":[...]}'
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const plan = JSON.parse(importJson) as unknown;
                        const result = await importVlsm(plan, importProject);
                        setImportMsg(`VLSM: ${result.created} imported${result.errors ? `, ${result.errors} failed` : ''}.`);
                        setImportJson('');
                        void loadAudit();
                      } catch (e) {
                        setImportMsg(e instanceof Error ? e.message : 'VLSM import failed');
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import VLSM plan
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  <p className="mb-2 text-sm font-medium text-slate-300">Export database</p>
                  <div className="flex flex-wrap gap-2">
                    <a href={exportCsvUrl()} download className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15">
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const data = await exportJson();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'ipam-export.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      JSON + analytics
                    </button>
                    <a href={utilizationReportUrl()} download className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15">
                      <Download className="h-3.5 w-3.5" />
                      Utilization report
                    </a>
                  </div>
                  {importMsg ? <p className="mt-2 text-xs text-slate-400">{importMsg}</p> : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-300">Activity log</p>
                {auditLog.length === 0 ? (
                  <p className="text-xs text-slate-500">No audit entries yet</p>
                ) : (
                  <div
                    className="scrollbar-hidden max-h-64 space-y-2 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
                    tabIndex={0}
                    role="log"
                    aria-label="Activity log entries"
                  >
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-white/5 bg-gray-950/40 px-3 py-2 text-[10px]">
                        <span className="font-medium uppercase text-indigo-300">{entry.action}</span>
                        {entry.address ? <span className="ml-2 font-mono text-slate-300">{entry.address}</span> : null}
                        <span className="ml-2 text-slate-600">{entry.created_at}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
