import { useToastContext } from '@/context/ToastContext';
import { X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, dismiss } = useToastContext();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start justify-between gap-2 rounded-lg border px-3 py-2 shadow-lg"
          style={{
            borderColor: t.kind === 'success' ? 'var(--green)' : 'var(--color-error)',
            background:
              t.kind === 'success'
                ? 'color-mix(in srgb, var(--green) 12%, var(--panel))'
                : 'color-mix(in srgb, var(--color-error) 12%, var(--panel))',
            color: 'var(--fg)',
          }}
        >
          <p className="text-sm">{t.message}</p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
