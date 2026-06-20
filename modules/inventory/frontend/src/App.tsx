import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/common/Layout';
import { MapPage } from '@/pages/MapPage';
import { SitesPage } from '@/pages/SitesPage';
import { SiteDetailPage } from '@/pages/SiteDetailPage';
import { EquipmentDetailPage } from '@/pages/EquipmentDetailPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SummaryRedirect } from '@/components/common/SummaryRedirect';

export default function App() {
  return (
    <Layout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route index element={<MapPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/:id" element={<SiteDetailPage />} />
          <Route path="equipment/:id" element={<EquipmentDetailPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="summary" element={<SummaryRedirect />} />
        </Routes>
      </div>
    </Layout>
  );
}
