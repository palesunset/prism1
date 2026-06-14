import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, ShieldAlert, XCircle } from 'lucide-react';
import type { IpamIntegrityAudit, IpamIntegrityStatus } from '../../services/ipamApi';
import { integrityReportUrl } from '../../services/ipamApi';

export function IntegrityBadge(props: { status: IpamIntegrityStatus }) {
  if (props.status === 'conflict') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ring-1 bg-rose-500/20 text-rose-200 ring-rose-500/30">
        <XCircle className="h-3 w-3" />
        Conflict
      </span>
    );
  }
  if (props.status === 'warning') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ring-1 bg-amber-500/20 text-amber-200 ring-amber-500/30">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ring-1 bg-emerald-500/20 text-emerald-200 ring-emerald-500/30">
      <CheckCircle2 className="h-3 w-3" />
      Valid
    </span>
  );
}

export function IpamAuditPanel(props: { audit: IpamIntegrityAudit | null; loading?: boolean; onRescan: () => void }) {
  const { audit, loading } = props;

  if (loading && !audit) {
    return <p className="text-sm text-slate-500">Running integrity audit…</p>;
  }
  if (!audit) {
    return <p className="text-sm text-slate-500">No audit data available.</p>;
  }

  const scoreColor =
    audit.summary.healthScore >= 90 ? 'text-emerald-300' : audit.summary.healthScore >= 70 ? 'text-amber-300' : 'text-rose-300';

  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ShieldAlert className="h-4 w-4 text-indigo-400" />
          Intelligence layer · {new Date(audit.generatedAt).toLocaleString()}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onRescan}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Re-scan database
          </button>
          <a
            href={integrityReportUrl()}
            download
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
          >
            <Download className="h-3.5 w-3.5" />
            Download report
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
          <p className="text-[10px] uppercase text-slate-500">Total entries</p>
          <p className="text-xl font-semibold text-slate-100">{audit.summary.total}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
          <p className="text-[10px] uppercase text-slate-500">Valid</p>
          <p className="text-xl font-semibold text-emerald-300">{audit.summary.valid}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3">
          <p className="text-[10px] uppercase text-slate-500">Conflicts</p>
          <p className="text-xl font-semibold text-rose-300">{audit.summary.conflicts}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
          <p className="text-[10px] uppercase text-slate-500">Warnings</p>
          <p className="text-xl font-semibold text-amber-300">{audit.summary.warnings}</p>
        </div>
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/10 p-3">
          <p className="text-[10px] uppercase text-slate-500">Health score</p>
          <p className={clsx('text-xl font-semibold', scoreColor)}>{audit.summary.healthScore}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
          <p className="text-[10px] uppercase text-slate-500">Efficiency</p>
          <p className="text-xl font-semibold text-indigo-300">{audit.summary.efficiencyPercent}%</p>
        </div>
      </div>

      {audit.conflicts.length === 0 && audit.warnings.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <p className="text-base font-semibold text-emerald-200">IP integrity is all good</p>
          <p className="mt-1 text-sm text-slate-400">No conflicts or warnings detected in the registry.</p>
        </div>
      ) : null}

      {audit.conflicts.length > 0 ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-4">
          <p className="mb-3 text-sm font-medium text-rose-200">Conflicts ({audit.conflicts.length})</p>
          <ul className="space-y-2">
            {audit.conflicts.map((c) => (
              <li key={c.message} className="rounded-lg border border-rose-500/20 bg-gray-950/40 px-3 py-2 text-xs">
                <p className="font-mono text-rose-200">{c.addresses.join(' ↔ ')}</p>
                <p className="text-slate-300">{c.message}</p>
                {c.suggestion ? <p className="mt-1 text-slate-500">{c.suggestion}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {audit.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
          <p className="mb-3 text-sm font-medium text-amber-200">Warnings ({audit.warnings.length})</p>
          <ul className="space-y-2">
            {audit.warnings.map((w) => (
              <li key={w.message} className="rounded-lg border border-amber-500/20 bg-gray-950/40 px-3 py-2 text-xs">
                {w.address ? <p className="font-mono text-amber-200">{w.address}</p> : null}
                <p className="text-slate-300">{w.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
