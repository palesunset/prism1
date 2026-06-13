import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { diffLines } from "diff";
import {
  errorDetail,
  exportClipboard,
  nokiaRsvpNamesForDirection,
} from "../../services/apiClient";
import { useAppStore } from "../../store/useAppStore";
import type { NokiaCliStyle } from "../../types";

function renderDiff(existing: string, generated: string): Array<{ kind: "add" | "del" | "same"; text: string }> {
  const parts = diffLines(existing, generated);
  const out: Array<{ kind: "add" | "del" | "same"; text: string }> = [];
  for (const p of parts) {
    const kind = p.added ? "add" : p.removed ? "del" : "same";
    out.push({ kind, text: String(p.value) });
  }
  return out;
}

export function DiffViewer() {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState("");
  const [generated, setGenerated] = useState("");
  const [busy, setBusy] = useState(false);

  const last = useAppStore((s) => s.lastCompute);
  const lspName = useAppStore((s) => s.lspName);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const reservations = useAppStore((s) => s.reservations);
  const nxF = useAppStore((s) => s.nokiaRsvpLabelXForward);
  const nyF = useAppStore((s) => s.nokiaRsvpLabelYForward);
  const nzF = useAppStore((s) => s.nokiaRsvpLabelZForward);
  const nxR = useAppStore((s) => s.nokiaRsvpLabelXReverse);
  const nyR = useAppStore((s) => s.nokiaRsvpLabelYReverse);
  const nzR = useAppStore((s) => s.nokiaRsvpLabelZReverse);

  const diff = useMemo(() => renderDiff(existing, generated), [existing, generated]);

  async function buildGeneratedForIngress() {
    if (!last?.primary) {
      toast.error("Compute an LSP first");
      return;
    }
    setBusy(true);
    try {
      const txt = await exportClipboard({
        lsp_name: lspName,
        mode: last.mode,
        primary: last.primary,
        backup: last.backup,
        reservations,
        nokia_cli_style: nokiaCliStyle as NokiaCliStyle,
        ...nokiaRsvpNamesForDirection("forward", nxF, nyF, nzF),
        ...nokiaRsvpNamesForDirection("reverse", nxR, nyR, nzR),
      });
      setGenerated(txt);
      toast.success("Generated config loaded");
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 rounded border border-slate-700 bg-slate-900" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">Config diff (ingress)</summary>
      <div className="space-y-2 px-2 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void buildGeneratedForIngress()}
            className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-700 disabled:opacity-40"
          >
            Load generated ingress config
          </button>
          <button
            type="button"
            onClick={() => {
              setExisting("");
              setGenerated("");
            }}
            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-[11px] text-slate-400">Existing config (paste)</div>
            <textarea
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
              rows={8}
              className="w-full rounded border border-slate-600 bg-prism-hlBg p-2 font-mono text-[11px] text-slate-100"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-[11px] text-slate-400">Generated config</div>
            <textarea
              value={generated}
              onChange={(e) => setGenerated(e.target.value)}
              rows={8}
              className="w-full rounded border border-slate-600 bg-prism-hlBg p-2 font-mono text-[11px] text-slate-100"
            />
          </label>
        </div>
        {(existing || generated) && (
          <div className="max-h-64 overflow-auto rounded border border-slate-600 bg-prism-hlBg p-2 font-mono text-[11px]">
            {diff.map((d, idx) => (
              <pre
                key={idx}
                className={
                  d.kind === "add"
                    ? "text-emerald-300"
                    : d.kind === "del"
                      ? "text-rose-300"
                      : "text-slate-300"
                }
              >
                {d.text}
              </pre>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

