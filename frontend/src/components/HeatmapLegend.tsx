export function HeatmapLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-10 rounded-lg bg-black/60 p-2 text-xs text-white/80 backdrop-blur-sm">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">Link load</div>
      <div className="h-2 w-40 overflow-hidden rounded-full">
        <div
          className="h-full w-full"
          style={{
            background: "linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 80%, #ef4444 100%)",
          }}
        />
      </div>
      <div className="mt-1 flex w-40 justify-between text-[10px] text-slate-400">
        <span>0%</span>
        <span>50%</span>
        <span>80%+</span>
      </div>
    </div>
  );
}
