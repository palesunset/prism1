import type { Equipment } from '@/types';

/** Primary display / link label for equipment rows and detail headers. */
export function equipmentNetworkElementLabel(eq: Pick<Equipment, 'network_element' | 'model'>): string {
  const ne = eq.network_element != null ? String(eq.network_element).trim() : '';
  if (ne) return ne;
  return (eq.model || '').trim() || '—';
}

export function formatEquipmentLine(value: string | null | undefined): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s !== '' ? s : '—';
}

/** Line-slot list order: numeric-aware (e.g. Slot 2 before Slot 10), case-insensitive. */
export function compareSlotDisplayOrder(aName: string | undefined, bName: string | undefined): number {
  const sa = String(aName ?? '').trim();
  const sb = String(bName ?? '').trim();
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}
