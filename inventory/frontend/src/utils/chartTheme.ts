/** Shared Recharts styling aligned with the Odysseus theme tokens. */

export const CHART = {
  panel: '#111',
  bg: '#282c34',
  border: '#355a66',
  fg: '#9cdef2',
  muted: '#6b8a94',
  accent: '#e06c75',
  gridDark: '#355a66',
  gridLight: '#d4cdc2',
  tickDark: '#6b8a94',
  tickLight: '#7a7268',
} as const;

export function chartGrid(isDark: boolean) {
  return isDark ? CHART.gridDark : CHART.gridLight;
}

export function chartTick(isDark: boolean) {
  return isDark ? CHART.tickDark : CHART.tickLight;
}

/** Tooltip panel — readable text on dark background. */
export function chartTooltipStyle(isDark: boolean) {
  return {
    contentStyle: {
      background: isDark ? CHART.panel : '#faf6f0',
      border: `1px solid ${isDark ? CHART.border : CHART.gridLight}`,
      borderRadius: 8,
      color: isDark ? CHART.fg : '#2b2b2b',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    },
    labelStyle: {
      color: isDark ? CHART.fg : '#2b2b2b',
      fontWeight: 600,
    },
    itemStyle: {
      color: isDark ? CHART.fg : '#5a5248',
    },
  };
}

/** Subtle hover band behind bars — not white. */
export function chartTooltipCursor(isDark: boolean) {
  return {
    fill: isDark ? 'rgba(224, 108, 117, 0.12)' : 'rgba(196, 125, 90, 0.15)',
  };
}
