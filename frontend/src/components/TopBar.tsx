import { useMemo } from "react";
import { PrismLogo } from "./PrismLogo";
import type { Mode } from "../types";
import { useAppStore } from "../store/useAppStore";

const MODES: { id: Mode; short: string; label: string }[] = [
  { id: "rsvp_te", short: "TE", label: "RSVP-TE" },
  { id: "sr_mpls", short: "SR", label: "SR-MPLS" },
  { id: "srv6", short: "v6", label: "SRv6" },
];

function NeSearchInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  neIds: string[];
}) {
  const listId = `${props.id}-list`;
  return (
    <div className="min-w-0 flex-1">
      <input
        id={props.id}
        type="search"
        list={listId}
        autoComplete="off"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
      />
      <datalist id={listId}>
        {props.neIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </div>
  );
}

export function TopBar(props: { onCompute: () => void; busy: boolean }) {
  const neIds = useAppStore((s) => s.neIds);
  const source = useAppStore((s) => s.source);
  const destination = useAppStore((s) => s.destination);
  const setSource = useAppStore((s) => s.setSource);
  const setDestination = useAppStore((s) => s.setDestination);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  const canCompute = useMemo(() => Boolean(source && destination), [source, destination]);

  return (
    <header className="z-50 flex min-h-16 shrink-0 items-center gap-4 border-b border-white/5 bg-gray-950/80 px-4 py-2.5 backdrop-blur-md">
      <div className="flex min-w-fit items-start gap-3">
        <PrismLogo className="h-10 w-10 shrink-0 text-cyan-400" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-2xl font-bold leading-none tracking-tight text-slate-100 sm:text-[1.75rem]">
            PRISM
          </span>
          <p className="text-[11px] leading-snug text-slate-500">Developer: RC Saria & JC Emberga</p>
        </div>
      </div>

      <div className="mx-6 flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden text-xs text-slate-500 sm:inline">Source</span>
        <NeSearchInput
          id="ne-search-source"
          value={source}
          onChange={setSource}
          placeholder="Source NE"
          neIds={neIds}
        />
        <span className="hidden text-xs text-slate-500 sm:inline">Dest</span>
        <NeSearchInput
          id="ne-search-dest"
          value={destination}
          onChange={setDestination}
          placeholder="Destination NE"
          neIds={neIds}
        />
      </div>

      <div className="flex min-w-fit items-center gap-3">
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.label}
              onClick={() => setMode(m.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mode === m.id ? "bg-cyan-600 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={props.busy || !canCompute}
          onClick={props.onCompute}
          className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:shadow-cyan-500/25 disabled:opacity-50"
        >
          {props.busy ? "Computing…" : "Compute LSP"}
        </button>
      </div>
    </header>
  );
}
