import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSite, useSiteMutations } from '@/hooks/useSites';
import { useEquipmentMutations } from '@/hooks/useEquipment';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { SiteForm } from './SiteForm';
import { EquipmentList } from '@/components/Equipment/EquipmentList';
import { EquipmentForm } from '@/components/Equipment/EquipmentForm';
import { ImportCSV } from '@/components/Equipment/ImportCSV';
import { UtilizationBar } from '@/components/Equipment/UtilizationBar';
import { SitePDFReportButton } from '@/components/Reports/PDFReportButton';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';
import { downloadSiteExportCsv } from '@/services/api';
import type { Equipment, Site } from '@/types';
import { formatLatLngPair } from '@/utils/coordinates';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DetailMeta, DetailMetaInlineLabel, DetailMetaLine } from '../common/DetailMeta';
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter';

export function SiteDetail({ siteId }: { siteId: string }) {
  const navigate = useNavigate();
  const root = useInventoryRoot();
  const qc = useQueryClient();
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [routerTypeFilter, setRouterTypeFilter] = useState<string[]>([]);
  // Backend vendor-scoped stats support only a single vendor; multi-select is applied client-side to the equipment list.
  const vendorParam = vendorFilter.length === 1 ? vendorFilter[0] : '';
  const { data, isLoading, error } = useSite(siteId, vendorParam);
  const { update, remove } = useSiteMutations();
  const { create, update: updateEq, remove: removeEq } = useEquipmentMutations(siteId);
  const { showToast } = useToast();

  const [siteModal, setSiteModal] = useState(false);
  const [eqModal, setEqModal] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmSiteDel, setConfirmSiteDel] = useState(false);
  const [confirmEqDel, setConfirmEqDel] = useState<Equipment | null>(null);

  const equipment = data?.equipment ?? [];
  const vendors = useMemo(
    () =>
      [...new Set(equipment.map((e) => String(e.vendor || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [equipment]
  );
  const routerTypes = useMemo(
    () =>
      [...new Set(equipment.map((e) => String(e.router_type || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [equipment]
  );
  const filteredEquipment = useMemo(() => {
    const hasVendors = vendorFilter.length > 0;
    const hasRouterTypes = routerTypeFilter.length > 0;
    if (!hasVendors && !hasRouterTypes) return equipment;
    const vSet = hasVendors ? new Set(vendorFilter.map((x) => x.trim().toLowerCase()).filter(Boolean)) : null;
    const rtSet = hasRouterTypes ? new Set(routerTypeFilter.map((x) => x.trim()).filter(Boolean)) : null;
    return equipment.filter((e) => {
      if (vSet && !vSet.has(String(e.vendor || '').trim().toLowerCase())) return false;
      if (rtSet && !rtSet.has(String(e.router_type || '').trim())) return false;
      return true;
    });
  }, [equipment, vendorFilter, routerTypeFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-red-600">Failed to load site.</p>;
  }

  const { site, summary } = data;

  async function saveSite(values: Partial<Site>) {
    try {
      await update.mutateAsync({ id: siteId, body: values });
      showToast('Site updated', 'success');
      setSiteModal(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Update failed';
      showToast(msg || 'Update failed', 'error');
    }
  }

  async function saveEquipment(values: {
    vendor: string;
    network_element: string;
    model: string;
    serial_number: string;
    router_type: string | null;
    ip_address: string | null;
    software_version: string | null;
    descriptor_version: string | null;
    end_of_life: string | null;
    status: string;
    rack_position: string | null;
    chassis_slot_count: number | null;
  }) {
    try {
      if (editingEq) {
        await updateEq.mutateAsync({ id: editingEq.id, body: values });
        showToast('Equipment updated', 'success');
      } else {
        await create.mutateAsync({ ...values, site_id: siteId });
        showToast('Equipment added', 'success');
      }
      setEqModal(false);
      setEditingEq(null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Failed to save equipment';
      showToast(msg || 'Failed to save equipment', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to={invPath(root, 'sites')} className="text-sm text-sky-600 hover:underline dark:text-sky-400">
            ← Sites
          </Link>
          <h1 className="mt-2 text-xl font-bold sm:text-2xl">{site.name}</h1>
          <DetailMeta>
            {site.plaid && site.plaid !== site.name ? (
              <DetailMetaLine label="PLAID" mono>
                {site.plaid}
              </DetailMetaLine>
            ) : null}
            <div>
              <DetailMetaInlineLabel>Region:</DetailMetaInlineLabel> {site.region}
              <DetailMetaInlineLabel> · Territory:</DetailMetaInlineLabel> {site.area}
            </div>
            {site.equipment_router_types ? (
              <DetailMetaLine label="Router types">{site.equipment_router_types}</DetailMetaLine>
            ) : null}
            {site.address ? <DetailMetaLine label="Address">{site.address}</DetailMetaLine> : null}
            {site.lat != null && site.lng != null ? (
              <DetailMetaLine label="Coordinates" mono>
                {formatLatLngPair(site.lat, site.lng)}
              </DetailMetaLine>
            ) : null}
          </DetailMeta>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSiteModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <Pencil className="h-4 w-4" />
            Edit site
          </button>
          <button
            type="button"
            onClick={() => setConfirmSiteDel(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <h2 className="text-lg font-semibold">Site utilization</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Equipment: {summary.equipment_count} · Line slots: {summary.line_slot_count} · Chassis bays:{' '}
          {summary.slot_count} · Ports: {summary.total_ports}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Chassis bays are physical bays in the chassis; line slots are line-card slots where ports are defined.
        </p>
        <div className="mt-3 flex flex-col gap-6 sm:max-w-2xl">
          <div className="w-full">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Chassis slot utilization: {summary.utilized_slot_count}/{summary.slot_count} (
              {summary.slot_utilization_pct.toFixed(1)}%)
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Free chassis slots: {summary.free_slot_count}
            </p>
            <div className="mt-2 w-full">
              <UtilizationBar pct={summary.slot_utilization_pct} />
            </div>
          </div>
          <div className="w-full">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Port utilization: {summary.utilized_ports}/{summary.total_ports} ({summary.utilization_pct.toFixed(1)}%)
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Free ports: {summary.free_ports}</p>
            <div className="mt-2 w-full">
              <UtilizationBar pct={summary.utilization_pct} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Equipment</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingEq(null);
                setEqModal(true);
              }}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Add equipment
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void downloadSiteExportCsv(siteId, vendorParam, `site-${site.plaid}-equipment.csv`).catch(() =>
                  showToast('Export failed', 'error')
                );
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <SitePDFReportButton site={site} equipment={filteredEquipment} />
          </div>
        </div>
        {(vendors.length > 0 || routerTypes.length > 0) && (
          <div className="flex flex-wrap items-end gap-3">
            {vendors.length > 0 && (
              <div className="min-w-[240px]">
                <MultiSelectFilter
                  label="Vendor"
                  options={vendors}
                  value={vendorFilter}
                  onChange={setVendorFilter}
                  placeholder="All vendors"
                />
              </div>
            )}
            {routerTypes.length > 0 && (
              <div className="min-w-[220px]">
                <MultiSelectFilter
                  label="Router Type"
                  options={routerTypes}
                  value={routerTypeFilter}
                  onChange={setRouterTypeFilter}
                  placeholder="All router types"
                />
              </div>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold">{filteredEquipment.length}</span> of{' '}
              <span className="font-semibold">{equipment.length}</span>
            </div>
          </div>
        )}
        <EquipmentList
          items={filteredEquipment}
          onEdit={(eq) => {
            setEditingEq(eq);
            setEqModal(true);
          }}
          onDelete={(eq) => setConfirmEqDel(eq)}
        />
      </section>

      <Modal open={siteModal} title="Edit site" onClose={() => setSiteModal(false)}>
        <SiteForm
          syncToken={site.id}
          initial={site}
          onSubmit={saveSite}
          onCancel={() => setSiteModal(false)}
          submitLabel="Save"
        />
      </Modal>

      <Modal
        open={eqModal}
        title={editingEq ? 'Edit equipment' : 'Add equipment'}
        onClose={() => {
          setEqModal(false);
          setEditingEq(null);
        }}
      >
        <EquipmentForm
          initial={editingEq}
          onSubmit={(v) => saveEquipment(v)}
          onCancel={() => {
            setEqModal(false);
            setEditingEq(null);
          }}
          submitLabel={editingEq ? 'Save' : 'Add'}
        />
      </Modal>

      <ImportCSV
        siteId={siteId}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ['site', siteId] });
          qc.invalidateQueries({ queryKey: ['sites'] });
          qc.invalidateQueries({ queryKey: ['summary'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />

      <ConfirmDialog
        open={confirmSiteDel}
        title="Delete site?"
        message="This will remove all equipment, slots, and ports for this site. This cannot be undone."
        confirmLabel="Delete site"
        danger
        onCancel={() => setConfirmSiteDel(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(siteId);
            showToast('Site deleted', 'success');
            navigate(invPath(root, 'sites'));
          } catch {
            showToast('Failed to delete site', 'error');
          }
          setConfirmSiteDel(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmEqDel)}
        title="Delete equipment?"
        message="All slots and ports for this equipment will be removed."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmEqDel(null)}
        onConfirm={async () => {
          if (!confirmEqDel) return;
          try {
            await removeEq.mutateAsync(confirmEqDel.id);
            showToast('Equipment deleted', 'success');
          } catch {
            showToast('Failed to delete', 'error');
          }
          setConfirmEqDel(null);
        }}
      />
    </div>
  );
}
