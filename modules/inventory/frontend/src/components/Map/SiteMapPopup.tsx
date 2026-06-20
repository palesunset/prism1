import type { ReactNode } from 'react';
import type { Site } from '@/types';
import { formatLatLngPair } from '@/utils/coordinates';

function siteTerritoryLabel(s: Site): string {
  const t = (s.territory || '').toString().trim();
  return t || s.area || '';
}

function PopupRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="site-map-popup-row">
      <span className="site-map-popup-label">{label}</span>
      <span className="site-map-popup-value">{children}</span>
    </div>
  );
}

export function SiteMapPopupContent({
  site,
  onViewDetails,
}: {
  site: Site & { lat: number; lng: number };
  onViewDetails?: () => void;
}) {
  const territory = siteTerritoryLabel(site);
  const util = site.utilization_pct ?? 0;
  const utilNum = typeof util === 'string' ? parseFloat(util) : Number(util);
  const utilHigh = !Number.isNaN(utilNum) && utilNum > 80;
  const utilText =
    typeof site.utilization_pct === 'number'
      ? site.utilization_pct.toFixed(1)
      : site.utilization_pct != null
        ? String(site.utilization_pct)
        : null;

  const routerTypes = (site.equipment_router_types || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="site-map-popup-body">
      <h3 className="site-map-popup-title">{site.name}</h3>

      <div className="site-map-popup-section">
        <PopupRow label="PLAID">
          <span className="site-map-popup-mono">{site.plaid}</span>
        </PopupRow>
        <PopupRow label="Region">{site.region || '—'}</PopupRow>
        <PopupRow label="Territory">{territory || '—'}</PopupRow>
      </div>

      {site.address?.trim() ? (
        <div className="site-map-popup-address">
          <span className="site-map-popup-label">Address</span>
          <p>{site.address.trim()}</p>
        </div>
      ) : null}

      <div className="site-map-popup-section site-map-popup-stats">
        {site.equipment_count != null && (
          <PopupRow label="Equipment">{site.equipment_count} devices</PopupRow>
        )}
        {utilText != null && (
          <PopupRow label="Utilization">
            <span className={utilHigh ? 'site-map-popup-util-high' : 'site-map-popup-util-ok'}>
              {utilText}%
            </span>
          </PopupRow>
        )}
        {routerTypes.length > 0 && (
          <div className="site-map-popup-row site-map-popup-row-stack">
            <span className="site-map-popup-label">Router types</span>
            <span className="site-map-popup-badges">
              {routerTypes.map((rt) => (
                <span key={rt} className="site-map-popup-badge">
                  {rt}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="site-map-popup-coords">{formatLatLngPair(site.lat, site.lng)}</div>

      {onViewDetails && (
        <button type="button" onClick={onViewDetails} className="site-map-popup-action">
          View details
        </button>
      )}
    </div>
  );
}

export function SiteMapTooltipContent({ site }: { site: Site }) {
  const territory = siteTerritoryLabel(site);
  return (
    <div className="site-map-tooltip">
      <div className="site-map-tooltip-title">{site.name}</div>
      <div className="site-map-tooltip-line">
        <span className="site-map-popup-mono">{site.plaid}</span>
        <span className="site-map-tooltip-sep">·</span>
        {site.region}
        {territory ? (
          <>
            <span className="site-map-tooltip-sep">·</span>
            {territory}
          </>
        ) : null}
      </div>
    </div>
  );
}
