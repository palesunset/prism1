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
  Treemap,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartGrid, chartTick, chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { AreaAggregate, TreemapNode } from '@/types/dashboard';

const AREA_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export function AreaBreakdownChart({
  byArea,
  treemap,
}: {
  byArea: AreaAggregate[];
  treemap: TreemapNode[];
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);
  const tooltip = chartTooltipStyle(isDark);
  const [mode, setMode] = useState<'bar' | 'treemap'>('bar');

  const barData = byArea.map((a) => ({ name: a.area, equipment: a.equipment }));

  if (!barData.length && !treemap.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No territory or region data.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setMode('bar')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'bar'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          By territory
        </button>
        <button
          type="button"
          onClick={() => setMode('treemap')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'treemap'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          Treemap
        </button>
      </div>

      {mode === 'bar' ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: tick, fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
              <Tooltip {...tooltip} cursor={chartTooltipCursor(isDark)} />
              <Bar dataKey="equipment" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemap}
              dataKey="count"
              nameKey="name"
              stroke={isDark ? '#111' : '#faf6f0'}
              fill="#6366f1"
              aspectRatio={4 / 3}
              isAnimationActive={false}
            >
              <Tooltip
                {...tooltip}
                formatter={(v: number, _n, ctx) => {
                  const p = ctx.payload as TreemapNode;
                  return [`${v} equipment`, `${p.region} · ${p.area}`];
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
