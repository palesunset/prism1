import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import {
  downloadIpamFile,
  exportJson,
  fetchBackupBundle,
  restoreBackupBundle,
  type IpamBackupBundle,
} from '../../services/ipamApi';
import { useIpamStore } from '../../store/useIpamStore';

export function IpamBackupRestorePanel() {
  const loadInitial = useIpamStore((s) => s.loadInitial);
  const loadRecords = useIpamStore((s) => s.loadRecords);
  const loadAudit = useIpamStore((s) => s.loadAudit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadBundle() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const bundle = await fetchBackupBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ipam-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Exported ${bundle.records.length} records, ${bundle.workflows?.length ?? 0} workflows.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup export failed');
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile(file: File) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as IpamBackupBundle;
      if (!window.confirm(`Restore ${bundle.records?.length ?? 0} records? This replaces all current IPAM data.`)) {
        return;
      }
      const result = await restoreBackupBundle(bundle);
      setMsg(
        `Restored ${result.restored} records` +
          (result.workflows != null ? `, ${result.workflows} workflows` : '') +
          '.',
      );
      await loadInitial();
      await loadRecords();
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <p className="mb-1 text-sm font-medium text-slate-300">Backup & Restore</p>
      <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
        Full JSON bundle includes records, workflows, history, audit, and settings. Restore replaces all data.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadBundle()}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download Backup
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
          <Upload className="h-3.5 w-3.5" />
          Restore Backup
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void restoreFromFile(file);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportJson().then((d) => setMsg(`Quick export: ${d.records.length} records.`))}
          className="rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15 disabled:opacity-50"
        >
          Quick Export
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadIpamFile('/export/csv', 'ipam-export.csv')}
          className="rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15 disabled:opacity-50"
        >
          CSV Export
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs text-emerald-300">{msg}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
