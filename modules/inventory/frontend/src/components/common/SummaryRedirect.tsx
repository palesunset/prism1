import { Navigate } from 'react-router-dom';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';

export function SummaryRedirect() {
  const root = useInventoryRoot();
  return <Navigate to={invPath(root, 'dashboard')} replace />;
}
