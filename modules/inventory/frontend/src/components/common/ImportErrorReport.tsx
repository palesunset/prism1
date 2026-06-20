import { Download } from 'lucide-react';
import type { ImportResult } from '@/types';
import { ScrollRegion } from '@/components/common/ScrollRegion';

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadErrorReport(errors: ImportResult['errors']) {
  const header = 'Line,PLAID,Site Name,Error';
  const lines = errors.map((e) =>
    [e.line, e.plaid ?? '', e.site_name ?? '', e.message].map((c) => escapeCsv(String(c))).join(',')
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportErrorReport({ result }: { result: ImportResult }) {
  if (!result.errors.length) return null;

  return (
    <div
      className="mt-4 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
          Skipped rows ({result.errors.length})
        </h3>
        <button
          type="button"
          onClick={() => downloadErrorReport(result.errors)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:opacity-90"
          style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
        >
          <Download className="h-3.5 w-3.5" />
          Download report
        </button>
      </div>
      <p className="mb-2 text-xs" style={{ color: 'var(--color-muted)' }}>
        Line numbers match your CSV file (row 1 is the header; first data row is line 2).
      </p>
      <ScrollRegion className="max-h-56 rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead
            className="sticky top-0"
            style={{ background: 'var(--panel)', color: 'var(--color-subheader)' }}
          >
            <tr>
              <th className="px-2 py-1.5 font-medium">Line</th>
              <th className="px-2 py-1.5 font-medium">PLAID</th>
              <th className="px-2 py-1.5 font-medium">Site</th>
              <th className="px-2 py-1.5 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {result.errors.map((e, i) => (
              <tr key={`${e.line}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-2 py-1.5 font-mono">{e.line}</td>
                <td className="px-2 py-1.5 font-mono">{e.plaid || '—'}</td>
                <td className="px-2 py-1.5">{e.site_name || '—'}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--red)' }}>
                  {e.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
