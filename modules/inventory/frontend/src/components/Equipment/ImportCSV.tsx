import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { importEquipmentCsv } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/common/Modal';

export function ImportCSV({
  siteId,
  open,
  onClose,
  onDone,
}: {
  siteId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const [summary, setSummary] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setSummary(null);
    try {
      const res = await importEquipmentCsv(siteId, file);
      const msg = `${res.added} equipment added, ${res.skipped} skipped`;
      setSummary(
        res.errors.length
          ? `${msg}. Errors: ${res.errors.slice(0, 5).map((x) => `line ${x.line}: ${x.message}`).join('; ')}${res.errors.length > 5 ? '…' : ''}`
          : msg
      );
      if (res.added) showToast(msg, 'success');
      if (res.skipped) showToast(`${res.skipped} rows skipped`, res.added ? 'success' : 'error');
      onDone();
    } catch (err: unknown) {
      const m = err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
        : 'Import failed';
      showToast(m || 'Import failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Modal open={open} title="Import equipment (CSV)" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        All columns are optional. Equipment is imported only when Vendor, Model, and Serial Number are all present —
        leave other fields blank and edit them later in the app. Columns: Vendor, Network Element (defaults to Model),
        Model, Serial Number, Router Type, IP Address, Software Version, Descriptor Version, End of Life, Status, Rack
        Position. Optional chassis: Total Chassis Slot plus Utilized Chassis Count, Utilized Chassis Slot, or Chassis
        Bays In Use. Optional ports: Slot Name, Total Port Slot, plus Utilized Port Count, Utilized Port Slot, or Ports
        In Use. Port Descriptions: pipe-separated per port. Serial numbers must be unique within this site.
      </p>
      <a
        href="/sample-data/equipment_import_template.csv"
        download
        className="text-sm text-sky-600 hover:underline dark:text-sky-400"
      >
        Download sample template
      </a>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Need to bulk-create sites? Use <a className="text-sky-600 hover:underline dark:text-sky-400" href="/sample-data/site_import_template.csv" download>site import template</a>.
      </p>
      <div className="mt-4">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-600">
          <Upload className="mx-auto h-8 w-8 text-slate-400" />
          <span className="text-sm">{busy ? 'Importing…' : 'Choose CSV file'}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
        </label>
      </div>
      {summary && <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">{summary}</p>}
    </Modal>
  );
}
