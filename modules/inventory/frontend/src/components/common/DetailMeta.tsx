import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Consistent label/value rows for site and equipment detail headers. */
export function DetailMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mt-2 space-y-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300', className)}>
      {children}
    </div>
  );
}

export function DetailMetaLine({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>{' '}
      <span className={clsx('text-slate-700 dark:text-slate-200', mono && 'font-mono')}>{children}</span>
    </div>
  );
}

/** Inline secondary label inside a meta line (e.g. " · Territory:"). */
export function DetailMetaInlineLabel({ children }: { children: ReactNode }) {
  return <span className="text-slate-500 dark:text-slate-400">{children}</span>;
}
