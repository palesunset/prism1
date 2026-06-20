import clsx from 'clsx';

export type IpamTabId =
  | 'dashboard'
  | 'registry'
  | 'subnets'
  | 'search'
  | 'workflow'
  | 'analytics'
  | 'audit'
  | 'system';

export function IpamTabButton(props: {
  active: boolean;
  onClick: () => void;
  children: string;
  tabId: IpamTabId;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`ipam-tab-${props.tabId}`}
      aria-selected={props.active}
      aria-controls={`ipam-panel-${props.tabId}`}
      onClick={props.onClick}
      className={clsx(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        props.active
          ? 'bg-white/10 text-slate-100 ring-1 ring-white/20'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
      )}
    >
      {props.children}
    </button>
  );
}

export function IpamTabPanel(props: {
  tabId: IpamTabId;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!props.active) return null;
  return (
    <div
      role="tabpanel"
      id={`ipam-panel-${props.tabId}`}
      aria-labelledby={`ipam-tab-${props.tabId}`}
      className={props.className ?? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'}
    >
      {props.children}
    </div>
  );
}
