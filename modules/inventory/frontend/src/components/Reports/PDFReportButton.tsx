import { FileDown } from 'lucide-react';
import { generateSiteReportPdf, generateFullReportPdf } from '@/utils/pdfGenerator';
import type { Site, Equipment, SiteSummaryRow } from '@/types';
import * as api from '@/services/api';

export function SitePDFReportButton({ site, equipment }: { site: Site; equipment: Equipment[] }) {
  return (
    <button
      type="button"
      onClick={() => generateSiteReportPdf(site, equipment)}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <FileDown className="h-4 w-4" />
      Download Site Report (PDF)
    </button>
  );
}

export function FullPDFReportButton({
  summaryRows,
  vendors,
}: {
  summaryRows: SiteSummaryRow[];
  /** When set, each site’s equipment list is limited to these vendors (OR). */
  vendors?: string[];
}) {
  return (
    <button
      type="button"
      onClick={async () => {
        const map = new Map<string, Equipment[]>();
        const vSet = new Set((vendors ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean));
        await Promise.all(
          summaryRows.map(async (s) => {
            const d = await api.fetchSite(s.id);
            const list =
              vSet.size > 0
                ? d.equipment.filter((e) => vSet.has(String(e.vendor || '').trim().toLowerCase()))
                : d.equipment;
            map.set(s.id, list);
          })
        );
        generateFullReportPdf(summaryRows, map);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <FileDown className="h-4 w-4" />
      Download Full Report (PDF)
    </button>
  );
}
