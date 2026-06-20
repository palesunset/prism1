import { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartGrid, chartTick, chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { AreaAggregate, RegionAggregate } from '@/types/dashboard';

const BAR_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

function EquipmentBarChart({ data }: { data: { name: string; equipment: number }[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);
  const tooltip = chartTooltipStyle(isDark);

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: tick, fontSize: 11 }}
            interval={0}
            angle={data.length > 6 ? -18 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 48 : 32}
          />
          <YAxis allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
          <Tooltip {...tooltip} cursor={chartTooltipCursor(isDark)} />
          <Bar dataKey="equipment" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaBreakdownChart({
  byArea,
  byRegion,
}: {
  byArea: AreaAggregate[];
  byRegion: RegionAggregate[];
}) {
  const [mode, setMode] = useState<'territory' | 'region'>('territory');

  const territoryData = byArea.map((a) => ({ name: a.area, equipment: a.equipment }));
  const regionData = byRegion.map((r) => ({ name: r.region, equipment: r.equipment }));
  const chartData = mode === 'territory' ? territoryData : regionData;

  if (!territoryData.length && !regionData.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No territory or region data.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setMode('territory')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'territory'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          By territory
        </button>
        <button
          type="button"
          onClick={() => setMode('region')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'region'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          By region
        </button>
      </div>

      {chartData.length ? (
        <EquipmentBarChart data={chartData} />
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          No equipment data for this {mode === 'territory' ? 'territory' : 'region'} view.
        </p>
      )}
    </div>
  );
}
