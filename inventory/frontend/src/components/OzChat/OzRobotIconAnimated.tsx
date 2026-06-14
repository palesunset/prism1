export interface OzRobotIconAnimatedProps {
  className?: string;
  variant?: 'default' | 'muted';
}

/**
 * Same robot as {@link OzRobotIcon} with subtle blink / float / antenna pulse.
 * Optional alternative for the FAB.
 */
export function OzRobotIconAnimated({ className, variant = 'default' }: OzRobotIconAnimatedProps) {
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
      <style>
        {`
          @keyframes oz-blink {
            0%, 48%, 52%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.08); }
          }
          @keyframes oz-antenna-pulse {
            0%, 100% { opacity: 0.65; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes oz-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          .oz-robot-float { animation: oz-float 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          .oz-robot-eye { animation: oz-blink 4.2s infinite; transform-box: fill-box; transform-origin: 12px 17px; }
          .oz-robot-eye-right { transform-origin: 20px 17px; animation-delay: 0.05s; }
          .oz-antenna-dot { animation: oz-antenna-pulse 2.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
          .oz-antenna-dot-right { animation-delay: 0.35s; }
          @media (prefers-reduced-motion: reduce) {
            .oz-robot-float, .oz-robot-eye, .oz-antenna-dot { animation: none !important; }
          }
        `}
      </style>

      <g className="oz-robot-float">
        <rect x="2" y="12" width="3" height="8" rx="1.5" fill="currentColor" fillOpacity={earOpacity} />
        <rect x="27" y="12" width="3" height="8" rx="1.5" fill="currentColor" fillOpacity={earOpacity} />

        <line x1="8" y1="10" x2="8" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="3.5" r="2" fill="currentColor" className="oz-antenna-dot" />

        <line x1="24" y1="10" x2="24" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="3.5" r="2" fill="currentColor" className="oz-antenna-dot oz-antenna-dot-right" />

        <rect x="5" y="10" width="22" height="16" rx="5" fill="currentColor" />

        <rect x="7" y="12" width="18" height="11" rx="3" fill="#ffffff" fillOpacity={faceOpacity} />

        <g className="oz-robot-eye">
          <circle cx="12" cy="17" r="2.5" fill="#ffffff" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </g>
        <g className="oz-robot-eye oz-robot-eye-right">
          <circle cx="20" cy="17" r="2.5" fill="#ffffff" />
          <circle cx="20" cy="17" r="1" fill="currentColor" />
        </g>

        <path
          d="M12 23.5C13 24.5 15 25 16 25C17 25 19 24.5 20 23.5"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeOpacity={0.9}
        />

        <circle cx="9" cy="20" r="1.5" fill="#ff6b6b" fillOpacity={0.3} />
        <circle cx="23" cy="20" r="1.5" fill="#ff6b6b" fillOpacity={0.3} />
      </g>
    </svg>
  );
}
