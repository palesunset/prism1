import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from '@/components/common/Layout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SummaryRedirect } from '@/components/common/SummaryRedirect';
import { useInventoryRoot } from '@/utils/inventoryPaths';

const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })));
const SitesPage = lazy(() => import('@/pages/SitesPage').then((m) => ({ default: m.SitesPage })));
const SiteDetailPage = lazy(() =>
  import('@/pages/SiteDetailPage').then((m) => ({ default: m.SiteDetailPage }))
);
const EquipmentDetailPage = lazy(() =>
  import('@/pages/EquipmentDetailPage').then((m) => ({ default: m.EquipmentDetailPage }))
);
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <LoadingSpinner />
    </div>
  );
}

/** Match routes under platform prefix `/inventory/*`. */
function useNestedInventoryPath() {
  const root = useInventoryRoot();
  const { pathname } = useLocation();
  if (!root) return pathname;
  if (pathname === root || pathname === `${root}/`) return '/';
  if (pathname.startsWith(`${root}/`)) return pathname.slice(root.length);
  return pathname;
}

export default function App() {
  const nestedPath = useNestedInventoryPath();
  const location = useLocation();

  return (
    <Layout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<RouteFallback />}>
          <Routes location={{ ...location, pathname: nestedPath }}>
            <Route index element={<MapPage />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="sites/:id" element={<SiteDetailPage />} />
            <Route path="equipment/:id" element={<EquipmentDetailPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="summary" element={<SummaryRedirect />} />
          </Routes>
        </Suspense>
      </div>
    </Layout>
  );
}
