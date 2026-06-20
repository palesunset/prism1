import { Loader2 } from 'lucide-react';
import { LivingChatbotIcon } from './LivingChatbotIcon';

type OzFabStatus = 'loading' | 'ready' | 'error';

export function OzFloatingButton({
  status,
  onClick,
  isOpen,
  isTyping = false,
  hasNotification = false,
  notificationGlanceKey = 0,
}: {
  status: OzFabStatus;
  onClick: () => void;
  isOpen: boolean;
  isTyping?: boolean;
  hasNotification?: boolean;
  notificationGlanceKey?: number;
}) {
  const dotClass =
    status === 'loading'
      ? 'bg-yellow-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-green-500';

  const tooltip =
    status === 'loading'
      ? 'Oz is waking up… (loading AI model)'
      : status === 'error'
        ? 'Oz is offline. Run: npm run download-model'
        : 'Chat with Oz';

  const handleClick = () => {
    if (status === 'error') {
      window.alert(
        'Oz AI model not found or failed to load. From the backend folder run: npm run download-model'
      );
      return;
    }
    onClick();
  };

  const muted = status === 'error';

  return (
    <div className="group fixed bottom-6 right-6 z-50">
      <div
        className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 dark:bg-slate-700"
        role="tooltip"
      >
        {tooltip}
        <div
          className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-700"
          aria-hidden
        />
      </div>

      <div className="relative inline-flex">
        {status === 'ready' && !isOpen ? (
          <div
            className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full blur-2xl motion-safe:animate-pulse"
            style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--red) 30%, transparent) 0%, transparent 70%)' }}
            aria-hidden
          />
        ) : null}

        {status === 'error' ? (
          <div
            className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-red-400/15 blur-2xl dark:bg-red-500/15"
            aria-hidden
          />
        ) : null}

        <button
          type="button"
          onClick={handleClick}
          aria-label={tooltip}
          className={`relative flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl p-1 transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
            isOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <LivingChatbotIcon
            size={48}
            isTyping={isTyping}
            hasNotification={hasNotification}
            notificationGlanceKey={notificationGlanceKey}
            muted={muted}
            showSpeechBubble={false}
            className={
              status === 'error'
                ? 'opacity-70'
                : status === 'loading'
                  ? 'opacity-80'
                  : isOpen
                    ? 'opacity-60'
                    : undefined
            }
          />

          {status === 'loading' ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--red)' }} />
            </div>
          ) : null}
        </button>

        <span
          className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white shadow-md dark:border-slate-900 ${dotClass} ${
            status === 'ready' || status === 'error' ? 'motion-safe:animate-pulse' : ''
          }`}
          aria-hidden
        />
      </div>
    </div>
  );
}
