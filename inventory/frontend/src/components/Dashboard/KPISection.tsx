import { MapPin, Server, Plug, Gauge, CircleCheck, CalendarClock } from 'lucide-react';
import { KPICard } from './KPICard';
import type { DashboardKpis } from '@/types/dashboard';

export function KPISection({ data }: { data: DashboardKpis }) {
  const utilTrend =
    data.equipmentAddedLast30Days > 0
      ? `+${data.equipmentAddedLast30Days} equipment (30d)`
      : 'No new equipment (30d)';
  const trendUp = data.equipmentAddedTrendPercent >= 0;

  return (
    <div className="kpi-grid">
      <KPICard label="Total sites" value={data.totalSites} icon={MapPin} />
      <KPICard
        label="Total equipment"
        value={data.totalEquipment}
        icon={Server}
        sparkline={data.sparklineEquipmentByMonth}
        trendLabel={`vs prior 30d: ${trendUp ? '+' : ''}${data.equipmentAddedTrendPercent}%`}
        trendUp={trendUp}
      />
      <KPICard
        label="Total ports"
        value={data.totalPorts.toLocaleString()}
        sublabel={`${data.utilizedPorts.toLocaleString()} utilized`}
        icon={Plug}
      />
      <KPICard
        label="Overall utilization"
        value={`${data.utilizationPercent.toFixed(1)}%`}
        sublabel="Utilized vs total ports"
        icon={Gauge}
        trendLabel={utilTrend}
        trendUp={data.utilizationPercent >= 50 ? true : data.utilizationPercent > 0 ? null : false}
      />
      <KPICard label="Active equipment" value={data.activeEquipment} icon={CircleCheck} />
      <KPICard label="EOL this year" value={data.eolThisYear} icon={CalendarClock} />
    </div>
  );
}
