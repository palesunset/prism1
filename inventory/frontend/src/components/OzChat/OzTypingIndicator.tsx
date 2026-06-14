import { MerlinWizardIcon } from './MerlinWizardIcon';

export function OzTypingIndicator() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: 'linear-gradient(145deg, var(--border), var(--panel))',
          boxShadow: '0 0 0 1px var(--border)',
        }}
      >
        <MerlinWizardIcon size={28} />
      </div>
      <div
        className="rounded-2xl rounded-tl-none px-4 py-3"
        style={{
          background: 'color-mix(in srgb, var(--panel) 90%, var(--bg))',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex gap-1">
          <span
            className="h-2 w-2 animate-bounce rounded-full"
            style={{ background: 'var(--red)', animationDelay: '0ms' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full"
            style={{ background: 'var(--red)', animationDelay: '150ms' }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full"
            style={{ background: 'var(--red)', animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
