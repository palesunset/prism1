import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import type { Site } from '@/types';
import { UtilizationBar } from '@/components/Equipment/UtilizationBar';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

export function SiteList({
  sites,
  vendorFilter,
  onEdit,
  onDelete,
}: {
  sites: Site[];
  /** When set, utilization reflects ports for this vendor only */
  vendorFilter?: string;
  onEdit: (s: Site) => void;
  onDelete: (s: Site) => void;
}) {
  const root = useInventoryRoot();
  if (!sites.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600">
        No sites match your search.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">PLAID</th>
            <th className="px-3 py-2">Territory</th>
            <th className="px-3 py-2">Region</th>
            <th className="px-3 py-2">
              {vendorFilter?.trim()
                ? `Equipment (${vendorFilter.trim()})`
                : 'Equipment (all vendors)'}
            </th>
            <th className="min-w-[140px] px-3 py-2">
              {vendorFilter?.trim()
                ? `Utilization % (${vendorFilter.trim()})`
                : 'Utilization % (all vendors)'}
            </th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr
              key={s.id}
              className="border-t border-slate-200 dark:border-slate-700"
            >
              <td className="px-3 py-2">
                <Link to={invPath(root, 'sites', s.id)} className="font-medium text-sky-600 hover:underline dark:text-sky-400">
                  {s.name}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{s.plaid}</td>
              <td className="px-3 py-2">{(s.territory && s.territory.trim()) || s.area}</td>
              <td className="px-3 py-2">{s.region}</td>
              <td className="px-3 py-2">{s.equipment_count ?? 0}</td>
              <td className="px-3 py-2">
                <UtilizationBar thin pct={s.utilization_pct ?? 0} />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(s)}
                  className="mr-1 inline-flex rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  className="inline-flex rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
