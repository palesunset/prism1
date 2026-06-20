import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export function CollapsibleChartCard({
  title,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={clsx('h-5 w-5 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
          />
          <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {open ? <div className="p-4 pt-2">{children}</div> : null}
    </section>
  );
}
