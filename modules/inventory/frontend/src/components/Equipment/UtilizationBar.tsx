import clsx from 'clsx';

export function UtilizationBar({
  pct,
  className,
  thin,
}: {
  pct: number;
  className?: string;
  thin?: boolean;
}) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className={clsx('w-full', className)}>
      <div
        className={clsx(
          'w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700',
          thin ? 'h-1.5' : 'h-2.5'
        )}
      >
        <div
          className="h-full rounded-full bg-sky-500 transition-all dark:bg-sky-400"
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="mt-0.5 text-right text-xs text-slate-500 dark:text-slate-400">
        {p.toFixed(1)}%
      </p>
    </div>
  );
}
