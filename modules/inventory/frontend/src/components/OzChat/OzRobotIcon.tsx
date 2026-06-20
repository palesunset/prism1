export interface OzRobotIconProps {
  className?: string;
  /** Softer look when the chat panel is open. */
  variant?: 'default' | 'muted';
}

/**
 * Standalone robot mark (no circular FAB background) — uses currentColor for
 * the body; white is used for face contrast on sky / slate text colors.
 */
export function OzRobotIcon({ className, variant = 'default' }: OzRobotIconProps) {
  const faceOpacity = variant === 'muted' ? 0.12 : 0.15;
  const earOpacity = variant === 'muted' ? 0.5 : 0.7;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="2" y="12" width="3" height="8" rx="1.5" fill="currentColor" fillOpacity={earOpacity} />
      <rect x="27" y="12" width="3" height="8" rx="1.5" fill="currentColor" fillOpacity={earOpacity} />

      <line x1="8" y1="10" x2="8" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="3.5" r="2" fill="currentColor" />

      <line x1="24" y1="10" x2="24" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="3.5" r="2" fill="currentColor" />

      <rect x="5" y="10" width="22" height="16" rx="5" fill="currentColor" />

      <rect x="7" y="12" width="18" height="11" rx="3" fill="#ffffff" fillOpacity={faceOpacity} />

      <circle cx="12" cy="17" r="2.5" fill="#ffffff" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />

      <circle cx="20" cy="17" r="2.5" fill="#ffffff" />
      <circle cx="20" cy="17" r="1" fill="currentColor" />

      <path
        d="M12 23.5C13 24.5 15 25 16 25C17 25 19 24.5 20 23.5"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        strokeOpacity={0.9}
      />

      <circle cx="9" cy="20" r="1.5" fill="#ff6b6b" fillOpacity={0.35} />
      <circle cx="23" cy="20" r="1.5" fill="#ff6b6b" fillOpacity={0.35} />
    </svg>
  );
}
