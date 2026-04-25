import { Eye, Flame, Maximize2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { GraphViewHandle } from "./GraphView";
import type { RefObject } from "react";

export function MapToolbar(props: { graphRef: RefObject<GraphViewHandle | null> }) {
  const heatmapEnabled = useAppStore((s) => s.heatmapEnabled);
  const toggleHeatmap = useAppStore((s) => s.toggleHeatmap);
  const mapLabelsEnabled = useAppStore((s) => s.mapLabelsEnabled);
  const setMapLabelsEnabled = useAppStore((s) => s.setMapLabelsEnabled);

  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg bg-black/20 p-1.5 backdrop-blur-sm">
      <button
        type="button"
        title="Fit to screen"
        onClick={() => props.graphRef.current?.fit()}
        className="rounded p-1.5 text-slate-200 transition hover:bg-white/10"
      >
        <Maximize2 size={18} />
      </button>
      <button
        type="button"
        title="Toggle heatmap"
        onClick={() => toggleHeatmap()}
        className={`rounded p-1.5 transition hover:bg-white/10 ${
          heatmapEnabled ? "bg-cyan-500/20 text-cyan-200" : "text-slate-200"
        }`}
      >
        <Flame size={18} />
      </button>
      <button
        type="button"
        title="Toggle labels"
        onClick={() => setMapLabelsEnabled(!mapLabelsEnabled)}
        className={`rounded p-1.5 transition hover:bg-white/10 ${
          mapLabelsEnabled ? "bg-cyan-500/20 text-cyan-200" : "text-slate-200"
        }`}
      >
        <Eye size={18} />
      </button>
    </div>
  );
}
