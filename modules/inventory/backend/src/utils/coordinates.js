function trimCoordDecimals(s) {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

export function formatLatitude(lat) {
  const n = Number(lat);
  if (Number.isNaN(n)) return String(lat);
  const abs = Math.abs(n);
  const dir = n >= 0 ? 'N' : 'S';
  return `${trimCoordDecimals(abs.toFixed(6))}° ${dir}`;
}

export function formatLongitude(lng) {
  const n = Number(lng);
  if (Number.isNaN(n)) return String(lng);
  const abs = Math.abs(n);
  const dir = n >= 0 ? 'E' : 'W';
  return `${trimCoordDecimals(abs.toFixed(6))}° ${dir}`;
}

/** e.g. 7.0506° N, 125.5883° E */
export function formatLatLngPair(lat, lng) {
  return `${formatLatitude(lat)}, ${formatLongitude(lng)}`;
}
