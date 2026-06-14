const SUGGESTIONS = [
  'Inventory overview',
  'How many sites?',
  'Router type counts',
  'Vendor distribution',
  'Show P routers',
  'Port utilization by site',
  'EOL this year',
];

export function OzSuggestions({ onSelect }: { onSelect: (suggestion: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
