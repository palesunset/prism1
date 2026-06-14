import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  clampToViewport,
  loadFloatingPosition,
  saveFloatingPosition,
  type FloatingPoint,
} from '../utils/floatingPanel';

type Options = {
  storageKey: string;
  defaultPosition: () => FloatingPoint;
  defaultWidth: number;
  defaultHeight: number;
  enabled: boolean;
};

export function useFloatingPanelDrag(options: Options) {
  const { storageKey, defaultPosition, defaultWidth, defaultHeight, enabled } = options;
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [position, setPosition] = useState<FloatingPoint>(() => {
    return loadFloatingPosition(storageKey) ?? defaultPosition();
  });

  const syncPosition = useCallback(() => {
    const el = rootRef.current;
    const w = el?.offsetWidth ?? defaultWidth;
    const h = el?.offsetHeight ?? defaultHeight;
    setPosition((prev) => clampToViewport(prev.x, prev.y, w, h));
  }, [defaultHeight, defaultWidth]);

  useLayoutEffect(() => {
    if (!enabled) return;
    syncPosition();
  }, [enabled, syncPosition]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => syncPosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, syncPosition]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position.x, position.y],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const el = rootRef.current;
      const w = el?.offsetWidth ?? defaultWidth;
      const h = el?.offsetHeight ?? defaultHeight;
      setPosition(
        clampToViewport(
          drag.originX + (e.clientX - drag.startX),
          drag.originY + (e.clientY - drag.startY),
          w,
          h,
        ),
      );
    },
    [defaultHeight, defaultWidth],
  );

  const onDragEnd = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const el = rootRef.current;
      const w = el?.offsetWidth ?? defaultWidth;
      const h = el?.offsetHeight ?? defaultHeight;
      const next = clampToViewport(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
        w,
        h,
      );
      setPosition(next);
      saveFloatingPosition(storageKey, next);
    },
    [defaultHeight, defaultWidth, storageKey],
  );

  return {
    rootRef,
    position,
    onDragStart,
    onDragMove,
    onDragEnd,
  };
}
