export type FloatingPoint = { x: number; y: number };

export function clampToViewport(x: number, y: number, w: number, h: number): FloatingPoint {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - w - pad);
  const maxY = Math.max(pad, window.innerHeight - h - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

export function loadFloatingPosition(storageKey: string): FloatingPoint | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as FloatingPoint;
    if (typeof data.x === 'number' && typeof data.y === 'number') return data;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveFloatingPosition(storageKey: string, point: FloatingPoint) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(point));
  } catch {
    /* ignore */
  }
}
