/** Base URL for inventory REST API (namespaced under /api/inventory in the platform). */

export function inventoryApiBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (env) return env;
  return '/api/inventory';
}

export function inventoryApiUrl(path: string): string {
  const base = inventoryApiBase();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
