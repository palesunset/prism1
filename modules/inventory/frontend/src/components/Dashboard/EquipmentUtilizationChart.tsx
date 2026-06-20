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
import type { EquipmentUtilizationRow } from '@/types/dashboard';

function UtilTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload as {
    fullLabel?: string;
    serialNumber?: string | null;
    vendor?: string;
    routerType?: string | null;
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
      <div className="font-semibold">{row.fullLabel}</div>
      {row.serialNumber ? (
        <div className="mt-0.5 text-slate-400">Serial: {row.serialNumber}</div>
      ) : null}
      {row.vendor ? (
        <div className="mt-0.5 text-slate-400">
          {row.vendor}
          {row.routerType ? ` · ${row.routerType}` : ''}
        </div>
      ) : null}
      <div className="mt-1" style={{ color: CHART.fg }}>
        {row.pct != null ? `${row.pct.toFixed(1)}% utilized` : '—'}
      </div>
      <div className="mt-1" style={{ color: CHART.muted }}>
        Utilized: {row.utilized ?? 0} · Free: {row.free ?? 0} · Total: {row.total ?? 0}
      </div>
    </div>
  );
}

export function EquipmentUtilizationChart({ equipment }: { equipment: EquipmentUtilizationRow[] }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const grid = chartGrid(isDark);
  const tick = chartTick(isDark);

  const data = equipment.map((e) => ({
    name: e.networkElement.length > 36 ? `${e.networkElement.slice(0, 34)}…` : e.networkElement,
    fullLabel: e.networkElement,
    serialNumber: e.serialNumber,
    vendor: e.vendor,
    routerType: e.routerType,
    utilized: e.utilizedPorts,
    free: e.freePorts,
    pct: e.percent,
    total: e.totalPorts,
  }));

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No equipment with port data at this site.
      </p>
    );
  }

  const rowHeight = 34;
  const viewportMaxPx = 520;
  const chartHeight = Math.max(240, data.length * rowHeight);
  const yAxisWidth = Math.min(
    260,
    Math.max(160, Math.ceil(Math.max(...data.map((d) => d.name.length), 10) * 6.5))
  );
  const tickFontSize = data.length > 20 ? 10 : 11;
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
        Hover a bar for utilization % and port counts. Equipment with no ports show as zero-length bars.
        {data.length > 8 ? ' Scroll the chart to see all equipment.' : ''}
      </p>
    </div>
  );
}
