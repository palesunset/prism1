import { useLocation } from 'react-router-dom';

/** `/inventory` when embedded in PRISM Platform; empty when inventory runs standalone. */
export function inventoryRootFromPathname(pathname: string): string {
  return pathname.startsWith('/inventory') ? '/inventory' : '';
}

export function useInventoryRoot(): string {
  const { pathname } = useLocation();
  return inventoryRootFromPathname(pathname);
}

/** Build an absolute path within the inventory module. */
export function invPath(root: string, ...segments: string[]): string {
  const tail = segments.filter(Boolean).join('/');
  if (!tail) return root || '/';
  return root ? `${root}/${tail}` : `/${tail}`;
}
