/** Keep in sync with backend `isSiteCountIntentQuery` in `routes/search.js`. */
export function isSiteCountIntentQuery(raw: string): boolean {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return false;
  return (
    /\bhow\s+many\s+sites?\b/.test(q) ||
    /\bnumber\s+of\s+sites?\b/.test(q) ||
    /\bhow\s+many\s+data\s*centers?\b/.test(q) ||
    /\bhow\s+many\s+locations?\b/.test(q) ||
    /\bsite\s+count\b/.test(q) ||
    /\btotal\s+sites?\b/.test(q) ||
    /\bcount\b[\s\w]{0,40}\bsites?\b/.test(q)
  );
}

/** Keep in sync with backend `isCountIntentQuery` in `routes/search.js`. */
export function isCountIntentQuery(raw: string): boolean {
  const q = (raw || '').toString().trim().toLowerCase();
  if (!q) return false;
  if (isSiteCountIntentQuery(q)) return false;
  return (
    /\bhow\s+many\b/.test(q) ||
    /\bhow\s+much\b/.test(q) ||
    /\bnumber\s+of\b/.test(q) ||
    /\btotal\s+equipment\b/.test(q) ||
    /\bequipment\s+count\b/.test(q) ||
    /\bcount\b[\s\w]{0,40}\bequipment\b/.test(q)
  );
}
