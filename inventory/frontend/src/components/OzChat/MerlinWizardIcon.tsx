import { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface EyePosition {
  x: number;
  y: number;
}

/** Unique id prefix so multiple icons on screen don't clash on gradients. */
export function MerlinWizardIcon({
  size = 48,
  eyePosition = { x: 0, y: 0 },
  isBlinking = false,
  isSpeaking = false,
  isTyping = false,
  isHovered = false,
  reduceMotion = false,
  muted = false,
  className,
}: {
  size?: number;
  eyePosition?: EyePosition;
  isBlinking?: boolean;
  isSpeaking?: boolean;
  isTyping?: boolean;
  isHovered?: boolean;
  reduceMotion?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const shift = { x: eyePosition.x * 0.6, y: eyePosition.y * 0.6 };
  const eyeRx = 7.5;
  const eyeRyOpen = 9;
  const eyeRy = reduceMotion ? eyeRyOpen : isBlinking ? 1 : eyeRyOpen;

  const hat = muted ? '#4a5568' : '#355a66';
  const hatBrim = muted ? '#2d3748' : '#111';
  const accent = muted ? '#9ca3af' : '#e06c75';
  const sparkle = muted ? '#9ca3af' : '#9cdef2';

  const smilePath = 'M 40 64 Q 50 69 60 64';
  const smileTypingPath = 'M 40 64 Q 50 71 60 64';
  const smileSpeakingPaths = [
    'M 38 65 Q 50 73 62 65',
    'M 38 67 Q 50 70 62 67',
    'M 38 65 Q 50 73 62 65',
  ] as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-hat`} x1="50" y1="8" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={muted ? '#718096' : '#4a7080'} />
          <stop offset="100%" stopColor={hat} />
        </linearGradient>
      </defs>

      {/* Soft wizard hat — curved, not a sharp triangle */}
      <path
        d="M 50 10 C 58 10 66 28 70 36 L 30 36 C 34 28 42 10 50 10 Z"
        fill={`url(#${uid}-hat)`}
      />
      <ellipse cx="50" cy="36" rx="26" ry="5.5" fill={hatBrim} />
      <rect x="28" y="32" width="44" height="3.5" rx="1.5" fill={accent} opacity={0.85} />

      {/* Fluffy beard — one simple shape */}
      <ellipse cx="50" cy="78" rx="22" ry="14" fill={muted ? '#a0aec0' : '#d4cfc6'} opacity={0.95} />
      <ellipse cx="50" cy="72" rx="18" ry="10" fill={muted ? '#718096' : '#e8c4a0'} />

      {/* Face */}
      <circle cx="50" cy="56" r="24" fill={muted ? '#9ca3af' : '#e8c4a0'} />

      {/* Eyes — large & friendly (reads well at 48px) */}
      <g transform={`translate(${shift.x}, ${shift.y})`}>
        <motion.ellipse
          cx="38"
          cy="52"
          rx={eyeRx}
          ry={eyeRy}
          fill="white"
          initial={{ ry: eyeRyOpen }}
          animate={reduceMotion ? { ry: eyeRyOpen } : { ry: eyeRy }}
          transition={{ duration: 0.06 }}
        />
        <circle
          cx={38 + eyePosition.x * 0.12}
          cy={52 + eyePosition.y * 0.12}
          r="3.5"
          fill={hatBrim}
        />
        <circle cx="39.5" cy="50.5" r="1.3" fill="white" opacity={0.9} />
      </g>

      <g transform={`translate(${shift.x}, ${shift.y})`}>
        <motion.ellipse
          cx="62"
          cy="52"
          rx={eyeRx}
          ry={eyeRy}
          fill="white"
          initial={{ ry: eyeRyOpen }}
          animate={reduceMotion ? { ry: eyeRyOpen } : { ry: eyeRy }}
          transition={{ duration: 0.06 }}
        />
        <circle
          cx={62 + eyePosition.x * 0.12}
          cy={52 + eyePosition.y * 0.12}
          r="3.5"
          fill={hatBrim}
        />
        <circle cx="63.5" cy="50.5" r="1.3" fill="white" opacity={0.9} />
      </g>

      {/* Gentle smile */}
      <motion.path
        fill="none"
        stroke={hatBrim}
        strokeWidth="2.5"
        strokeLinecap="round"
        d={smilePath}
        initial={{ d: smilePath }}
        animate={
          reduceMotion
            ? { d: smilePath }
            : isTyping
              ? isSpeaking
                ? { d: [...smileSpeakingPaths] }
                : { d: smileTypingPath }
              : { d: smilePath }
        }
        transition={{
          duration: isTyping ? 0.32 : 0.2,
          repeat: isTyping && !reduceMotion ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />

      {/* Tiny star — wizard hint */}
      <path
        d="M 50 20 l 1.8 3.6 4 0.6-2.9 2.8 0.7 4-3.6-1.9-3.6 1.9 0.7-4-2.9-2.8 4-0.6 Z"
        fill={accent}
        opacity={muted ? 0.4 : 0.95}
      />

      <AnimatePresence>
        {isHovered && !reduceMotion && !muted ? (
          <>
            <motion.circle
              cx="18"
              cy="48"
              r="2"
              fill={sparkle}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0.4, 1, 0.4], scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.circle
              cx="82"
              cy="44"
              r="1.5"
              fill={accent}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0.3, 0.9, 0.3], scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
            />
          </>
        ) : null}
      </AnimatePresence>
    </svg>
  );
}
