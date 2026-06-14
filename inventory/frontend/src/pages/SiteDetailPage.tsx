import { Navigate, useParams } from 'react-router-dom';
import { SiteDetail } from '@/components/Sites/SiteDetail';
import { ScrollRegion } from '@/components/common/ScrollRegion';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

const RESERVED_SITE_IDS = new Set(['dashboard', 'summary']);

export function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const root = useInventoryRoot();
  if (!id) return <p>Missing site id</p>;
  if (RESERVED_SITE_IDS.has(id)) {
    return <Navigate to={invPath(root, 'dashboard')} replace />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollRegion className="pb-2">
        <SiteDetail siteId={id} />
      </ScrollRegion>
    </div>
  );
}
