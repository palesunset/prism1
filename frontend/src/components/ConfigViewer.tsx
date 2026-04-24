import toast from "react-hot-toast";
import { useEffect, useMemo, useState } from "react";

export function ConfigViewer(props: { configText: string | null }) {
  const { configText } = props;
  if (!configText) return null;

  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(false);

  const lines = useMemo(() => configText.split("\n").length, [configText]);
  const bytes = useMemo(() => new Blob([configText]).size, [configText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full) {
        setFull(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <div className="fixed bottom-3 left-3 z-40 w-[min(880px,calc(100vw-24px))]">
      {!open ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#1E293B] px-3 py-2 text-xs font-semibold text-slate-100 shadow-xl hover:bg-slate-800"
          onClick={() => setOpen(true)}
          title="Show configuration output"
        >
          <span className="text-cyan-400">▴</span>
          Config output
          <span className="text-slate-400 font-normal">
            ({lines} lines, {(bytes / 1024).toFixed(1)} KB)
          </span>
        </button>
      ) : null}

      <aside
        className={`overflow-hidden rounded-xl border border-slate-700 bg-[#1E293B] shadow-2xl ${
          open ? "" : "hidden"
        } ${full ? "fixed inset-3 z-50 w-auto" : ""}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">Configuration Output</div>
            <div className="text-[11px] text-slate-400">
              {lines} lines • {(bytes / 1024).toFixed(1)} KB
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              className="rounded border border-slate-600 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
              title={full ? "Exit full screen (Esc)" : "Full screen"}
            >
              {full ? "Exit" : "Full"}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(configText);
                toast.success("Configuration copied to clipboard");
              }}
              className="rounded bg-cyan-700 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
              title="Copy full config"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Hide"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={`${full ? "h-[calc(100%-52px)]" : "max-h-[45vh]"} overflow-auto`}>
          <pre className="whitespace-pre-wrap bg-slate-950 p-3 text-xs text-green-300 [font-variant-numeric:tabular-nums]">
            {configText}
          </pre>
        </div>
      </aside>
    </div>
  );
}

