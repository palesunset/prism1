const INVENTORY_BASE = process.env.INVENTORY_API_URL || 'http://127.0.0.1:3001';
const INVENTORY_API_KEY = (process.env.INVENTORY_API_KEY || '').trim();

function inventoryHeaders() {
  const headers = { Accept: 'application/json' };
  if (INVENTORY_API_KEY) {
    headers.Authorization = `Bearer ${INVENTORY_API_KEY}`;
  }
  return headers;
}

/**
 * Look up equipment rows in Inventory by management IP (read-only).
 */
export async function crossCheckInventory(address, hostname = null) {
  const normalized = String(address ?? '').trim();
  if (!normalized) {
    return { reachable: false, matches: [], warnings: [] };
  }

  try {
    const url = `${INVENTORY_BASE}/api/inventory/equipment/by-ip?address=${encodeURIComponent(normalized)}`;
    const res = await fetch(url, { headers: inventoryHeaders() });
    if (!res.ok) {
      return { reachable: false, matches: [], warnings: [] };
    }
    const data = await res.json();
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const warnings = [];

    if (hostname && matches.length > 0) {
      for (const m of matches) {
        const ne = String(m.network_element ?? '').trim();
        if (ne && ne.toLowerCase() !== String(hostname).trim().toLowerCase()) {
          warnings.push({
            type: 'hostname_mismatch',
            message: `Inventory NE "${ne}" differs from IPAM hostname "${hostname}".`,
            suggestion: 'Align hostname / network element naming across systems.',
          });
        }
      }
    }

    if (matches.length === 0) {
      warnings.push({
        type: 'inventory_miss',
        message: `No inventory equipment registered with IP ${normalized}.`,
        suggestion: 'Register the device in Equipment Inventory or verify the address.',
      });
    }

    return { reachable: true, matches, warnings };
  } catch {
    return { reachable: false, matches: [], warnings: [] };
  }
}
