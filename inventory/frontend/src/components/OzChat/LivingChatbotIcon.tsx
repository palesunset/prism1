import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MerlinWizardIcon, type EyePosition } from './MerlinWizardIcon';

export type { EyePosition };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Floating Merlin-style wizard face: idle eyes, cursor follow on hover, blink,
 * notification glance, breathing, and mouth motion while the bot is typing.
 */
export function LivingChatbotIcon({
  isTyping = false,
  hasNotification = false,
  notificationGlanceKey = 0,
  muted = false,
  showSpeechBubble = false,
  onClick,
  size = 48,
  className,
  'aria-label': ariaLabel,
}: {
  isTyping?: boolean;
  hasNotification?: boolean;
  notificationGlanceKey?: number;
  muted?: boolean;
  showSpeechBubble?: boolean;
  onClick?: () => void;
  size?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [idleEye, setIdleEye] = useState<EyePosition>({ x: 0, y: 0 });
  const [cursorEye, setCursorEye] = useState<EyePosition>({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [glanceBlend, setGlanceBlend] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMouseRef = useRef<{ x: number; y: number } | null>(null);
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glanceTarget: EyePosition = { x: 9, y: -7 };

  useEffect(() => {
    if (reduceMotion || isHovered) return;

    let cancelled = false;

    const arm = () => {
      if (cancelled) return;
      idleTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        const randomX = (Math.random() - 0.5) * 12;
        const randomY = (Math.random() - 0.5) * 8;
        setIdleEye({ x: randomX, y: randomY });
        idleTimeoutRef.current = setTimeout(() => {
          if (!cancelled && !isHoveredRef.current) setIdleEye({ x: 0, y: 0 });
          arm();
        }, 1200);
      }, 3000 + Math.random() * 5000);
    };

    arm();
    return () => {
      cancelled = true;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [reduceMotion, isHovered]);

  useEffect(() => {
    if (reduceMotion) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 120);
        scheduleBlink();
      }, 4000 + Math.random() * 2000);
    };

    scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      setIsSpeaking(false);
      return;
    }
    if (!isTyping) {
      setIsSpeaking(false);
      return;
    }
    const speakInterval = setInterval(() => {
      setIsSpeaking((prev) => !prev);
    }, 280);
    return () => clearInterval(speakInterval);
  }, [isTyping, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || notificationGlanceKey === 0) return;

    let cancelled = false;
    const steps = [
      { t: 0, v: 0 },
      { t: 90, v: 1 },
      { t: 700, v: 1 },
      { t: 1100, v: 0 },
    ];
    const start = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      let v = 0;
      for (let i = 0; i < steps.length - 1; i++) {
        const a = steps[i];
        const b = steps[i + 1];
        if (elapsed >= b.t) {
          v = b.v;
          continue;
        }
        if (elapsed >= a.t && elapsed < b.t) {
          const u = (elapsed - a.t) / (b.t - a.t);
          v = a.v + (b.v - a.v) * (0.5 - 0.5 * Math.cos(Math.PI * u));
          break;
        }
      }
      setGlanceBlend(v);
      if (elapsed < steps[steps.length - 1].t + 50) {
        requestAnimationFrame(tick);
      } else {
        setGlanceBlend(0);
      }
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [notificationGlanceKey, reduceMotion]);

  const applyCursor = useCallback(() => {
    const el = containerRef.current;
    const pending = pendingMouseRef.current;
    if (!el || !pending) return;

    const rect = el.getBoundingClientRect();
    const iconCenterX = rect.left + rect.width / 2;
    const iconCenterY = rect.top + rect.height / 2;
    const angle = Math.atan2(pending.y - iconCenterY, pending.x - iconCenterX);
    const distance = Math.min(48, Math.hypot(pending.x - iconCenterX, pending.y - iconCenterY));
    const eyeX = Math.cos(angle) * Math.min(8, distance / 8);
    const eyeY = Math.sin(angle) * Math.min(5, distance / 10);
    setCursorEye({ x: eyeX, y: eyeY });
    pendingMouseRef.current = null;
  }, []);

  useEffect(() => {
    if (!isHovered || reduceMotion) {
      setCursorEye({ x: 0, y: 0 });
      return;
    }

    const onMove = (e: MouseEvent) => {
      pendingMouseRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyCursor();
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isHovered, reduceMotion, applyCursor]);

  const idleOrCursor: EyePosition = isHovered ? cursorEye : idleEye;
  const glanceX = glanceTarget.x * glanceBlend;
  const glanceY = glanceTarget.y * glanceBlend;
  const eyePosition: EyePosition = {
    x: clamp(idleOrCursor.x + glanceX, -10, 10),
    y: clamp(idleOrCursor.y + glanceY, -6, 6),
  };

  return (
    <motion.div
      ref={containerRef}
      className={`relative cursor-pointer select-none ${className ?? ''}`}
      style={{ width: size, height: size }}
      animate={
        reduceMotion
          ? { scale: 1, rotate: 0 }
          : {
              scale: isHovered ? [1, 1.05, 1.02] : [1, 1.02, 1],
              rotate: isHovered ? [0, -3, 3, -2, 0] : 0,
            }
      }
      transition={{
        scale: reduceMotion
          ? { duration: 0 }
          : { duration: isHovered ? 0.35 : 3.2, repeat: isHovered ? 0 : Infinity, ease: 'easeInOut' },
        rotate: { duration: 0.45, ease: 'easeInOut' },
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => {
        setIsHovered(false);
        setCursorEye({ x: 0, y: 0 });
      }}
      onClick={onClick}
      whileTap={onClick && !reduceMotion ? { scale: 0.95 } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={ariaLabel}
      aria-hidden={onClick ? undefined : true}
    >
      {!reduceMotion && !muted ? (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full blur-xl motion-reduce:opacity-0"
          style={{
            background: 'radial-gradient(circle, color-mix(in srgb, var(--red) 35%, transparent) 0%, transparent 70%)',
            opacity: 0.35,
          }}
          aria-hidden
          animate={{ scale: [1, 1.08, 1], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}

      <motion.div
        className="relative flex items-center justify-center rounded-full shadow-2xl"
        style={{
          width: size,
          height: size,
          background: muted
            ? 'linear-gradient(145deg, #4a5568, #2d3748)'
            : 'linear-gradient(145deg, var(--border) 0%, var(--panel) 55%, var(--bg) 100%)',
          boxShadow: muted
            ? '0 10px 25px rgba(0,0,0,0.2)'
            : '0 10px 28px rgba(0,0,0,0.4), 0 0 0 1px var(--border)',
        }}
        animate={
          reduceMotion
            ? undefined
            : {
                boxShadow: isHovered
                  ? '0 16px 36px color-mix(in srgb, var(--red) 35%, transparent), 0 0 0 2px var(--red)'
                  : '0 10px 28px rgba(0,0,0,0.4), 0 0 0 1px var(--border)',
              }
        }
        transition={{ duration: 0.25 }}
      >
        <AnimatePresence>
          {hasNotification ? (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute -right-0.5 -top-0.5 z-10 h-3.5 w-3.5 rounded-full border-2 bg-red-500"
              style={{ borderColor: 'var(--panel)' }}
              aria-hidden
            >
              <motion.div
                className="h-full w-full rounded-full bg-red-500"
                animate={reduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <MerlinWizardIcon
          size={size * 0.92}
          eyePosition={eyePosition}
          isBlinking={isBlinking}
          isSpeaking={isSpeaking}
          isTyping={isTyping}
          isHovered={isHovered}
          reduceMotion={reduceMotion}
          muted={muted}
        />

        <AnimatePresence>
          {hasNotification && !reduceMotion ? (
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-red-400"
              initial={{ scale: 1, opacity: 0.9 }}
              animate={{ scale: 1.45, opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
              aria-hidden
            />
          ) : null}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showSpeechBubble && isHovered ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: -8, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.92 }}
            className="pointer-events-none absolute -top-11 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-white shadow-lg"
            style={{ background: 'var(--panel)' }}
            role="tooltip"
          >
            Need help?
            <div
              className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45"
              style={{ background: 'var(--panel)' }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
