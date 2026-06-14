import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { chartTooltipStyle } from '@/utils/chartTheme';

export function KPICard({
  label,
  value,
  sublabel,
  icon: Icon,
  trendLabel,
  trendUp,
  sparkline,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  trendLabel?: string;
  trendUp?: boolean | null;
  sparkline?: { month: string; equipment: number }[];
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const tooltip = chartTooltipStyle(isDark);
  const chartStroke = 'var(--red)';

  return (
    <div className="kpi-card group border-slate-200 bg-white shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-900/60">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="kpi-card__label text-slate-500 dark:text-slate-400">{label}</p>
          <p className="kpi-card__value mt-1 font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">
            {value}
          </p>
          {sublabel ? (
            <p className="kpi-card__meta mt-1 break-words text-slate-500 dark:text-slate-400">{sublabel}</p>
          ) : null}
          {trendLabel ? (
            <p
              className={clsx(
                'kpi-card__meta mt-1 break-words font-medium leading-snug',
                trendUp === true && 'text-emerald-600 dark:text-emerald-400',
                trendUp === false && 'text-amber-600 dark:text-amber-400',
                trendUp == null && 'text-slate-500 dark:text-slate-400'
              )}
            >
              {trendLabel}
            </p>
          ) : null}
        </div>
        <div className="kpi-card__icon rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Icon className="kpi-card__icon-glyph" aria-hidden strokeWidth={2} />
        </div>
      </div>
      {sparkline && sparkline.length > 0 ? (
        <div className="kpi-card__sparkline mt-2 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <XAxis dataKey="month" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                {...tooltip}
                contentStyle={{ ...tooltip.contentStyle, fontSize: 12 }}
                labelFormatter={(m) => String(m)}
                formatter={(v: number) => [v, 'Equipment']}
              />
              <Line
                type="monotone"
                dataKey="equipment"
                stroke={chartStroke}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
