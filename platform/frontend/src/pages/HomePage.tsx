import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Boxes, Network } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const LAST_MODULE_KEY = "prism-last-module";

type ModuleChoice = "/inventory" | "/lsp";

const modules = [
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
] as const;

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
      window.setTimeout(() => navigate(to), reduceMotion ? 0 : 320);
    },
    [leaving, navigate, reduceMotion],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving) return;
      if (e.key === "1") go("/inventory");
      if (e.key === "2") go("/lsp");
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
      className="relative flex h-full min-h-0 flex-col items-center overflow-auto px-4 py-10 sm:px-8"
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

      <div className="relative z-10 flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-400/80"
        >
          PRISM Platform
        </motion.div>
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
        >
          What would you like to open?
        </motion.h1>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mb-10 max-w-lg text-sm text-slate-400 sm:text-base"
        >
          Choose a module to get started. Use the floating PRISM menu for modules and quick notes.
        </motion.p>

        <div className="grid w-full gap-4 sm:grid-cols-2 sm:gap-5">
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
                className={`group relative flex min-h-[220px] flex-col rounded-2xl border border-white/10 bg-gray-900/70 p-6 text-left shadow-xl backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-white/20 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-default sm:min-h-[240px] sm:p-7 ${mod.ring} ring-1 ring-transparent`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${mod.accent}`}
                  aria-hidden
                />
                <div className="relative flex flex-1 flex-col">
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gray-950/80 ${mod.icon}`}
                  >
                    <mod.Icon className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <h2 className="mb-1 text-xl font-semibold text-slate-100">{mod.label}</h2>
                  <p className="mb-3 text-sm font-medium text-slate-400">{mod.tagline}</p>
                  <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-500">{mod.description}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 transition group-hover:gap-3">
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
          className="mt-8 text-xs text-slate-600"
        >
          Press <kbd className="rounded border border-white/10 bg-gray-900 px-1.5 py-0.5 font-mono text-slate-400">1</kbd>{" "}
          for Inventory ·{" "}
          <kbd className="rounded border border-white/10 bg-gray-900 px-1.5 py-0.5 font-mono text-slate-400">2</kbd> for
          LSP Design
        </motion.p>
      </div>

      <motion.footer
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ delay: 0.55, duration: 0.35 }}
        className="relative z-10 w-full shrink-0 pb-6 pt-4 text-center"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-600">Developer</p>
        <p className="mt-1.5 text-sm text-slate-500">Ruel Saria | John Carlo Emberga</p>
      </motion.footer>
    </motion.div>
  );
}
