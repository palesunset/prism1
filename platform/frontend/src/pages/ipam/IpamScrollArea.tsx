import clsx from 'clsx';
import type { KeyboardEvent, ReactNode, WheelEvent } from 'react';
import { forwardRef } from 'react';

const SCROLL_STEP_PX = 48;

function handleScrollKeys(e: KeyboardEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  switch (e.key) {
    case 'ArrowDown':
      el.scrollTop += SCROLL_STEP_PX;
      e.preventDefault();
      break;
    case 'ArrowUp':
      el.scrollTop -= SCROLL_STEP_PX;
      e.preventDefault();
      break;
    case 'PageDown':
      el.scrollTop += el.clientHeight;
      e.preventDefault();
      break;
    case 'PageUp':
      el.scrollTop -= el.clientHeight;
      e.preventDefault();
      break;
    case 'Home':
      if (e.ctrlKey) {
        el.scrollTop = 0;
        e.preventDefault();
      }
      break;
    case 'End':
      if (e.ctrlKey) {
        el.scrollTop = el.scrollHeight;
        e.preventDefault();
      }
      break;
    default:
      break;
  }
}

/** Stop parent scroll areas from moving while this panel can still scroll. */
function handleWheelIsolate(e: WheelEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  if (el.scrollHeight <= el.clientHeight + 1) return;

  const delta = e.deltaY;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

  if ((delta < 0 && !atTop) || (delta > 0 && !atBottom)) {
    e.stopPropagation();
  }
}

/** Scrollable IPAM panel: hidden scrollbar, mouse wheel + arrow keys when focused. */
export const IpamScrollArea = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    ariaLabel?: string;
    fill?: boolean;
    role?: string;
    /** Stop parent scroll areas from moving while this panel can still scroll. */
    isolateWheel?: boolean;
    smooth?: boolean;
  }
>(function IpamScrollArea(props, ref) {
  return (
    <div
      ref={ref}
      className={clsx(
        'scrollbar-hidden min-h-0 overflow-y-auto overscroll-y-contain pr-1 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
        props.smooth !== false && 'scroll-smooth',
        props.fill !== false && 'h-full min-h-0 flex-1',
        props.className,
      )}
      tabIndex={0}
      role={props.role ?? 'region'}
      aria-label={props.ariaLabel}
      onKeyDown={handleScrollKeys}
      onWheel={props.isolateWheel ? handleWheelIsolate : undefined}
    >
      {props.children}
    </div>
  );
});
