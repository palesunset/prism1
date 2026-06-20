import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Scrollable area with hidden scrollbar; mouse wheel and arrow keys work when focused. */
export function ScrollRegion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx('scroll-region', className)}
      tabIndex={0}
      role="region"
      aria-label="Scrollable content"
    >
      {children}
    </div>
  );
}
