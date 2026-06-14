import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Boxes, ChevronDown, GripVertical, Home, Layers, Network } from "lucide-react";

const STORAGE_KEY = "prism-platform-switcher-v1";
const ICON_SIZE = 44;

const modules = [
  { to: "/inventory", label: "Inventory", short: "Inv", Icon: Boxes },
  { to: "/lsp", label: "LSP Design", short: "LSP", Icon: Network },
] as const;

const homeLink = { to: "/", label: "Home", Icon: Home } as const;

type Point = { x: number; y: number };

type Persisted = Point & { expanded?: boolean };

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    if (typeof data.x === "number" && typeof data.y === "number") return data;
  } catch {
    /* ignore */
  }
  return null;
}

function savePersisted(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function defaultPosition(onLsp: boolean): Point {
  const m = 20;
  if (typeof window === "undefined") return { x: m, y: m };
  if (onLsp) {
    return clampToViewport(Math.max(m, window.innerWidth - ICON_SIZE - m), 84, ICON_SIZE, ICON_SIZE);
  }
  return clampToViewport(m, Math.max(m, window.innerHeight - ICON_SIZE - m), ICON_SIZE, ICON_SIZE);
}

function clampToViewport(x: number, y: number, w: number, h: number): Point {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - w - pad);
  const maxY = Math.max(pad, window.innerHeight - h - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

function tabClass({ isActive }: { isActive: boolean }) {
  return clsx(
    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
    isActive
      ? "bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-500/40"
      : "text-slate-400 hover:bg-white/10 hover:text-slate-100",
  );
}

/** Draggable, collapsible floating switcher between Inventory and LSP. */
export function PlatformSwitcher() {
  const { pathname } = useLocation();
  const onInventory = pathname.startsWith("/inventory");
  const onLsp = pathname.startsWith("/lsp");

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(
    null,
  );

  const [expanded, setExpanded] = useState(() => loadPersisted()?.expanded ?? false);
  /** Canonical top-left for the collapsed icon — restored on collapse. */
  const [anchor, setAnchor] = useState<Point>(() => {
    const saved = loadPersisted();
    if (saved) return { x: saved.x, y: saved.y };
    return defaultPosition(onLsp);
  });
  /** Rendered position; may shift when expanded so the panel stays on-screen. */
  const [displayPos, setDisplayPos] = useState<Point>(anchor);

  const persistState = useCallback((nextAnchor: Point, nextExpanded: boolean) => {
    savePersisted({ ...nextAnchor, expanded: nextExpanded });
  }, []);

  const syncDisplayPos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth || (expanded ? 272 : ICON_SIZE);
    const h = el.offsetHeight || (expanded ? 160 : ICON_SIZE);
    if (expanded) {
      setDisplayPos(clampToViewport(anchor.x, anchor.y, w, h));
    } else {
      setDisplayPos(clampToViewport(anchor.x, anchor.y, ICON_SIZE, ICON_SIZE));
    }
  }, [anchor, expanded]);

  useLayoutEffect(() => {
    syncDisplayPos();
  }, [syncDisplayPos]);

  useEffect(() => {
    const onResize = () => syncDisplayPos();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncDisplayPos]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: displayPos.x,
        originY: displayPos.y,
        moved: false,
      };
    },
    [displayPos.x, displayPos.y],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      const el = rootRef.current;
      const w = el?.offsetWidth ?? (expanded ? 272 : ICON_SIZE);
      const h = el?.offsetHeight ?? (expanded ? 160 : ICON_SIZE);
      const next = clampToViewport(drag.originX + dx, drag.originY + dy, w, h);
      setDisplayPos(next);
      setAnchor(next);
    },
    [expanded],
  );

  const finishDrag = useCallback(
    (e: React.PointerEvent, expandOnTap: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const el = rootRef.current;
      const w = el?.offsetWidth ?? ICON_SIZE;
      const h = el?.offsetHeight ?? ICON_SIZE;
      const next = clampToViewport(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
        w,
        h,
      );
      setAnchor(next);
      if (expandOnTap && !drag.moved) {
        setExpanded(true);
        persistState(next, true);
      } else {
        setDisplayPos(next);
        persistState(next, expanded);
      }
    },
    [expanded, persistState],
  );

  const collapse = useCallback(() => {
    setExpanded(false);
    persistState(anchor, false);
  }, [anchor, persistState]);

  const expand = useCallback(() => {
    setExpanded(true);
    persistState(anchor, true);
  }, [anchor, persistState]);

  return (
    <div
      ref={rootRef}
      className="fixed z-[200] select-none touch-none"
      style={{ left: displayPos.x, top: displayPos.y }}
      aria-label="PRISM module switcher"
    >
      {expanded ? (
        <div className="w-[min(17rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-gray-950/95 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
            <div
              className="flex min-w-0 flex-1 cursor-grab items-center gap-1 active:cursor-grabbing"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={(e) => finishDrag(e, false)}
              onPointerCancel={(e) => finishDrag(e, false)}
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                PRISM
              </span>
            </div>
            <button
              type="button"
              onClick={collapse}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Collapse module switcher"
              title="Collapse"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          {(onInventory || onLsp) && (
            <p className="px-3 pt-2 text-[10px] text-slate-500">
              {onInventory ? "Equipment inventory" : "LSP & traffic simulation"}
            </p>
          )}
          <nav className="flex flex-col gap-0.5 p-2">
            <NavLink
              to={homeLink.to}
              className={tabClass}
              title={homeLink.label}
              end
              onClick={() => persistState(anchor, true)}
            >
              <homeLink.Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {homeLink.label}
            </NavLink>
            {modules.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={tabClass}
                title={label}
                end={false}
                onClick={() => persistState(anchor, true)}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-11 w-11 cursor-grab items-center justify-center rounded-full border border-cyan-500/40 bg-gray-950/95 text-cyan-300 shadow-lg backdrop-blur-md transition hover:border-cyan-400/60 hover:bg-gray-900 active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={(e) => finishDrag(e, true)}
          onPointerCancel={(e) => finishDrag(e, true)}
          onDoubleClick={expand}
          aria-label="Open PRISM module switcher"
          title="Drag to move · click to expand · double-click to expand"
        >
          <Layers className="h-5 w-5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
