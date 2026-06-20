import clsx from 'clsx';
import { Globe, Network } from 'lucide-react';
import type { IpAddressFamily } from '../../utils/ipamFamily';

const OPTIONS: {
  id: IpAddressFamily;
  label: string;
  hint: string;
  icon: typeof Globe;
}[] = [
  {
    id: 'ipv4',
    label: 'IPv4',
    hint: '32-bit · RFC1918 public/private',
    icon: Globe,
  },
  {
    id: 'ipv6',
    label: 'IPv6',
    hint: '128-bit · CIDR subnets & hosts',
    icon: Network,
  },
];

export function IpamFamilyToggle(props: {
  family: IpAddressFamily;
  onChange: (family: IpAddressFamily) => void;
  ipv4Count?: number;
  ipv6Count?: number;
}) {
  const activeHint =
    props.family === 'ipv4'
      ? 'Dashboard, registry, workflows, and search are scoped to IPv4 only.'
      : 'Dashboard, registry, workflows, and search are scoped to IPv6 only.';

  return (
    <div
      className="mb-3 shrink-0 rounded-xl border border-white/10 bg-gradient-to-r from-gray-900/80 to-gray-950/80 px-3 py-2.5 shadow-inner shadow-black/20 sm:px-4 sm:py-3"
      role="region"
      aria-label="IP version scope"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Registry scope
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-100">Which addresses are you managing?</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{activeHint}</p>
        </div>

        <div
          className="inline-flex shrink-0 self-start rounded-xl border border-white/15 bg-gray-950 p-1 shadow-sm lg:self-center"
          role="group"
          aria-label="Switch IP version"
        >
          {OPTIONS.map((opt) => {
            const active = props.family === opt.id;
            const count = opt.id === 'ipv4' ? props.ipv4Count : props.ipv6Count;
            const Icon = opt.icon;
            const isV6 = opt.id === 'ipv6';

            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => props.onChange(opt.id)}
                className={clsx(
                  'relative flex min-w-[7.5rem] flex-col items-start rounded-lg px-3 py-2 text-left transition-all sm:min-w-[8.5rem] sm:px-4',
                  active
                    ? isV6
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-900/40'
                      : 'bg-sky-600 text-white shadow-md shadow-sky-900/40'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <Icon
                    className={clsx('h-4 w-4 shrink-0', active ? 'text-white/90' : isV6 ? 'text-violet-400/80' : 'text-sky-400/80')}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold">{opt.label}</span>
                  {count != null ? (
                    <span
                      className={clsx(
                        'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                        active ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                <span
                  className={clsx(
                    'mt-0.5 hidden text-[9px] leading-tight sm:block',
                    active ? 'text-white/75' : 'text-slate-600',
                  )}
                >
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
