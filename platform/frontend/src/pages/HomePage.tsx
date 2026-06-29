import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Boxes, Database, Network } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrismLogo } from "../components/PrismLogo";

const LAST_MODULE_KEY = "prism-last-module";

type ModuleChoice = "/inventory" | "/lsp" | "/ipam";

const modules = [
  {
    to: "/lsp" as const,
    label: "LSP Design",
    tagline: "Paths, simulation & config export",
    description: "Import topology, compute CSPF primary/backup paths, simulate failures, export vendor configs.",
    Icon: Network,
    accent: "from-cyan-500/20 to-blue-500/10",
    ring: "group-hover:ring-cyan-400/50",
    icon: "text-cyan-300",
    cta: "Open LSP Design",
  },
  {
    to: "/inventory" as const,
    label: "Inventory",
    tagline: "Sites, equipment, ports & map",
    description: "Manage network inventory, import CSVs, dashboard views, and Oz AI assistant.",
    Icon: Boxes,
    accent: "from-emerald-500/20 to-cyan-500/10",
    ring: "group-hover:ring-emerald-400/50",
    icon: "text-emerald-300",
    cta: "Open Inventory",
  },
  {
    to: "/ipam" as const,
    label: "Mini IPAM",
    tagline: "IP registry, search & conflict detection",
    description: "Full IPAM — registry, VLSM import, utilization analytics, conflict detection, audit log.",
    Icon: Database,
    accent: "from-indigo-500/20 to-violet-500/10",
    ring: "group-hover:ring-indigo-400/50",
    icon: "text-indigo-300",
    cta: "Open Mini IPAM",
  },
] as const;

function prefetchModule(to: ModuleChoice): void {
  if (to === "/inventory") {
    void import("../modules/InventoryModule");
    void fetch("/api/inventory/bootstrap").catch(() => undefined);
  } else if (to === "/ipam") {
    void import("../modules/IpamModule");
    void fetch("/api/ipam/bootstrap").catch(() => undefined);
  } else if (to === "/lsp") {
    void import("../modules/LspModule");
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [leaving, setLeaving] = useState<ModuleChoice | null>(null);

  const go = useCallback(
    (to: ModuleChoice) => {
      if (leaving) return;
      try {
        localStorage.setItem(LAST_MODULE_KEY, to);
      } catch {
        /* ignore */
      }
      setLeaving(to);
      window.setTimeout(() => navigate(to), reduceMotion ? 0 : 80);
    },
    [leaving, navigate, reduceMotion],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving) return;
      if (e.key === "1") go("/lsp");
      if (e.key === "2") go("/inventory");
      if (e.key === "3") go("/ipam");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, leaving]);

  const pageVariants = reduceMotion
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8, scale: 0.985 },
      };

  return (
    <motion.div
      className="relative flex h-full min-h-0 flex-col items-center overflow-hidden px-4 py-4 sm:px-6 sm:py-5"
      initial="initial"
      animate={leaving ? "exit" : "animate"}
      variants={pageVariants}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.18),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(16,185,129,0.08),transparent)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center overflow-hidden text-center">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="mb-2 flex flex-col items-center gap-2 sm:mb-3"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/25 bg-gray-950/80 shadow-lg shadow-cyan-500/10 ring-1 ring-white/5 sm:h-14 sm:w-14">
            <PrismLogo className="h-8 w-8 text-cyan-400 sm:h-9 sm:w-9" />
          </div>
          <p className="text-sm font-semibold tracking-[0.18em] text-cyan-400/80 sm:text-base">Prism Platform</p>
        </motion.div>
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-1.5 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl"
        >
          What would you like to open?
        </motion.h1>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mb-4 max-w-lg text-xs text-slate-400 sm:mb-5 sm:text-sm"
        >
          Choose a module to get started. Use the floating PRISM menu for modules, notes, and tools.
        </motion.p>

        <div className="grid w-full gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {modules.map((mod, index) => {
            const isLeaving = leaving === mod.to;
            const isDimmed = leaving !== null && !isLeaving;
            return (
              <motion.button
                key={mod.to}
                type="button"
                disabled={leaving !== null}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{
                  opacity: isDimmed ? 0.35 : 1,
                  y: 0,
                  scale: isLeaving ? 0.98 : 1,
                }}
                transition={{ delay: 0.2 + index * 0.08, duration: 0.35 }}
                onClick={() => go(mod.to)}
                onMouseEnter={() => prefetchModule(mod.to)}
                onFocus={() => prefetchModule(mod.to)}
                className={`group relative flex flex-col rounded-xl border border-white/10 bg-gray-900/70 p-4 text-left shadow-xl backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-white/20 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-default sm:p-5 ${mod.ring} ring-1 ring-transparent`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${mod.accent}`}
                  aria-hidden
                />
                <div className="relative flex flex-col">
                  <div
                    className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-gray-950/80 sm:mb-3 sm:h-10 sm:w-10 ${mod.icon}`}
                  >
                    <mod.Icon className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={1.75} />
                  </div>
                  <h2 className="mb-0.5 text-base font-semibold text-slate-100 sm:text-lg">{mod.label}</h2>
                  <p className="mb-2 text-xs font-medium text-slate-400 sm:text-sm">{mod.tagline}</p>
                  <p className="mb-3 line-clamp-2 text-xs leading-snug text-slate-500 sm:mb-4 sm:text-sm">{mod.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 transition group-hover:gap-2 sm:text-sm">
                    {mod.cta}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: leaving ? 0 : 1 }}
          transition={{ delay: 0.45, duration: 0.3 }}
          className="mt-3 text-[10px] text-slate-600 sm:mt-4 sm:text-xs"
        >
          Press <kbd className="rounded border border-white/10 bg-gray-900 px-1.5 py-0.5 font-mono text-slate-400">1</kbd>{" "}
          for LSP Design ·{" "}
          <kbd className="rounded border border-white/10 bg-gray-900 px-1.5 py-0.5 font-mono text-slate-400">2</kbd> for
          Inventory ·{" "}
          <kbd className="rounded border border-white/10 bg-gray-900 px-1.5 py-0.5 font-mono text-slate-400">3</kbd> for
          Mini IPAM
        </motion.p>
      </div>

      <motion.footer
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ delay: 0.55, duration: 0.35 }}
        className="relative z-10 w-full shrink-0 pb-3 pt-2 text-center sm:pb-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-600">Developer</p>
        <div className="mt-1.5 space-y-0.5 text-sm text-slate-500">
          <p>Ruel Saria</p>
          <p>John Carlo Emberga</p>
        </div>
      </motion.footer>
    </motion.div>
  );
}
