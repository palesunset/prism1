import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Boxes, Calculator, ChevronDown, Database, GripVertical, Home, LayoutGrid, Network, ScanEye, StickyNote, Waypoints } from "lucide-react";
import { useNotesStore } from "../store/useNotesStore";
import { useIpCalculatorStore } from "../store/useIpCalculatorStore";
import { useVlsmPlannerStore } from "../store/useVlsmPlannerStore";
import { useNetLensStore } from "../store/useNetLensStore";
import { FLOATING_TOOL_ACTIVE, FLOATING_TAB_ACTIVE, FLOATING_FAB, FLOATING_CHROME, FLOATING_PANEL_SHELL, FLOATING_INACTIVE_BTN, FLOATING_MUTED_TEXT, FLOATING_SUBTLE_BORDER, FLOATING_NOTES_ACTIVE } from "../utils/floatingPanelTheme";

const STORAGE_KEY = "prism-platform-switcher-v1";
const FAB_SIZE = 48;

const FAB_GLOW =
  "shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_0_18px_rgba(99,102,241,0.45),0_6px_20px_rgba(0,0,0,0.5)]";
const FAB_GLOW_HOVER =
  "hover:shadow-[0_0_0_1px_rgba(196,181,253,0.45),0_0_24px_rgba(124,58,237,0.55),0_8px_24px_rgba(0,0,0,0.55)]";

function FabIcon(props: { className?: string; strokeWidth?: number }) {
  return <LayoutGrid className={props.className} strokeWidth={props.strokeWidth ?? 2.25} aria-hidden />;
}

function PanelHeaderIcon() {
  return <FabIcon className={clsx("h-3.5 w-3.5 shrink-0", FLOATING_MUTED_TEXT)} strokeWidth={1.75} />;
}

const modules = [
  { to: "/lsp", label: "LSP Design", short: "LSP", Icon: Network },
  { to: "/inventory", label: "Equipment Inventory", short: "Inv", Icon: Boxes },
  { to: "/ipam", label: "Mini IPAM", short: "IPAM", Icon: Database },
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
    return clampToViewport(Math.max(m, window.innerWidth - FAB_SIZE - m), 84, FAB_SIZE, FAB_SIZE);
  }
  return clampToViewport(m, Math.max(m, window.innerHeight - FAB_SIZE - m), FAB_SIZE, FAB_SIZE);
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
    "flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
    isActive ? FLOATING_TAB_ACTIVE : FLOATING_INACTIVE_BTN,
  );
}

/** Draggable, collapsible floating switcher between Inventory and LSP. */
export function PlatformSwitcher() {
  const { pathname } = useLocation();
  const onInventory = pathname.startsWith("/inventory");
  const onLsp = pathname.startsWith("/lsp");
  const onIpam = pathname.startsWith("/ipam");
  const notesOpen = useNotesStore((s) => s.panelOpen);
  const toggleNotes = useNotesStore((s) => s.togglePanel);
  const ipCalcOpen = useIpCalculatorStore((s) => s.panelOpen);
  const toggleIpCalc = useIpCalculatorStore((s) => s.togglePanel);
  const vlsmOpen = useVlsmPlannerStore((s) => s.panelOpen);
  const toggleVlsm = useVlsmPlannerStore((s) => s.togglePanel);
  const netLensOpen = useNetLensStore((s) => s.panelOpen);
  const toggleNetLens = useNetLensStore((s) => s.togglePanel);

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
    const w = el.offsetWidth || (expanded ? 248 : FAB_SIZE);
    const h = el.offsetHeight || (expanded ? 200 : FAB_SIZE);
    if (expanded) {
      setDisplayPos(clampToViewport(anchor.x, anchor.y, w, h));
    } else {
      setDisplayPos(clampToViewport(anchor.x, anchor.y, FAB_SIZE, FAB_SIZE));
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
      const w = el?.offsetWidth ?? (expanded ? 248 : FAB_SIZE);
      const h = el?.offsetHeight ?? (expanded ? 200 : FAB_SIZE);
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
      const w = el?.offsetWidth ?? FAB_SIZE;
      const h = el?.offsetHeight ?? FAB_SIZE;
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
      className={clsx("fixed z-[200] select-none touch-none", FLOATING_CHROME)}
      style={{ left: displayPos.x, top: displayPos.y }}
      aria-label="PRISM module switcher"
    >
      {expanded ? (
        <div className={clsx("w-[min(15.5rem,calc(100vw-1.5rem))] overflow-hidden", FLOATING_CHROME, FLOATING_PANEL_SHELL)}>
          <div className={clsx("flex items-center gap-1 border-b px-2 py-1.5", FLOATING_SUBTLE_BORDER)}>
            <div
              className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 active:cursor-grabbing"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={(e) => finishDrag(e, false)}
              onPointerCancel={(e) => finishDrag(e, false)}
              title="Drag to move"
            >
              <GripVertical className={clsx("h-4 w-4 shrink-0", FLOATING_MUTED_TEXT)} strokeWidth={2} />
              <PanelHeaderIcon />
              <span className={clsx("truncate text-[10px] font-semibold uppercase tracking-wider", FLOATING_MUTED_TEXT)}>
                Modules
              </span>
            </div>
            <button
              type="button"
              onClick={collapse}
              className={clsx("shrink-0 rounded-md p-1", FLOATING_INACTIVE_BTN)}
              aria-label="Collapse module switcher"
              title="Collapse"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          {(onInventory || onLsp || onIpam) && (
            <p className={clsx("px-3 pt-2 text-[10px]", FLOATING_MUTED_TEXT)}>
              {onInventory ? "Equipment inventory" : onIpam ? "IP address management" : "LSP & traffic simulation"}
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
              <span className="truncate">{homeLink.label}</span>
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
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                toggleIpCalc();
                persistState(anchor, true);
              }}
              className={clsx(
                "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                ipCalcOpen ? FLOATING_TOOL_ACTIVE : FLOATING_INACTIVE_BTN,
              )}
              title="IP Calculator"
            >
              <Calculator className="h-4 w-4 shrink-0" strokeWidth={2} />
              IP Calculator
            </button>
            <button
              type="button"
              onClick={() => {
                toggleVlsm();
                persistState(anchor, true);
              }}
              className={clsx(
                "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                vlsmOpen ? FLOATING_TOOL_ACTIVE : FLOATING_INACTIVE_BTN,
              )}
              title="VLSM Planner"
            >
              <Waypoints className="h-4 w-4 shrink-0" strokeWidth={2} />
              VLSM Planner
            </button>
            <button
              type="button"
              onClick={() => {
                toggleNetLens();
                persistState(anchor, true);
              }}
              className={clsx(
                "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                netLensOpen ? FLOATING_TOOL_ACTIVE : FLOATING_INACTIVE_BTN,
              )}
              title="NetLens — IP validation engine"
            >
              <ScanEye className="h-4 w-4 shrink-0" strokeWidth={2} />
              NetLens
            </button>
            <button
              type="button"
              onClick={() => {
                toggleNotes();
                persistState(anchor, true);
              }}
              className={clsx(
                "flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                notesOpen ? FLOATING_NOTES_ACTIVE : FLOATING_INACTIVE_BTN,
              )}
              title="Quick Notes"
            >
              <StickyNote className="h-4 w-4 shrink-0" strokeWidth={2} />
              Notes
            </button>
          </nav>
        </div>
      ) : (
        <button
          type="button"
          className={clsx(
            "flex h-12 w-12 cursor-grab items-center justify-center rounded-2xl backdrop-blur-sm transition",
            FLOATING_FAB,
            "active:scale-[0.97] active:cursor-grabbing",
            FAB_GLOW,
            FAB_GLOW_HOVER,
          )}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={(e) => finishDrag(e, true)}
          onPointerCancel={(e) => finishDrag(e, true)}
          onDoubleClick={expand}
          aria-label="Open PRISM module switcher"
          title="Drag to move · click to expand · double-click to expand"
        >
          <FabIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
