import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { CHART, chartGrid, chartTick } from '@/utils/chartTheme';
import type { SiteUtilizationRow } from '@/types/dashboard';

function UtilTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload as {
    fullName?: string;
    utilized?: number;
    free?: number;
    pct?: number;
    total?: number;
  };
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        background: CHART.panel,
        borderColor: CHART.border,
        color: CHART.fg,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      <div className="font-semibold">{row.fullName}</div>
      <div className="mt-1" style={{ color: CHART.fg }}>
        {row.pct != null ? `${row.pct.toFixed(1)}% utilized` : '—'}
      </div>
      <div className="mt-1" style={{ color: CHART.muted }}>
        Utilized: {row.utilized ?? 0} · Free: {row.free ?? 0} · Total: {row.total ?? 0}
      </div>
    </div>
  );
}

export function SiteUtilizationChart({ sites }: { sites: SiteUtilizationRow[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);

  const data = sites.map((s) => ({
    name: s.name.length > 30 ? `${s.name.slice(0, 28)}…` : s.name,
    fullName: s.name,
    utilized: s.utilizedPorts,
    free: s.freePorts,
    pct: s.percent,
    total: s.totalPorts,
  }));

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No site port data to display.</p>;
  }

  const rowHeight = 34;
  const viewportMaxPx = 520;
  const chartHeight = Math.max(280, data.length * rowHeight);
  const yAxisWidth = Math.min(
    220,
    Math.max(140, Math.ceil(Math.max(...data.map((d) => d.name.length), 10) * 6.5))
  );
  const tickFontSize = data.length > 28 ? 10 : 11;
  const barThickness = Math.min(22, Math.max(14, rowHeight - 12));

  return (
    <div className="w-full">
      <div
        className="overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200/70 dark:border-slate-700/70"
        style={{ maxHeight: viewportMaxPx }}
      >
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 8, right: 48, left: 4, bottom: 8 }}
              barCategoryGap={6}
              barSize={barThickness}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
              <XAxis type="number" tick={{ fill: tick, fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={yAxisWidth}
                tick={{ fill: tick, fontSize: tickFontSize }}
                interval={0}
              />
              <Tooltip content={<UtilTooltip />} cursor={{ fill: 'rgba(224, 108, 117, 0.12)' }} />
              <Legend wrapperStyle={{ color: tick, fontSize: 12 }} />
              <Bar dataKey="utilized" stackId="a" fill="#f59e0b" name="Utilized" isAnimationActive={false} />
              <Bar dataKey="free" stackId="a" fill="#10b981" name="Free" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Hover a bar for utilization % and port counts. Sites with no ports show as zero-length bars.
        {data.length > 12 ? ' Scroll the chart to see all sites.' : ''}
      </p>
    </div>
  );
}
