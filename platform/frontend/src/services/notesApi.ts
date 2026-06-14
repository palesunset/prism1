export type NoteItem = { text: string; done?: boolean };

export type Note = {
  id: string;
  owner?: string;
  title: string;
  content: string | null;
  items: NoteItem[] | null;
  note_type: 'note' | 'checklist' | string;
  color: string | null;
  label: string | null;
  pinned: boolean;
  archived: boolean;
  due_date: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

const BASE = '/api/notes';

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(String((err as { detail?: string }).detail ?? res.statusText));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function fetchNotes(archived = false): Promise<Note[]> {
  const q = archived ? '?archived=true' : '';
  const data = await parseJson<{ notes: Note[] }>(await fetch(`${BASE}${q}`));
  return data.notes;
}

export async function createNote(payload: Partial<Note>): Promise<Note> {
  return parseJson<Note>(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateNote(id: string, payload: Partial<Note>): Promise<Note> {
  return parseJson<Note>(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteNote(id: string): Promise<void> {
  await parseJson<void>(await fetch(`${BASE}/${id}`, { method: 'DELETE' }));
}

export async function togglePin(id: string): Promise<Note> {
  return parseJson<Note>(await fetch(`${BASE}/${id}/pin`, { method: 'POST' }));
}

export async function toggleArchive(id: string): Promise<Note> {
  return parseJson<Note>(await fetch(`${BASE}/${id}/archive`, { method: 'POST' }));
}

export async function toggleChecklistItem(id: string, index: number): Promise<Note> {
  return parseJson<Note>(await fetch(`${BASE}/${id}/items/${index}/toggle`, { method: 'POST' }));
}

export const NOTE_COLORS = [
  { id: 'default', className: 'bg-slate-800/90 border-slate-600' },
  { id: 'amber', className: 'bg-amber-950/80 border-amber-700/50' },
  { id: 'cyan', className: 'bg-cyan-950/80 border-cyan-700/50' },
  { id: 'emerald', className: 'bg-emerald-950/80 border-emerald-700/50' },
  { id: 'violet', className: 'bg-violet-950/80 border-violet-700/50' },
  { id: 'rose', className: 'bg-rose-950/80 border-rose-700/50' },
] as const;

export const DEFAULT_NOTE_COLOR = 'amber';
export const DEFAULT_TODO_COLOR = 'emerald';

export function defaultColorForType(noteType: Note['note_type']): string {
  return noteType === 'checklist' ? DEFAULT_TODO_COLOR : DEFAULT_NOTE_COLOR;
}

export function noteColorClass(
  color: string | null | undefined,
  noteType: Note['note_type'] = 'note',
): string {
  const effective =
    color && color !== 'default' ? color : defaultColorForType(noteType);
  return NOTE_COLORS.find((c) => c.id === effective)?.className ?? NOTE_COLORS[1].className;
}

export function noteAccentClass(noteType: Note['note_type']): string {
  return noteType === 'checklist' ? 'text-emerald-400' : 'text-amber-400';
}
