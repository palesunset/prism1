import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Lock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { WheelEvent } from 'react';
import type { IpamRecord, IpamStatus, IpamSubnetDetail, SubnetDashboard } from '../../services/ipamApi';
import { statusClass } from '../../services/ipamApi';
import { octetsToString, uint32ToIp } from '../../utils/ipCalculator';
import { filterRecordsByScope, scopeTotals, type IpAddressScope } from '../../utils/ipamScope';
import {
  hostInSubnetRecord,
  recordAddressFamily,
  sortRecordsByAddress,
} from '../../utils/ipamFamily';
import { IpamScrollArea } from './IpamScrollArea';

/** ~10 compact table rows visible in the host list viewport. */
const HOST_LIST_MIN_HEIGHT_PX = 320;

function isolateHostListWheel(e: WheelEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  if (el.scrollHeight <= el.clientHeight + 1) return;
  const delta = e.deltaY;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if ((delta < 0 && !atTop) || (delta > 0 && !atBottom)) {
    e.stopPropagation();
  }
}

export function StatusBadge(props: { status: IpamStatus }) {
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

export function RecordSummaryRow(props: { record: IpamRecord; tone?: 'host' | 'subnet'; showMeta?: boolean }) {
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
  if (recordAddressFamily(subnet) === 'ipv6') {
    const base = subnet.address.split('/')[0] ?? subnet.address;
    return { network: base, broadcast: base };
  }
  return {
    network: octetsToString(uint32ToIp(subnet.range_start)),
    broadcast: octetsToString(uint32ToIp(subnet.range_end)),
  };
}

function subnetRangeLabel(subnet: IpamRecord): string {
  if (recordAddressFamily(subnet) === 'ipv6') {
    return subnet.address;
  }
  const prefix = subnet.cidr_prefix ?? 32;
  const broadcast = `${octetsToString(uint32ToIp(subnet.range_end))}/${prefix}`;
  return `${subnet.address} — ${broadcast}`;
}

function SubnetDashboardCard(props: {
  subnet: SubnetDashboard;
  onSelect: () => void;
  accent?: 'indigo' | 'sky' | 'violet';
}) {
  const borderHover =
    props.accent === 'violet'
      ? 'hover:border-violet-500/30'
      : props.accent === 'sky'
        ? 'hover:border-sky-500/30'
        : 'hover:border-indigo-500/30';
  const addrClass =
    props.accent === 'violet'
      ? 'text-violet-200'
      : props.accent === 'sky'
        ? 'text-sky-200'
        : 'text-indigo-200';
  const util = props.subnet.utilizationPercent;
  const isLargeV6 =
    props.subnet.address_family === 'ipv6' &&
    props.subnet.usableHosts == null &&
    props.subnet.freeIps == null;
  const utilLabel =
    util != null ? `${util}%` : isLargeV6 ? 'N/A' : props.subnet.usedHosts > 0 ? 'N/A' : '0%';
  const freeLabel =
    props.subnet.freeIps != null
      ? String(props.subnet.freeIps)
      : isLargeV6
        ? 'Large'
        : '—';
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={clsx(
        'rounded-xl border border-white/10 bg-gray-900/50 p-4 text-left transition-colors',
        borderHover,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className={clsx('font-mono text-sm font-semibold', addrClass)}>{props.subnet.address}</p>
          <p className="text-xs text-slate-500">{props.subnet.project || 'No project'} · {props.subnet.location || 'No location'}</p>
        </div>
        <StatusBadge status={props.subnet.status} />
      </div>
      <p className="mb-3 font-mono text-[10px] text-slate-500">{props.subnet.rangeLabel}</p>
      <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-gray-950/60 p-2">
          <p className="text-slate-500">Used</p>
          <p className="font-semibold text-emerald-300">{props.subnet.usedHosts}</p>
        </div>
        <div className="rounded-lg bg-gray-950/60 p-2">
          <p className="text-slate-500">Free</p>
          <p className="font-semibold text-slate-200">{freeLabel}</p>
        </div>
        <div className="rounded-lg bg-gray-950/60 p-2">
          <p className="text-slate-500">Util</p>
          <p className={clsx('font-semibold', util != null ? 'text-indigo-300' : 'text-slate-400')}>{utilLabel}</p>
        </div>
      </div>
      {util != null && util > 0 ? (
        <div className="h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
            style={{ width: `${Math.min(100, util)}%` }}
          />
        </div>
      ) : null}
    </button>
  );
}

export function DashboardScopeSection(props: {
  title: string;
  icon: React.ReactNode;
  totals: ReturnType<typeof scopeTotals>;
  subnets: SubnetDashboard[];
  emptyLabel: string;
  accent: 'indigo' | 'sky';
  onSubnetSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          {props.icon}
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{props.title}</h2>
            <p className="text-[10px] text-slate-500">
              {props.totals.subnets} subnets · {props.totals.hosts} hosts · {props.totals.records} records
            </p>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          <span className="text-emerald-300">{props.totals.used}</span> used ·{' '}
          <span className="text-amber-300">{props.totals.reserved}</span> reserved ·{' '}
          <span className="text-slate-400">{props.totals.free}</span> free
        </p>
      </div>
      {props.subnets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-gray-900/30 p-4 text-sm text-slate-500">{props.emptyLabel}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {props.subnets.map((s) => (
            <SubnetDashboardCard
              key={s.id}
              subnet={s}
              accent={props.accent}
              onSelect={() => props.onSubnetSelect(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function RegistryFamilySection(props: {
  title: string;
  description: string;
  icon: React.ReactNode;
  records: IpamRecord[];
  filterQ: string;
  expandedSubnetIds: Set<string>;
  onToggleExpand: (subnetId: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-gray-900/20">
      <header className="flex items-start gap-2 border-b border-white/10 px-3 py-2.5">
        {props.icon}
        <div>
          <h2 className="text-xs font-semibold text-slate-200">{props.title}</h2>
          <p className="text-[10px] text-slate-500">{props.description}</p>
        </div>
      </header>
      <RegistryTreeTable
        records={props.records}
        filterQ={props.filterQ}
        expandedSubnetIds={props.expandedSubnetIds}
        onToggleExpand={props.onToggleExpand}
        onEdit={props.onEdit}
        onRemove={props.onRemove}
        selectedIds={props.selectedIds}
        onToggleSelect={props.onToggleSelect}
      />
    </section>
  );
}

export function DashboardFamilySection(props: {
  title: string;
  icon: React.ReactNode;
  totals: ReturnType<typeof scopeTotals>;
  subnets: SubnetDashboard[];
  emptyLabel: string;
  accent?: 'indigo' | 'sky' | 'violet';
  onSubnetSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        {props.icon}
        <h2 className="text-sm font-semibold text-slate-200">{props.title}</h2>
        <span className="text-[10px] text-slate-500">
          {props.totals.subnets} subnet(s) · {props.totals.hosts} host(s)
        </span>
      </header>
      {props.subnets.length === 0 ? (
        <p className="text-sm text-slate-500">{props.emptyLabel}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {props.subnets.map((s) => (
            <SubnetDashboardCard key={s.id} subnet={s} accent={props.accent} onSelect={() => props.onSubnetSelect(s.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RegistryScopeSection(props: {
  title: string;
  description: string;
  icon: React.ReactNode;
  scope: IpAddressScope;
  records: IpamRecord[];
  filterQ: string;
  expandedSubnetIds: Set<string>;
  onToggleExpand: (subnetId: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const scoped = useMemo(() => filterRecordsByScope(props.records, props.scope), [props.records, props.scope]);
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-gray-900/20">
      <header className="flex items-start gap-2 border-b border-white/10 px-3 py-2.5">
        {props.icon}
        <div>
          <h2 className="text-xs font-semibold text-slate-200">{props.title}</h2>
          <p className="text-[10px] text-slate-500">{props.description}</p>
        </div>
      </header>
      <RegistryTreeTable
        records={scoped}
        filterQ={props.filterQ}
        expandedSubnetIds={props.expandedSubnetIds}
        onToggleExpand={props.onToggleExpand}
        onEdit={props.onEdit}
        onRemove={props.onRemove}
        selectedIds={props.selectedIds}
        onToggleSelect={props.onToggleSelect}
      />
    </section>
  );
}

export function SubnetDetailCard(props: { detail: IpamSubnetDetail }) {
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
export function SubnetPicker(props: {
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
    return [...filtered, selected].sort(sortRecordsByAddress);
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

      <IpamScrollArea ariaLabel="Subnet list" isolateWheel className="min-h-0 flex-1">
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
      </IpamScrollArea>
    </div>
  );
}
export function looksLikeIpOrCidr(q: string): boolean {
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
  const matches = subnets.filter((s) => hostInSubnetRecord(host, s));
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
    .sort((a, b) => sortRecordsByAddress(a, b) || (b.cidr_prefix ?? 0) - (a.cidr_prefix ?? 0));
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
    list.sort(sortRecordsByAddress);
  }
  orphanHosts.sort(sortRecordsByAddress);

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
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
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
          {props.onToggleSelect ? (
            <th className="w-8 px-2 py-2 font-medium" aria-label="Select" />
          ) : null}
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
                {props.onToggleSelect ? (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={props.selectedIds?.has(subnet.id) ?? false}
                      onChange={() => props.onToggleSelect?.(subnet.id)}
                      aria-label={`Select ${subnet.address}`}
                    />
                  </td>
                ) : null}
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
                      {props.onToggleSelect ? (
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={props.selectedIds?.has(host.id) ?? false}
                            onChange={() => props.onToggleSelect?.(host.id)}
                            aria-label={`Select ${host.address}`}
                          />
                        </td>
                      ) : null}
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
              <td colSpan={props.onToggleSelect ? 8 : 7} className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Unassigned Hosts
              </td>
            </tr>
            {orphanHosts.map((host) => (
              <tr key={host.id} className="border-b border-white/5 hover:bg-white/5">
                {props.onToggleSelect ? (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={props.selectedIds?.has(host.id) ?? false}
                      onChange={() => props.onToggleSelect?.(host.id)}
                      aria-label={`Select ${host.address}`}
                    />
                  </td>
                ) : null}
                <RegistryRowCells r={host} onEdit={props.onEdit} onRemove={props.onRemove} />
              </tr>
            ))}
          </>
        ) : null}
      </tbody>
    </table>
  );
}

export function SubnetFreeRangesList(props: {
  ranges: IpamSubnetDetail['freeRanges'];
  maxVisible?: number;
}) {
  const maxVisible = props.maxVisible ?? 5;
  const { ranges } = props;
  if (ranges.length === 0) {
    return <p className="text-slate-500">No contiguous free blocks</p>;
  }
  const visible = ranges.slice(0, maxVisible);
  const hidden = ranges.length - visible.length;
  return (
    <div className="space-y-0.5">
      {visible.map((r) => (
        <p key={`${r.start}-${r.end}`} className="font-mono text-slate-300">
          {r.start} – {r.end}
          {r.count != null ? ` (${r.count} IPs)` : ''}
        </p>
      ))}
      {hidden > 0 ? (
        <p className="text-[10px] text-slate-500">
          + {hidden} more free block{hidden === 1 ? '' : 's'} — remove hosts or consolidate assignments to simplify
        </p>
      ) : null}
    </div>
  );
}

export function SubnetHostAllocator(props: {
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
  const [hostFilter, setHostFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostListRef = useRef<HTMLDivElement>(null);
  const prevHostCountRef = useRef(detail.hosts.length);

  useEffect(() => {
    setHostIp(detail.nextSuggestedIp ?? '');
    setHostLabel('');
  }, [detail.subnet.id, detail.nextSuggestedIp]);

  useEffect(() => {
    setError(null);
    setHostFilter('');
  }, [detail.subnet.id]);

  useEffect(() => {
    if (detail.hosts.length > prevHostCountRef.current && hostListRef.current) {
      hostListRef.current.scrollTop = hostListRef.current.scrollHeight;
    }
    prevHostCountRef.current = detail.hosts.length;
  }, [detail.hosts.length]);

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
      const existingLabel = existing.description || existing.project || existing.status;
      setError(`${address} is already in use${existingLabel ? ` (${existingLabel})` : ''}. Edit the existing record or pick another address.`);
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

  const canUseNextIp = Boolean(detail.nextSuggestedIp);
  const filteredHosts = useMemo(() => {
    const q = hostFilter.trim().toLowerCase();
    if (!q) return detail.hosts;
    return detail.hosts.filter((h) =>
      [h.address, h.project, h.description, h.hostname, h.location, h.vlan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [detail.hosts, hostFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 rounded-lg border border-indigo-500/20 bg-indigo-950/15 p-2.5">
        <p className="mb-1.5 text-xs font-medium text-indigo-200">Quick allocate</p>
        {!canUseNextIp ? (
          <p className="mb-2 text-[11px] text-amber-300/90">
            {detail.subnet.address.includes(':')
              ? 'No free addresses detected in this prefix — enter a host address manually.'
              : 'No automatic next IP — enter an address manually within this subnet.'}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="min-w-[9rem] flex-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">IP address</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-2 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder={detail.subnet.address.includes(':') ? '2001:db8::1' : '10.0.0.1'}
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="min-w-[8rem] flex-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Name (optional)</span>
            <input
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-2 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Device or service"
              value={hostLabel}
              onChange={(e) => setHostLabel(e.target.value)}
            />
          </label>
          <label className="w-full sm:w-auto">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Status</span>
            <select
              className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-2 text-xs text-slate-100 outline-none sm:min-w-[6.5rem]"
              value={hostStatus}
              onChange={(e) => setHostStatus(e.target.value as IpamStatus)}
            >
              <option value="used">Used</option>
              <option value="reserved">Reserved</option>
              <option value="free">Free</option>
            </select>
          </label>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              disabled={saving || !canUseNextIp}
              onClick={() => {
                setHostIp(detail.nextSuggestedIp ?? '');
                void allocate(detail.nextSuggestedIp ?? '', hostLabel);
              }}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-2 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50 sm:flex-none"
            >
              <Plus className="h-3.5 w-3.5" />
              Next IP
            </button>
            <button
              type="button"
              disabled={saving || !hostIp.trim()}
              onClick={() => void allocate(hostIp, hostLabel)}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:flex-none"
            >
              {saving ? 'Saving…' : 'Allocate'}
            </button>
          </div>
        </div>
        {error ? (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-2 text-[11px] text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-gray-950/50"
        style={{ minHeight: HOST_LIST_MIN_HEIGHT_PX }}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          <p className="text-xs font-medium text-slate-200">
            Assigned hosts
            <span className="ml-1.5 font-normal text-slate-500">({detail.hosts.length})</span>
          </p>
          {detail.nextSuggestedIp ? (
            <span className="text-[10px] text-slate-500">
              Next free: <span className="font-mono text-indigo-300">{detail.nextSuggestedIp}</span>
            </span>
          ) : null}
          {detail.hosts.length > 0 ? (
            <input
              className="ml-auto min-w-[8rem] flex-1 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1 text-[11px] text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40 sm:max-w-[12rem] sm:flex-none"
              placeholder="Filter hosts…"
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
            />
          ) : null}
        </div>

        {detail.hosts.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No hosts assigned yet — use Quick allocate above.</p>
        ) : filteredHosts.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No hosts match your filter.</p>
        ) : (
          <div
            ref={hostListRef}
            role="region"
            aria-label={`Assigned hosts in ${detail.subnet.address}`}
            className="scrollbar-hidden min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain"
            style={{ minHeight: HOST_LIST_MIN_HEIGHT_PX - 44 }}
            onWheel={isolateHostListWheel}
          >
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-gray-950 text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Name / project</th>
                  <th className="w-10 px-2 py-2 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredHosts.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 font-mono text-emerald-300">{h.address}</td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-1.5 text-slate-400" title={h.description || h.project || undefined}>
                      {h.description || h.project || h.hostname || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => void props.onRemove(h.id)}
                        className="rounded p-1 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                        aria-label={`Remove ${h.address}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
