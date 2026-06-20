import type { IpamRecord, IpamRecordType, IpamStatus } from '../../services/ipamApi';

export type ImportRowError = {
  row?: number;
  address: string;
  error: string;
};

export function IpamImportReport(props: {
  title: string;
  createdCount: number;
  errors: ImportRowError[];
  onDismiss?: () => void;
}) {
  if (!props.errors.length && props.createdCount === 0) return null;

  const download = () => {
    const lines = ['row,address,error', ...props.errors.map((e) => `${e.row ?? ''},"${e.address.replace(/"/g, '""')}","${e.error.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ipam-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-amber-200">{props.title}</p>
          <p className="mt-1 text-slate-400">
            {props.createdCount} imported · {props.errors.length} failed
          </p>
        </div>
        <div className="flex gap-2">
          {props.errors.length > 0 ? (
            <button type="button" onClick={download} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5">
              Download errors
            </button>
          ) : null}
          {props.onDismiss ? (
            <button type="button" onClick={props.onDismiss} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5">
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
      {props.errors.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[10px] text-rose-200/90">
          {props.errors.slice(0, 50).map((e, i) => (
            <li key={`${e.row}-${e.address}-${i}`}>
              {e.row ? `Row ${e.row}: ` : ''}
              {e.address} — {e.error}
            </li>
          ))}
          {props.errors.length > 50 ? (
            <li className="text-slate-500">…and {props.errors.length - 50} more (download for full list)</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export const IPAM_EMPTY_FORM = {
  address: '',
  record_type: 'host' as IpamRecordType,
  status: 'used' as IpamStatus,
  project: '',
  vlan: '',
  location: '',
  description: '',
  hostname: '',
  mac_address: '',
  gateway: '',
  dhcp_scope: '',
  ptr_record: '',
  parent_subnet_id: '',
};
