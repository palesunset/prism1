import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartTooltipCursor, chartTooltipStyle } from '@/utils/chartTheme';
import type { VendorSlice } from '@/types/dashboard';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export function VendorDonutChart({
  vendors,
  donut,
}: {
  vendors: VendorSlice[];
  donut: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const data = useMemo(
    () =>
      vendors
        .filter((v) => !hidden[v.name])
        .map((v) => ({ name: v.name, value: v.count, pctVendor: v.percent })),
    [vendors, hidden]
  );

  if (!vendors.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No vendor data yet.</p>;
  }
  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        All vendors hidden in the legend. Click a vendor name to show it again.
      </p>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={donut ? 56 : 0}
            outerRadius={88}
            paddingAngle={1}
            label={(props) => {
              const p = props as { name?: string; pctVendor?: number };
              return `${p.name ?? ''} ${(p.pctVendor ?? 0).toFixed(0)}%`;
            }}
            labelLine={false}
            stroke={isDark ? '#111' : '#faf6f0'}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} stroke={isDark ? '#111' : '#faf6f0'} />
            ))}
          </Pie>
          <Tooltip
            {...chartTooltipStyle(isDark)}
            cursor={chartTooltipCursor(isDark)}
            formatter={(value: number, _n, ctx) => {
              const row = ctx.payload as { pctVendor?: number };
              const pct = row?.pctVendor ?? 0;
              return [`${value} (${Number(pct).toFixed(1)}%)`, 'Equipment'];
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            onClick={(e) => {
              const name = (e as { value?: string }).value;
              if (!name) return;
              setHidden((h) => ({ ...h, [name]: !h[name] }));
            }}
            wrapperStyle={{ cursor: 'pointer', fontSize: 12, color: isDark ? '#e2e8f0' : '#334155' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
