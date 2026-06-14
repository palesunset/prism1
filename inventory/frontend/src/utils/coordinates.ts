function trimCoordDecimals(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

export function formatLatitude(lat: number): string {
  const abs = Math.abs(lat);
  const dir = lat >= 0 ? 'N' : 'S';
  return `${trimCoordDecimals(abs.toFixed(6))}° ${dir}`;
}

export function formatLongitude(lng: number): string {
  const abs = Math.abs(lng);
  const dir = lng >= 0 ? 'E' : 'W';
  return `${trimCoordDecimals(abs.toFixed(6))}° ${dir}`;
}

/** e.g. 7.0506° N, 125.5883° E */
export function formatLatLngPair(lat: number, lng: number): string {
  return `${formatLatitude(lat)}, ${formatLongitude(lng)}`;
}
