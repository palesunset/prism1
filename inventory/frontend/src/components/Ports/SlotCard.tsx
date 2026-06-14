import { Trash2 } from 'lucide-react';
import type { Slot, Port } from '@/types';
import { PortGrid } from './PortGrid';

export function SlotCard({
  slot,
  onPortClick,
  onDeleteSlot,
}: {
  slot: Slot;
  onPortClick: (p: Port) => void;
  onDeleteSlot: (slotId: string) => void;
}) {
  const ports = slot.ports || [];
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">{slot.slot_name}</h4>
          <p className="text-xs text-slate-500">{ports.length} ports</p>
        </div>
        <button
          type="button"
          onClick={() => onDeleteSlot(slot.id)}
          className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          aria-label="Delete slot"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <PortGrid ports={ports} onPortClick={onPortClick} />
    </div>
  );
}
