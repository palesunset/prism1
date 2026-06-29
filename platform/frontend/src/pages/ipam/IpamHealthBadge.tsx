import { useEffect, useState } from 'react';
import { fetchHealth, fetchCapabilities, type IpamCapabilities } from '../../services/ipamApi';

export function IpamHealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [caps, setCaps] = useState<IpamCapabilities | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        const online = health.status === 'ok' && health.db !== 'error';
        setOk(online);
        setDetail(online ? null : health.error ?? 'IPAM health check failed');
      } catch (e) {
        if (!cancelled) {
          setOk(false);
          setDetail(e instanceof Error ? e.message : 'IPAM unreachable');
        }
      }
    }

    void check();
    void fetchCapabilities()
      .then((capabilities) => {
        if (!cancelled) setCaps(capabilities);
      })
      .catch(() => {
        /* capabilities are optional for the online badge */
      });

    const t = window.setInterval(() => void check(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (ok === null) {
    return <span className="text-[10px] text-slate-500">Checking API…</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]">
      <span
        title={detail ?? undefined}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${
          ok
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
            : 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        IPAM API {ok ? 'online' : 'offline'}
      </span>
      {!ok && detail ? (
        <span className="max-w-xs truncate text-rose-300/90" title={detail}>
          {detail}
        </span>
      ) : null}
      {caps ? (
        <span className="text-slate-500" title={caps.endpoints?.join('\n')}>
          v{caps.apiVersion} · {caps.ipv6 ? 'IPv4 + IPv6' : 'IPv4 only'}
        </span>
      ) : null}
    </div>
  );
}
