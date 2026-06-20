const STORAGE_KEY = 'dc-inventory-api-key';

export function getStoredApiKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredApiKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaderRecord(): Record<string, string> {
  const key = getStoredApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export async function downloadAuthenticatedCsv(url: string, filename: string) {
  const res = await fetch(url, { headers: authHeaderRecord() });
  if (res.status === 401) {
    clearStoredApiKey();
    window.location.reload();
    return;
  }
  if (!res.ok) {
    throw new Error('Export failed');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export { STORAGE_KEY };
