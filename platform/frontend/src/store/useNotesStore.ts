import { create } from 'zustand';
import type { Note } from '../services/notesApi';
import * as api from '../services/notesApi';

type NotesState = {
  panelOpen: boolean;
  loading: boolean;
  error: string | null;
  notes: Note[];
  showArchived: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setShowArchived: (v: boolean) => void;
  refresh: () => Promise<void>;
  addQuickNote: (title: string, content: string) => Promise<void>;
  addQuickTodo: (title: string, itemLines: string[]) => Promise<void>;
  saveNote: (id: string, patch: Partial<Note>) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  pinNote: (id: string) => Promise<void>;
  archiveNote: (id: string) => Promise<void>;
  toggleItem: (id: string, index: number) => Promise<void>;
};

export const useNotesStore = create<NotesState>((set, get) => ({
  panelOpen: false,
  loading: false,
  error: null,
  notes: [],
  showArchived: false,

  openPanel: () => {
    set({ panelOpen: true });
    void get().refresh();
  },
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => {
    const next = !get().panelOpen;
    set({ panelOpen: next });
    if (next) void get().refresh();
  },

  setShowArchived: (showArchived) => {
    set({ showArchived });
    void get().refresh();
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const notes = await api.fetchNotes(get().showArchived);
      set({ notes, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load notes. Is the Notes API running on port 3002?',
      });
    }
  },

  addQuickNote: async (title, content) => {
    const note = await api.createNote({
      title,
      content,
      note_type: 'note',
      color: api.DEFAULT_NOTE_COLOR,
    });
    set((s) => ({ notes: [note, ...s.notes.filter((n) => n.id !== note.id)] }));
  },

  addQuickTodo: async (title, itemLines) => {
    const items = itemLines.map((text) => ({ text, done: false }));
    const note = await api.createNote({
      title: title || 'To-do',
      note_type: 'checklist',
      items,
      content: null,
      color: api.DEFAULT_TODO_COLOR,
    });
    set((s) => ({ notes: [note, ...s.notes.filter((n) => n.id !== note.id)] }));
  },

  saveNote: async (id, patch) => {
    const note = await api.updateNote(id, patch);
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? note : n)) }));
  },

  removeNote: async (id) => {
    await api.deleteNote(id);
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  pinNote: async (id) => {
    const note = await api.togglePin(id);
    set((s) => ({
      notes: [...s.notes.filter((n) => n.id !== id), note].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    }));
  },

  archiveNote: async (id) => {
    await api.toggleArchive(id);
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  toggleItem: async (id, index) => {
    const note = await api.toggleChecklistItem(id, index);
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? note : n)) }));
  },
}));
