import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import {
  fetchHealth,
  getIpamAdminKey,
  getIpamApiKey,
  setIpamAdminKey,
  setIpamApiKey,
  type IpamHealth,
} from '../../services/ipamApi';

export function IpamApiKeysPanel() {
  const [apiKey, setApiKey] = useState(getIpamApiKey());
  const [adminKey, setAdminKey] = useState(getIpamAdminKey());
  const [health, setHealth] = useState<IpamHealth | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refreshHealth() {
    try {
      const h = await fetchHealth();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  }

  function save() {
    setIpamApiKey(apiKey.trim() || null);
    setIpamAdminKey(adminKey.trim() || null);
    setMsg('Keys saved to browser storage.');
    void refreshHealth();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-indigo-400" />
        <p className="text-sm font-medium text-slate-300">API Keys</p>
        {health?.authRequired ? (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-200">Auth required</span>
        ) : null}
        {health?.adminRequired ? (
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-200">Admin routes protected</span>
        ) : null}
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
        Optional local keys for authenticated IPAM deployments. Stored in browser localStorage only.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-slate-500">API Key (Bearer)</span>
          <input
            type="password"
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="IPAM_API_KEY"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase text-slate-500">Admin Key</span>
          <input
            type="password"
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="IPAM_ADMIN_KEY"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Save Keys
        </button>
        <button
          type="button"
          onClick={() => void refreshHealth()}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/15"
        >
          Test Connection
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs text-emerald-300">{msg}</p> : null}
    </div>
  );
}
