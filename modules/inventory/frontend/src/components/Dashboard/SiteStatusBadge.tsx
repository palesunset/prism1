import type { CSSProperties } from 'react';
import { useTheme } from '@/context/ThemeContext';

type StatusKey = 'Active' | 'No match' | 'Inactive';

type StatusStyle = CSSProperties & { dotColor: string };

const DARK: Record<StatusKey, StatusStyle> = {
  Active: {
    background: '#1a1f26',
    color: '#ffffff',
    borderColor: '#355a66',
    dotColor: '#4caf50',
  },
  'No match': {
    background: '#1a1f26',
    color: '#ffffff',
    borderColor: '#355a66',
    dotColor: '#f0ad4e',
  },
  Inactive: {
    background: '#1a1f26',
    color: '#cbd5e1',
    borderColor: '#355a66',
    dotColor: '#6b8a94',
  },
};

const LIGHT: Record<StatusKey, StatusStyle> = {
  Active: {
    background: '#059669',
    color: '#ffffff',
    borderColor: '#047857',
    dotColor: '#ffffff',
  },
  'No match': {
    background: '#d97706',
    color: '#ffffff',
    borderColor: '#b45309',
    dotColor: '#ffffff',
  },
  Inactive: {
    background: '#e2e8f0',
    color: '#334155',
    borderColor: '#94a3b8',
    dotColor: '#64748b',
  },
};

function resolveKey(status: string): StatusKey {
  if (status === 'Active') return 'Active';
  if (status === 'No match') return 'No match';
  return 'Inactive';
}

export function SiteStatusBadge({ status }: { status: string }) {
  const { theme } = useTheme();
  const { dotColor, ...colors } = (theme === 'light' ? LIGHT : DARK)[resolveKey(status)];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={colors}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
      {status}
    </span>
  );
}
