import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartGrid, chartTick, chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { TopSiteRow } from '@/types/dashboard';

export function TopSitesChart({ sites }: { sites: TopSiteRow[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);
  const tooltip = chartTooltipStyle(isDark);

  const data = [...sites]
    .sort((a, b) => a.equipmentCount - b.equipmentCount)
    .map((s) => ({
      name: s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
      equipment: s.equipmentCount,
    }));

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No sites to rank yet.</p>;
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: tick, fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fill: tick, fontSize: 11 }} />
          <Tooltip {...tooltip} cursor={chartTooltipCursor(isDark)} />
          <Bar dataKey="equipment" fill="#4f46e5" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            <LabelList dataKey="equipment" position="right" fill={tick} fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
