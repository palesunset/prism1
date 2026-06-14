import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

type Option = { value: string; label?: string };

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  placeholder = 'All',
  className,
}: {
  label: string;
  options: Array<Option | string>;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const normalized = useMemo<Option[]>(
    () =>
      options.map((o) =>
        typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }
      ),
    [options]
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = useMemo(() => new Set(value), [value]);
  const selectedCount = value.length;
  const buttonText = selectedCount ? `${selectedCount} selected` : placeholder;

  function toggle(v: string) {
    const next = new Set(value);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  }

  function clear() {
    onChange([]);
  }

  return (
    <div ref={rootRef} className={clsx('relative min-w-[140px] flex-1', className)}>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field w-full text-left"
      >
        {buttonText}
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCount ? `${selectedCount} selected` : 'None selected'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="text-xs text-slate-600 hover:underline dark:text-slate-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-600 hover:underline dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto pr-1">
            {normalized.length === 0 ? (
              <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">No options</p>
            ) : (
              <ul className="space-y-1">
                {normalized.map((o) => (
                  <li key={o.value}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <input
                        type="checkbox"
                        className="rounded border-slate-400"
                        checked={selected.has(o.value)}
                        onChange={() => toggle(o.value)}
                      />
                      <span className="truncate">{o.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

