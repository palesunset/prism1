import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import type { Equipment } from '@/types';
import { UtilizationBar } from './UtilizationBar';
import { equipmentNetworkElementLabel, formatEquipmentLine } from '@/utils/equipmentDisplay';
import { DetailMeta, DetailMetaLine } from '../common/DetailMeta';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

export function EquipmentList({
  items,
  onEdit,
  onDelete,
}: {
  items: Equipment[];
  onEdit: (e: Equipment) => void;
  onDelete: (e: Equipment) => void;
}) {
  const root = useInventoryRoot();
  if (!items.length) {
    return (
      <p className="text-sm text-slate-500">No equipment yet. Add or import below.</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
      {items.map((eq) => {
        const ne = equipmentNetworkElementLabel(eq);
        return (
          <li key={eq.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <DetailMeta className="mt-1">
                <DetailMetaLine label="Network Element">
                  <Link
                    to={invPath(root, 'equipment', eq.id)}
                    className="font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    {ne}
                  </Link>
                </DetailMetaLine>
                <DetailMetaLine label="IP Address" mono>
                  {formatEquipmentLine(eq.ip_address)}
                </DetailMetaLine>
                <DetailMetaLine label="Router Type">{formatEquipmentLine(eq.router_type)}</DetailMetaLine>
                <DetailMetaLine label="Software Version">{formatEquipmentLine(eq.software_version)}</DetailMetaLine>
                <DetailMetaLine label="Descriptor Version">{formatEquipmentLine(eq.descriptor_version)}</DetailMetaLine>
                <DetailMetaLine label="Model">{eq.model}</DetailMetaLine>
                <DetailMetaLine label="Serial Number" mono>
                  {eq.serial_number}
                </DetailMetaLine>
                <DetailMetaLine label="End of Life">{formatEquipmentLine(eq.end_of_life)}</DetailMetaLine>
                <DetailMetaLine label="Status">{eq.status}</DetailMetaLine>
              </DetailMeta>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2 sm:items-end">
              <UtilizationBar thin pct={eq.utilization_pct ?? 0} className="w-full" />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(eq)}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Edit equipment"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(eq)}
                  className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label="Delete equipment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
