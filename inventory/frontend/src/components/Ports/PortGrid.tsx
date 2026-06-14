import clsx from 'clsx';
import type { Port } from '@/types';

export function PortGrid({
  ports,
  onPortClick,
}: {
  ports: Port[];
  onPortClick: (p: Port) => void;
}) {
  const ordered = [...ports].sort((a, b) => a.port_number - b.port_number);
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {ordered.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPortClick(p)}
          title={p.description || (p.is_utilized ? 'Utilized' : 'Free')}
          className={clsx(
            'rounded-lg border-2 px-2 py-2 text-center text-xs font-medium transition hover:opacity-90',
            p.is_utilized
              ? 'border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-950/50 dark:text-orange-100'
              : 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-100'
          )}
        >
          {p.port_number}
        </button>
      ))}
    </div>
  );
}
