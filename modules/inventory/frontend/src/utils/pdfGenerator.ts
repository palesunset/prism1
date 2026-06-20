import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Site, Equipment, SiteSummaryRow } from '@/types';
import { equipmentNetworkElementLabel } from '@/utils/equipmentDisplay';
import type { DashboardBundle } from '@/types/dashboard';

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export interface EquipmentPdfRow {
  networkElement: string;
  vendor: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  softwareVersion: string;
  descriptorVersion: string;
  status: string;
  rackPosition: string;
  totalPorts: number;
  utilizedPorts: number;
  freePorts: number;
}

function utilizationBarData(usedPct: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(10, 12, 180, 16);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(10, 12, (180 * Math.min(100, Math.max(0, usedPct))) / 100, 16);
  ctx.fillStyle = '#0f172a';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${usedPct.toFixed(1)}% utilized`, 12, 10);
  return canvas.toDataURL('image/png');
}

function mapEquipmentToPdfRows(list: Equipment[]): EquipmentPdfRow[] {
  return list.map((eq) => {
    const total = eq.total_ports ?? 0;
    const used = eq.utilized_ports ?? 0;
    return {
      networkElement: equipmentNetworkElementLabel(eq),
      vendor: eq.vendor,
      model: eq.model,
      serialNumber: eq.serial_number,
      ipAddress:
        eq.ip_address != null && String(eq.ip_address).trim() !== '' ? String(eq.ip_address) : '—',
      softwareVersion:
        eq.software_version != null && String(eq.software_version).trim() !== ''
          ? String(eq.software_version)
          : '—',
      descriptorVersion:
        eq.descriptor_version != null && String(eq.descriptor_version).trim() !== ''
          ? String(eq.descriptor_version)
          : '—',
      status: eq.status,
      rackPosition: eq.rack_position || '-',
      totalPorts: total,
      utilizedPorts: used,
      freePorts: total - used,
    };
  });
}

export function generateSiteReportPdf(site: Site, equipmentList: Equipment[]) {
  const rows = mapEquipmentToPdfRows(equipmentList);
  const totalPorts = rows.reduce((s, r) => s + r.totalPorts, 0);
  const usedPorts = rows.reduce((s, r) => s + r.utilizedPorts, 0);
  const pct = totalPorts > 0 ? (usedPorts / totalPorts) * 100 : 0;

  const doc = new jsPDF();
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('[Company logo placeholder]', 14, 12);
  doc.setTextColor(0);
  doc.setFontSize(18);
  doc.text(`Site Report: ${site.name}`, 14, 22);
  doc.setFontSize(11);
  doc.text(
    `PLAID: ${site.plaid} | Territory: ${site.area} | Region: ${site.region}`,
    14,
    30
  );
  doc.text(site.address || '—', 14, 36);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 42);

  doc.setFontSize(10);
  doc.text(
    `Equipment: ${rows.length} | Ports: ${totalPorts} | Utilized: ${usedPorts} (${pct.toFixed(1)}%)`,
    14,
    50
  );

  try {
    const img = utilizationBarData(pct);
    if (img) doc.addImage(img, 'PNG', 14, 54, 60, 12);
  } catch {
    /* optional chart */
  }

  autoTable(doc, {
    startY: 70,
    head: [['Network Element', 'Vendor', 'Model', 'Serial', 'IP', 'Software', 'Descriptor', 'Status', 'Rack', 'Ports (used/total)']],
    body: rows.map((r) => [
      r.networkElement,
      r.vendor,
      r.model,
      r.serialNumber,
      r.ipAddress,
      r.softwareVersion,
      r.descriptorVersion,
      r.status,
      r.rackPosition,
      `${r.utilizedPorts}/${r.totalPorts} (${r.freePorts} free)`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  doc.save(`site-report-${site.plaid}.pdf`);
}

export function generateFullReportPdf(sites: SiteSummaryRow[], equipmentBySite: Map<string, Equipment[]>) {
  const doc = new jsPDF() as JsPDFWithAutoTable;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('[Company logo placeholder]', 14, 12);
  doc.setTextColor(0);
  doc.setFontSize(18);
  doc.text('Global Inventory Report', 14, 22);
  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  let totalEq = 0;
  let totalPorts = 0;
  let usedPorts = 0;
  sites.forEach((s) => {
    const eqs = equipmentBySite.get(s.id) || [];
    totalEq += eqs.length;
    eqs.forEach((e) => {
      totalPorts += e.total_ports ?? 0;
      usedPorts += e.utilized_ports ?? 0;
    });
  });
  const pct = totalPorts > 0 ? (usedPorts / totalPorts) * 100 : 0;
  doc.text(
    `Sites: ${sites.length} | Equipment: ${totalEq} | Ports: ${totalPorts} | Utilized: ${usedPorts} (${pct.toFixed(1)}%)`,
    14,
    38
  );

  try {
    const img = utilizationBarData(pct);
    if (img) doc.addImage(img, 'PNG', 14, 42, 60, 12);
  } catch {
    /* optional */
  }

  autoTable(doc, {
    startY: 58,
    head: [['Site', 'PLAID', 'Territory', 'Region', 'Eq', 'Util %']],
    body: sites.map((s) => [
      s.name,
      s.plaid,
      s.area,
      s.region,
      String(s.equipment_count),
      `${s.utilization_pct.toFixed(1)}%`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  let y = doc.lastAutoTable?.finalY ?? 80;
  y += 10;

  for (const site of sites) {
    const eqs = equipmentBySite.get(site.id) || [];
    if (!eqs.length) continue;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.text(`${site.name} (${site.plaid})`, 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Network Element', 'Vendor', 'Model', 'Serial', 'IP', 'Software', 'Descriptor', 'Status', 'Ports (used/total)']],
      body: mapEquipmentToPdfRows(eqs).map((r) => [
        r.networkElement,
        r.vendor,
        r.model,
        r.serialNumber,
        r.ipAddress,
        r.softwareVersion,
        r.descriptorVersion,
        r.status,
        `${r.utilizedPorts}/${r.totalPorts}`,
      ]),
      styles: { fontSize: 7 },
      margin: { left: 14 },
    });
    y = doc.lastAutoTable?.finalY ?? y;
    y += 8;
  }

  doc.save(`inventory-full-report.pdf`);
}

/** KPI + sites overview + tabular chart data (charts themselves are not rasterized). */
export function generateDashboardPdf(bundle: DashboardBundle, filterNote: string) {
  const doc = new jsPDF() as JsPDFWithAutoTable;
  const k = bundle.kpis;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('[Company logo placeholder]', 14, 12);
  doc.setTextColor(0);
  doc.setFontSize(18);
  doc.text('Network Inventory Dashboard', 14, 22);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.setFontSize(9);
  doc.text(filterNote || 'Filters: none', 14, 36);

  try {
    const img = utilizationBarData(k.utilizationPercent);
    if (img) doc.addImage(img, 'PNG', 14, 40, 60, 12);
  } catch {
    /* optional */
  }

  autoTable(doc, {
    startY: 56,
    head: [['Metric', 'Value']],
    body: [
      ['Total sites', String(k.totalSites)],
      ['Total equipment', String(k.totalEquipment)],
      ['Total ports', String(k.totalPorts)],
      ['Utilized ports', String(k.utilizedPorts)],
      ['Overall utilization %', k.utilizationPercent.toFixed(1)],
      ['Active equipment', String(k.activeEquipment)],
      ['EOL this year', String(k.eolThisYear)],
      [
        'Equipment added (selected range)',
        k.equipmentAddedInRange != null ? String(k.equipmentAddedInRange) : '—',
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [79, 70, 229] },
  });

  const y1 = doc.lastAutoTable?.finalY ?? 120;
  doc.setFontSize(11);
  doc.text('Vendor distribution', 14, y1 + 10);
  autoTable(doc, {
    startY: y1 + 14,
    head: [['Vendor', 'Count', '%']],
    body: bundle.vendorDistribution.vendors.map((v) => [v.name, String(v.count), v.percent.toFixed(1)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  const y2 = doc.lastAutoTable?.finalY ?? y1 + 40;
  doc.text('Status distribution', 14, y2 + 10);
  autoTable(doc, {
    startY: y2 + 14,
    head: [['Status', 'Count']],
    body: bundle.statusDistribution.statuses.map((s) => [s.status, String(s.count)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  const y3 = doc.lastAutoTable?.finalY ?? y2 + 40;
  if (y3 > 240) {
    doc.addPage();
  }
  const yStart = y3 > 240 ? 20 : y3 + 10;
  doc.text('Sites overview', 14, yStart);
  autoTable(doc, {
    startY: yStart + 4,
    head: [['Site', 'PLAID', 'Territory', 'Region', 'Eq', 'Ports', 'Util %', 'Status']],
    body: bundle.sitesOverview.sites.map((s) => [
      s.name,
      s.plaid,
      s.area,
      s.region,
      String(s.equipment_count),
      String(s.total_ports),
      `${s.utilization_pct.toFixed(1)}%`,
      s.operational_status,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  const y4 = doc.lastAutoTable?.finalY ?? yStart + 40;
  if (y4 > 230) doc.addPage();
  const yAct = y4 > 230 ? 20 : y4 + 10;
  doc.text('Recent activity (sample)', 14, yAct);
  autoTable(doc, {
    startY: yAct + 4,
    head: [['When', 'Site', 'Description']],
    body: bundle.recentActivity.events.slice(0, 15).map((e) => [
      String(e.at),
      e.siteName,
      e.description,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  doc.save('network-inventory-dashboard.pdf');
}
