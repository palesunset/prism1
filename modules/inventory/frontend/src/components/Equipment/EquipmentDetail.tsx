import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useEquipmentBays, useEquipmentDetail, useEquipmentMutations } from '@/hooks/useEquipment';
import { useSlotMutations } from '@/hooks/useSlots';
import { usePortMutations } from '@/hooks/usePorts';
import { useEquipmentBayMutations } from '@/hooks/useEquipmentBays';
import { useToast } from '@/hooks/useToast';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DetailMeta, DetailMetaLine } from '../common/DetailMeta';
import { UtilizationBar } from './UtilizationBar';
import { SlotCard } from '@/components/Ports/SlotCard';
import { PortEditModal } from '@/components/Ports/PortEditModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { Port } from '@/types';
import {
  compareSlotDisplayOrder,
  equipmentNetworkElementLabel,
  formatEquipmentLine,
} from '@/utils/equipmentDisplay';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

export function EquipmentDetail({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const root = useInventoryRoot();
  const { data, isLoading, error } = useEquipmentDetail(equipmentId);

  const sortedSlots = useMemo(() => {
    const list = data?.slots ?? [];
    return [...list].sort((a, b) => {
      const c = compareSlotDisplayOrder(a.slot_name, b.slot_name);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });
  }, [data?.slots]);

  const sortedSlotBreakdown = useMemo(() => {
    const list = data?.slot_breakdown ?? [];
    return [...list].sort((a, b) => {
      const c = compareSlotDisplayOrder(a.slot_name, b.slot_name);
      if (c !== 0) return c;
      return a.slot_id.localeCompare(b.slot_id);
    });
  }, [data?.slot_breakdown]);
  const { data: baysData } = useEquipmentBays(equipmentId);
  const siteId = data?.equipment.site_id ?? '';
  const { remove } = useEquipmentMutations(siteId);
  const { createSlot, deleteSlot } = useSlotMutations(equipmentId, siteId);
  const portMut = usePortMutations(equipmentId, siteId);
  const bayMut = useEquipmentBayMutations(equipmentId);
  const { showToast } = useToast();
  const [portEdit, setPortEdit] = useState<Port | null>(null);
  const [slotName, setSlotName] = useState('');
  const [totalPorts, setTotalPorts] = useState('24');
  const [resizeSlots, setResizeSlots] = useState('');
  const [chassisBaysOpen, setChassisBaysOpen] = useState(false);
  const [portBreakdownOpen, setPortBreakdownOpen] = useState(false);
  const [confirmDelEq, setConfirmDelEq] = useState(false);
  const [confirmDelSlot, setConfirmDelSlot] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-red-600">Failed to load equipment.</p>;
  }

  const { equipment, utilization } = data;
  const bays = baysData?.bays ?? [];
  const baySummary = baysData?.summary ?? { total: 0, utilized: 0, free: 0 };
  const chassisUtilPct = baySummary.total > 0 ? (baySummary.utilized / baySummary.total) * 100 : 0;

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(totalPorts, 10);
    if (!slotName.trim() || !Number.isInteger(n) || n < 1) {
      showToast('Slot name and valid total ports required', 'error');
      return;
    }
    try {
      await createSlot.mutateAsync({
        equipment_id: equipmentId,
        slot_name: slotName.trim(),
        total_ports: n,
      });
      showToast('Slot created', 'success');
      setSlotName('');
      setTotalPorts('24');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Failed to add slot';
      showToast(msg, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={invPath(root, 'sites', siteId)}
          className="text-sm text-sky-600 hover:underline dark:text-sky-400"
        >
          ← Back to site
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{equipmentNetworkElementLabel(equipment)}</h1>
        <DetailMeta className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailMetaLine label="IP Address" mono>
            {formatEquipmentLine(equipment.ip_address)}
          </DetailMetaLine>
          <DetailMetaLine label="Router Type">{formatEquipmentLine(equipment.router_type)}</DetailMetaLine>
          <DetailMetaLine label="Software Version">{formatEquipmentLine(equipment.software_version)}</DetailMetaLine>
          <DetailMetaLine label="Descriptor Version">{formatEquipmentLine(equipment.descriptor_version)}</DetailMetaLine>
          <DetailMetaLine label="Model">{equipment.model}</DetailMetaLine>
          <DetailMetaLine label="Serial Number" mono>
            {equipment.serial_number}
          </DetailMetaLine>
          <DetailMetaLine label="End of Life">{formatEquipmentLine(equipment.end_of_life)}</DetailMetaLine>
          <DetailMetaLine label="Status">{equipment.status}</DetailMetaLine>
          <DetailMetaLine label="Vendor">{equipment.vendor}</DetailMetaLine>
        </DetailMeta>
        <button
          type="button"
          onClick={() => setConfirmDelEq(true)}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
          Delete equipment
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Chassis utilization</h2>
          {bays.length > 0 && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
              onClick={() => setChassisBaysOpen((v) => !v)}
              aria-expanded={chassisBaysOpen}
            >
              {chassisBaysOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {chassisBaysOpen ? 'Hide' : 'Show'} chassis bays
            </button>
          )}
        </div>
        <div className="mt-3 w-full max-w-2xl">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Chassis slot utilization: {baySummary.utilized}/{baySummary.total} ({chassisUtilPct.toFixed(1)}%)
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Free chassis slots: {baySummary.free}</p>
          <div className="mt-2 w-full">
            <UtilizationBar pct={chassisUtilPct} />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Physical bays in the chassis; not the same as line slots and ports in &quot;Port utilization&quot; below.
        </p>
        {chassisBaysOpen && bays.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Chassis bays
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {bays.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 dark:border-slate-800"
                >
                  <span className="text-slate-800 dark:text-slate-100">
                    Slot {b.slot_index}
                    {b.label ? ` · ${b.label}` : ''}
                  </span>
                  <label className="flex shrink-0 items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className="text-xs">Utilized</span>
                    <input
                      type="checkbox"
                      className="rounded border-slate-400"
                      checked={b.is_utilized}
                      onChange={(e) => {
                        bayMut.updateBay.mutate(
                          { bayId: b.id, body: { is_utilized: e.target.checked } },
                          {
                            onError: () => showToast('Failed to update slot', 'error'),
                          }
                        );
                      }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {bays.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No chassis slots configured yet. Set &quot;Total Chassis Slots&quot; below.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(resizeSlots);
            if (!Number.isInteger(n) || n < 0 || n > 10000) {
              showToast('Total Chassis Slots must be an integer 0-10000', 'error');
              return;
            }
            bayMut.resize.mutate(n, {
              onSuccess: () => {
                showToast('Chassis slot count updated', 'success');
                setResizeSlots('');
              },
              onError: (err: unknown) => {
                const msg =
                  err && typeof err === 'object' && 'response' in err
                    ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
                    : 'Failed to resize chassis slots';
                showToast(msg, 'error');
              },
            });
          }}
          className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
        >
          <div className="min-w-0 flex-1 sm:flex-none">
            <label className="block text-xs font-medium">Total Chassis Slots</label>
            <input
              className="mt-2 w-full min-w-[5rem] max-w-[8rem] rounded-lg border border-slate-300 px-1.5 py-1 text-xs tabular-nums dark:border-slate-600 dark:bg-slate-900 sm:w-20"
              value={resizeSlots}
              onChange={(e) => setResizeSlots(e.target.value)}
              placeholder={String(equipment.chassis_slot_count ?? baySummary.total ?? 0)}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            Update
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Port utilization</h2>
          {sortedSlotBreakdown.length > 0 && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
              onClick={() => setPortBreakdownOpen((v) => !v)}
              aria-expanded={portBreakdownOpen}
            >
              {portBreakdownOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {portBreakdownOpen ? 'Hide' : 'Show'} by line slot
            </button>
          )}
        </div>
        <div className="mt-3 w-full max-w-2xl">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Port utilization: {utilization.utilized_ports}/{utilization.total_ports} (
            {utilization.utilization_pct.toFixed(1)}%)
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Free ports: {utilization.free_ports}</p>
          <div className="mt-2 w-full">
            <UtilizationBar pct={utilization.utilization_pct} />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Totals include every port row under all line slots below. Chassis bay utilization is separate and does not
          change this count. If the total looks high, check each line slot—imports often create an extra slot (for
          example &quot;Main&quot;) with its own port rows.
        </p>
        {portBreakdownOpen && sortedSlotBreakdown.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              By line slot
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {sortedSlotBreakdown.map((s) => (
                <li key={s.slot_id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 dark:border-slate-800">
                  <span>{s.slot_name}</span>
                  <span className="tabular-nums">
                    {s.utilized_ports}/{s.total_ports} ({s.utilization_pct.toFixed(1)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Slots & ports</h2>
        <form onSubmit={addSlot} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div>
            <label className="text-xs font-medium">Slot name / number</label>
            <input
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={slotName}
              onChange={(e) => setSlotName(e.target.value)}
              placeholder="Line Card 0"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Total ports</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={totalPorts}
              onChange={(e) => setTotalPorts(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
          >
            Add slot
          </button>
        </form>

        <div className="space-y-4">
          {sortedSlots.map((s) => (
            <SlotCard
              key={s.id}
              slot={s}
              onPortClick={(p) => setPortEdit(p)}
              onDeleteSlot={(id) => setConfirmDelSlot(id)}
            />
          ))}
          {!sortedSlots.length && (
            <p className="text-sm text-slate-500">No slots yet. Add a slot to create ports.</p>
          )}
        </div>
      </section>

      <PortEditModal
        port={portEdit}
        open={Boolean(portEdit)}
        onClose={() => setPortEdit(null)}
        onSave={(id, body) => {
          portMut.mutate(
            { portId: id, body },
            {
              onSuccess: () => showToast('Port updated', 'success'),
              onError: () => showToast('Failed to update port', 'error'),
            }
          );
        }}
      />

      <ConfirmDialog
        open={confirmDelEq}
        title="Delete equipment?"
        message="All slots and ports will be removed."
        danger
        onCancel={() => setConfirmDelEq(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(equipmentId);
            showToast('Equipment deleted', 'success');
            navigate(invPath(root, 'sites', siteId));
          } catch {
            showToast('Delete failed', 'error');
          }
          setConfirmDelEq(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelSlot)}
        title="Delete slot?"
        message="All ports in this slot will be removed."
        danger
        onCancel={() => setConfirmDelSlot(null)}
        onConfirm={async () => {
          if (!confirmDelSlot) return;
          try {
            await deleteSlot.mutateAsync(confirmDelSlot);
            showToast('Slot deleted', 'success');
          } catch {
            showToast('Failed to delete slot', 'error');
          }
          setConfirmDelSlot(null);
        }}
      />
    </div>
  );
}
