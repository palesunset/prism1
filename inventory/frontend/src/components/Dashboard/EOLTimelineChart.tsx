import { useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { parseISO, format } from 'date-fns';
import { useTheme } from '@/context/ThemeContext';
import { chartGrid, chartTick, chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { EolPoint } from '@/types/dashboard';

function fmtMonth(ym: string) {
  try {
    return format(parseISO(`${ym}-01`), 'MMM yyyy');
  } catch {
    return ym;
  }
}

export function EOLTimelineChart({ points }: { points: EolPoint[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);
  const tooltip = chartTooltipStyle(isDark);
  const [show, setShow] = useState<'both' | 'count' | 'cumulative'>('both');

  const data = points.map((p) => ({
    ...p,
    label: fmtMonth(p.month),
  }));

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No EOL data in the next 12 months.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {(['both', 'count', 'cumulative'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setShow(m)}
            className={`rounded-lg px-3 py-1 text-xs font-medium capitalize ${
              show === m
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
            }`}
          >
            {m === 'both' ? 'Bar + line' : m}
          </button>
        ))}
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="label" tick={{ fill: tick, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
            <YAxis yAxisId="left" allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
            <Tooltip {...tooltip} cursor={chartTooltipCursor(isDark)} />
            <Legend wrapperStyle={{ color: tick, fontSize: 12 }} />
            {(show === 'both' || show === 'count') && (
              <Bar yAxisId="left" dataKey="count" name="EOL this month" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            )}
            {(show === 'both' || show === 'cumulative') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                name="Cumulative EOL"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
