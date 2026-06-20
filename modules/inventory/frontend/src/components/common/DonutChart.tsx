import clsx from 'clsx';

export function DonutChart({
  value,
  total,
  label,
  className,
  valueLabel,
  totalLabel,
  extraLabel,
  extraValue,
}: {
  value: number;
  total: number;
  label: string;
  valueLabel: string;
  totalLabel: string;
  extraLabel?: string;
  extraValue?: number;
  className?: string;
}) {
  const safeTotal = total > 0 ? total : 0;
  const safeValue = Math.max(0, Math.min(value, safeTotal));
  const pct = safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;

  const bg = `conic-gradient(var(--red) ${pct}%, color-mix(in srgb, var(--border) 35%, transparent) 0)`;

  return (
    <div className={clsx('flex items-center gap-4', className)}>
      <div
        className="relative h-20 w-20 rounded-full"
        style={{ background: bg }}
        aria-label={`${label}: ${safeValue} of ${safeTotal}`}
      >
        <div
          className="absolute inset-3 rounded-full"
          style={{ background: 'var(--panel)' }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
            {pct.toFixed(0)}%
          </div>
          <div className="text-[10px]" style={{ color: 'var(--color-subheader)' }}>
            {label}
          </div>
        </div>
      </div>
      <div className="text-sm">
        <div className="font-medium" style={{ color: 'var(--fg)' }}>
          {valueLabel}: <span className="font-semibold">{safeValue}</span>
        </div>
        <div style={{ color: 'var(--color-subheader)' }}>
          {totalLabel}: <span className="font-semibold" style={{ color: 'var(--fg)' }}>{safeTotal}</span>
        </div>
        {extraLabel && typeof extraValue === 'number' && (
          <div style={{ color: 'var(--color-subheader)' }}>
            {extraLabel}: <span className="font-semibold" style={{ color: 'var(--fg)' }}>{extraValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}

