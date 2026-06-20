import { Link } from 'react-router-dom';
import type { EquipmentCountResponse } from '@/types';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

export function CountInsightCard({ data }: { data: EquipmentCountResponse | null }) {
  const root = useInventoryRoot();
  if (!data) return null;
  return (
    <section
      className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40"
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-sky-900 dark:text-sky-100">
        {data.total_equipment} equipment
        {data.site_count !== 1 ? ` across ${data.site_count} sites` : ' (1 site)'}
      </h2>
      <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-200/80">{data.note}</p>
      {data.sites.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
          {data.sites.map((s) => (
            <li key={s.site_id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-sky-200/60 pt-2 first:border-t-0 first:pt-0 dark:border-sky-800/60">
              <span>
                <Link
                  to={invPath(root, 'sites', s.site_id)}
                  className="font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  {s.site_name}
                </Link>
                <span className="ml-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {s.site_plaid}
                </span>
                <span className="ml-2 text-xs text-slate-500">
                  Region {s.region} · Territory {s.area}
                </span>
              </span>
              <span className="font-medium tabular-nums">{s.equipment_count}</span>
            </li>
          ))}
        </ul>
      )}
      {data.total_equipment === 0 && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No matching equipment.</p>
      )}
    </section>
  );
}
