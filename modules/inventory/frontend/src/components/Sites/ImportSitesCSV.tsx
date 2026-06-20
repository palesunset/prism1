import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ImportErrorReport } from '@/components/common/ImportErrorReport';
import { useToast } from '@/hooks/useToast';
import { importCombinedCsv } from '@/services/api';
import type { ImportResult } from '@/types';

export function ImportSitesCSV({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** Refresh lists after import; modal stays open when rows were skipped. */
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) {
      setLastResult(null);
    }
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLastResult(null);
    try {
      const res = await importCombinedCsv(file);
      setLastResult(res);
      onImported();

      const sites = res.sites_added ?? 0;
      const equip = res.equipment_added ?? 0;
      const msg = `${sites} site(s) added, ${equip} equipment added${res.skipped ? `, ${res.skipped} row(s) skipped` : ''}`;

      if (res.errors.length) {
        const first = res.errors[0];
        showToast(
          `${res.skipped} row(s) skipped — see line ${first.line}: ${first.message}`,
          sites || equip ? 'success' : 'error'
        );
      } else if (sites || equip) {
        showToast(msg, 'success');
        onClose();
      } else {
        showToast('Import complete', 'success');
        onClose();
      }
    } catch (err: unknown) {
      const m =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Import failed';
      showToast(m || 'Import failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const summary =
    lastResult &&
    `${lastResult.sites_added ?? 0} site(s) added, ${lastResult.equipment_added ?? 0} equipment added${
      lastResult.skipped ? `, ${lastResult.skipped} row(s) skipped` : ''
    }`;

  return (
    <Modal open={open} title="Bulk upload sites + equipment" onClose={onClose} wide>
      <p className="mb-3 text-sm" style={{ color: 'var(--color-subheader)' }}>
        One CSV with site and equipment columns. Sites are matched by <strong>PLAID</strong> (created once, then
        reused). Only <strong>PLAID</strong> is required per row — Site Name, Region, Territory, Address, Latitude,
        Longitude, and all equipment fields may be left blank and filled in later in the app.
      </p>
      <div className="mb-4 space-y-1 text-xs" style={{ color: 'var(--color-muted)' }}>
        <p>
          <strong style={{ color: 'var(--fg)' }}>Site (optional except PLAID):</strong> Site Name, PLAID, Region,
          Territory, Address, Latitude, Longitude
        </p>
        <p>
          <strong style={{ color: 'var(--fg)' }}>Equipment (all optional):</strong> Vendor, Network Element, Model,
          Serial Number, Router Type, IP Address, Software Version, Descriptor Version, End of Life, Status, Total
          Chassis Slot (equipment imports only when Vendor, Model, and Serial Number are all present)
        </p>
        <p>Save Excel as CSV (.csv) before uploading. Status accepts Active, Decommissioned, Decom, etc.</p>
        <p>
          International sites: use Region <strong>ITL</strong> or <strong>INTERNATIONAL</strong> (mapped automatically).
          Quote address fields that contain commas.
        </p>
      </div>
      <a
        href="/sample-data/combined_import_template.csv"
        download
        className="text-sm hover:underline"
        style={{ color: 'var(--red)' }}
      >
        Download combined template
      </a>
      <div className="mt-4">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center" style={{ borderColor: 'var(--border)' }}>
          <Upload className="mx-auto h-8 w-8" style={{ color: 'var(--color-muted)' }} />
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
      {summary && (
        <p className="mt-4 text-sm font-medium" style={{ color: 'var(--fg)' }}>
          {summary}
        </p>
      )}
      {lastResult && <ImportErrorReport result={lastResult} />}
      {lastResult?.errors.length ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--red)' }}
          >
            Done
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
