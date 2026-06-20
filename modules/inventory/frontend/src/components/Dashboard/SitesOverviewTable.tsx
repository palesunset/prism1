import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SiteOverviewRow } from '@/types/dashboard';
import { SiteStatusBadge } from '@/components/Dashboard/SiteStatusBadge';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

type SortKey =
  | 'name'
  | 'plaid'
  | 'area'
  | 'region'
  | 'equipment_count'
  | 'total_ports'
  | 'utilization_pct'
  | 'operational_status';

function cmp(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function SitesOverviewTable({ sites, search }: { sites: SiteOverviewRow[]; search: string }) {
  const root = useInventoryRoot();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.plaid.toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }, [sites, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return cmp(va as string | number, vb as string | number) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const th = (key: SortKey, label: string) => {
    const active = sortKey === key;
    return (
      <th className="px-3 py-2">
        <button
          type="button"
          onClick={() => toggle(key)}
          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
        >
          {label}
          {active ? (
            sortDir === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            {th('name', 'Site')}
            {th('plaid', 'PLAID')}
            {th('area', 'Territory')}
            {th('region', 'Region')}
            {th('equipment_count', 'Equipment')}
            {th('total_ports', 'Ports')}
            {th('utilization_pct', 'Util %')}
            {th('operational_status', 'Status')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
              <td className="px-3 py-2">
                <Link to={invPath(root, 'sites', r.id)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.plaid}</td>
              <td className="px-3 py-2">{r.area}</td>
              <td className="px-3 py-2">{r.region}</td>
              <td className="px-3 py-2 tabular-nums">{r.equipment_count}</td>
              <td className="px-3 py-2 tabular-nums">{r.total_ports}</td>
              <td className="px-3 py-2 tabular-nums">{r.utilization_pct.toFixed(1)}%</td>
              <td className="px-3 py-2">
                <SiteStatusBadge status={r.operational_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sorted.length && <p className="p-6 text-center text-slate-500">No sites match your filters or search.</p>}
    </div>
  );
}
