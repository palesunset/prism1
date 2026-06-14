import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartGrid, chartTick, chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { StatusSlice } from '@/types/dashboard';

function colorFor(status: string) {
  const s = status.trim();
  const map: Record<string, string> = {
    Active: '#10b981',
    Decommissioned: '#6b7280',
    Maintenance: '#f59e0b',
    Spare: '#3b82f6',
  };
  return map[s] || '#6366f1';
}

export function StatusBarChart({ statuses }: { statuses: StatusSlice[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);
  const tooltip = chartTooltipStyle(isDark);

  const data = statuses.map((s) => ({
    status: s.status,
    count: s.count,
    fill: colorFor(s.status),
  }));

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No equipment status data.</p>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="status" tick={{ fill: tick, fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
          <Tooltip {...tooltip} cursor={chartTooltipCursor(isDark)} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
            <LabelList dataKey="count" position="top" fill={tick} fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
