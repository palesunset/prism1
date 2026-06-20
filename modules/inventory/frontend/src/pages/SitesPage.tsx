import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSitesList,
  useSiteMutations,
  useEquipmentVendors,
  useSiteTerritories,
  useSiteRegions,
} from '@/hooks/useSites';
import { useToast } from '@/hooks/useToast';
import { SiteList } from '@/components/Sites/SiteList';
import { Modal } from '@/components/common/Modal';
import { SiteForm } from '@/components/Sites/SiteForm';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ScrollRegion } from '@/components/common/ScrollRegion';
import type { Site } from '@/types';
import { SiteFiltersBar } from '@/components/common/SiteFiltersBar';
import { territoryFilterOptions, regionFilterOptions } from '@/utils/siteFilters';
import { ImportSitesCSV } from '@/components/Sites/ImportSitesCSV';
import { useShallow } from 'zustand/react/shallow';
import { useMapFilterStore } from '@/store/mapFilterStore';

export function SitesPage() {
  const qc = useQueryClient();
  const {
    searchTerm,
    territoryFilter,
    regionFilter,
    setSearchTerm,
    setTerritoryFilter,
    setRegionFilter,
    resetFilters,
  } = useMapFilterStore(
    useShallow((s) => ({
      searchTerm: s.searchTerm,
      territoryFilter: s.territoryFilter,
      regionFilter: s.regionFilter,
      setSearchTerm: s.setSearchTerm,
      setTerritoryFilter: s.setTerritoryFilter,
      setRegionFilter: s.setRegionFilter,
      resetFilters: s.resetFilters,
    })),
  );

  const [vendorFilter, setVendorFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const { data: sites = [], isLoading } = useSitesList({
    q: searchTerm.trim() || undefined,
    vendor: vendorFilter.trim() || undefined,
    territory: territoryFilter || undefined,
    region: regionFilter || undefined,
  });
  const { data: vendorList = [] } = useEquipmentVendors();
  const { data: territories = [] } = useSiteTerritories();
  const { data: regions = [] } = useSiteRegions();

  const { create, update, remove } = useSiteMutations();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState<Site | null>(null);
  const [formSync, setFormSync] = useState(0);

  async function saveSite(values: Partial<Site>) {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body: values });
        showToast('Site updated', 'success');
      } else {
        await create.mutateAsync(values);
        showToast('Site created', 'success');
      }
      setModalOpen(false);
      setEditing(null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Save failed';
      showToast(msg || 'Save failed', 'error');
    }
  }

  const hasActiveFilters = Boolean(searchTerm.trim() || territoryFilter || regionFilter);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollRegion>
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title">Sites</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-secondary"
          >
            Bulk upload
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormSync((n) => n + 1);
              setModalOpen(true);
            }}
            className="btn-primary"
          >
            Add site
          </button>
        </div>
      </div>

      <div className="card">
        <label htmlFor="site-search" className="label-text">
          Search
        </label>
        <input
          id="site-search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Name, PLAID, territory, region, or address…"
          className="input-field"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SiteFiltersBar
          className="flex-1"
          filtersOrder="territory-first"
          regions={regionFilterOptions(regions)}
          areas={territoryFilterOptions(territories)}
          region={regionFilter}
          area={territoryFilter}
          onRegionChange={setRegionFilter}
          onAreaChange={setTerritoryFilter}
          vendors={vendorList}
          vendor={vendorFilter}
          onVendorChange={setVendorFilter}
        />
        <button
          type="button"
          onClick={resetFilters}
          className="btn-secondary"
        >
          Reset filters
        </button>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>Active filters:</span>
          {searchTerm.trim() && (
            <span className="filter-badge">
              Search: {searchTerm.trim()}
            </span>
          )}
          {territoryFilter && (
            <span className="filter-badge">
              Territory: {territoryFilter}
            </span>
          )}
          {regionFilter && (
            <span className="filter-badge">
              Region: {regionFilter}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-slate-600 dark:text-slate-400">
        {vendorFilter.trim()
          ? `Equipment counts and port utilization are for “${vendorFilter.trim()}” only.`
          : 'Equipment counts and port utilization include all vendors at each site. Select a vendor above to see that vendor only.'}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <SiteList
          sites={sites}
          vendorFilter={vendorFilter}
          onEdit={(s) => {
            setEditing(s);
            setFormSync((n) => n + 1);
            setModalOpen(true);
          }}
          onDelete={(s) => setDeleting(s)}
        />
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit site' : 'New site'}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      >
        <SiteForm
          syncToken={formSync}
          initial={editing}
          onSubmit={saveSite}
          onCancel={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          submitLabel={editing ? 'Save' : 'Create'}
        />
      </Modal>

      <ImportSitesCSV
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['sites'] });
          qc.invalidateQueries({ queryKey: ['site-territories'] });
          qc.invalidateQueries({ queryKey: ['site-regions'] });
          qc.invalidateQueries({ queryKey: ['summary'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete site?"
        message="This will remove all equipment, slots, and ports for this site."
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            showToast('Site deleted', 'success');
          } catch {
            showToast('Failed to delete', 'error');
          }
          setDeleting(null);
        }}
      />
    </div>
      </ScrollRegion>
    </div>
  );
}
