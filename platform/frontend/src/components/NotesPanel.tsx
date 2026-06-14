import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  CheckSquare,
  ChevronDown,
  GripVertical,
  ListTodo,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  defaultColorForType,
  noteAccentClass,
  noteColorClass,
  NOTE_COLORS,
  type Note,
  type NoteItem,
} from '../services/notesApi';
import { useNotesStore } from '../store/useNotesStore';
import {
  clampToViewport,
  loadFloatingPosition,
  saveFloatingPosition,
  type FloatingPoint,
} from '../utils/floatingPanel';

type ComposeMode = 'note' | 'todo';

const NOTES_PANEL_STORAGE = 'prism-notes-panel-v1';
const NOTES_PANEL_W = 384;
const NOTES_PANEL_H = 512;

function defaultNotesPosition(): FloatingPoint {
  const m = 20;
  if (typeof window === 'undefined') return { x: m, y: 84 };
  return clampToViewport(m, 84, NOTES_PANEL_W, NOTES_PANEL_H);
}

function NoteActions(props: {
  note: Note;
  pinNote: (id: string) => void;
  archiveNote: (id: string) => void;
  removeNote: (id: string) => void;
}) {
  const { note, pinNote, archiveNote, removeNote } = props;
  return (
    <div className="flex shrink-0 gap-0.5">
      <button
        type="button"
        title={note.pinned ? 'Unpin' : 'Pin'}
        onClick={() => void pinNote(note.id)}
        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-amber-300"
      >
        {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title="Archive"
        onClick={() => void archiveNote(note.id)}
        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Delete"
        onClick={() => void removeNote(note.id)}
        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ColorDots(props: { note: Note; saveNote: (id: string, patch: Partial<Note>) => void }) {
  const { note, saveNote } = props;
  const isChecklist = note.note_type === 'checklist';
  const activeColor = defaultColorForType(note.note_type);
  const selectedColor =
    note.color && note.color !== 'default' ? note.color : activeColor;
  const ringClass = isChecklist ? 'ring-emerald-400/70' : 'ring-amber-400/70';

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {NOTE_COLORS.filter((c) => c.id !== 'default').map((c) => (
        <button
          key={c.id}
          type="button"
          title={`Color ${c.id}`}
          onClick={() => void saveNote(note.id, { color: c.id })}
          className={clsx(
            'h-4 w-4 rounded-full border',
            c.className,
            selectedColor === c.id && clsx('ring-2', ringClass),
          )}
        />
      ))}
    </div>
  );
}

function NoteDetails(props: { note: Note }) {
  const { note } = props;
  const saveNote = useNotesStore((s) => s.saveNote);
  const removeNote = useNotesStore((s) => s.removeNote);
  const pinNote = useNotesStore((s) => s.pinNote);
  const archiveNote = useNotesStore((s) => s.archiveNote);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? '');

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content ?? '');
  }, [note.id, note.title, note.content]);

  const flush = useCallback(() => {
    if (title === note.title && content === (note.content ?? '')) return;
    void saveNote(note.id, { title, content });
  }, [content, note.content, note.id, note.title, saveNote, title]);

  return (
    <>
      <div className="mb-2 flex items-start gap-2">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-500"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flush}
        />
        <NoteActions note={note} pinNote={pinNote} archiveNote={archiveNote} removeNote={removeNote} />
      </div>
      <textarea
        className="min-h-[72px] w-full resize-y bg-transparent text-sm leading-relaxed text-slate-300 outline-none placeholder:text-slate-500"
        placeholder="Take a note…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={flush}
      />
      <ColorDots note={note} saveNote={saveNote} />
    </>
  );
}

function ChecklistDetails(props: { note: Note }) {
  const { note } = props;
  const saveNote = useNotesStore((s) => s.saveNote);
  const removeNote = useNotesStore((s) => s.removeNote);
  const pinNote = useNotesStore((s) => s.pinNote);
  const archiveNote = useNotesStore((s) => s.archiveNote);
  const toggleItem = useNotesStore((s) => s.toggleItem);
  const [title, setTitle] = useState(note.title);
  const [items, setItems] = useState<NoteItem[]>(note.items ?? []);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    setTitle(note.title);
    setItems(note.items ?? []);
  }, [note.id, note.title, note.items]);

  const flushTitle = useCallback(() => {
    if (title === note.title) return;
    void saveNote(note.id, { title, note_type: 'checklist' });
  }, [note.id, note.title, saveNote, title]);

  const flushItems = useCallback(
    (next: NoteItem[]) => {
      void saveNote(note.id, { items: next, note_type: 'checklist' });
    },
    [note.id, saveNote],
  );

  const updateItemText = (index: number, text: string) => {
    const next = items.map((it, i) => (i === index ? { ...it, text } : it));
    setItems(next);
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    flushItems(next);
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    const next = [...items, { text, done: false }];
    setItems(next);
    setNewItem('');
    flushItems(next);
  };

  const doneCount = items.filter((i) => i.done).length;

  return (
    <>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {items.length > 0 ? (
            <div className="mb-1 text-[10px] font-medium text-slate-500">
              {doneCount}/{items.length} complete
            </div>
          ) : null}
          <input
            className="w-full bg-transparent text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-500"
            placeholder="List title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flushTitle}
          />
        </div>
        <NoteActions note={note} pinNote={pinNote} archiveNote={archiveNote} removeNote={removeNote} />
      </div>

      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={`${note.id}-${index}`} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => void toggleItem(note.id, index)}
              className={clsx(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                item.done
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-500 bg-transparent text-transparent hover:border-slate-400',
              )}
              aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
            >
              <CheckSquare className="h-3 w-3" strokeWidth={2} />
            </button>
            <input
              className={clsx(
                'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500',
                item.done ? 'text-slate-500 line-through' : 'text-slate-200',
              )}
              value={item.text}
              onChange={(e) => updateItemText(index, e.target.value)}
              onBlur={() => flushItems(items)}
            />
            <button
              type="button"
              title="Remove item"
              onClick={() => removeItem(index)}
              className="rounded p-0.5 text-slate-500 hover:text-rose-300"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-900/50 px-2 py-1 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500/40"
          placeholder="Add a task…"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!newItem.trim()}
          className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/15 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <ColorDots note={note} saveNote={saveNote} />
    </>
  );
}

function noteDisplayTitle(note: Note): string {
  const title = note.title?.trim();
  if (title) return title;
  return note.note_type === 'checklist' ? 'To-do' : 'Untitled';
}

function NoteListItem(props: { note: Note; expanded: boolean; onToggle: () => void }) {
  const { note, expanded, onToggle } = props;
  const isChecklist = note.note_type === 'checklist';
  const items = note.items ?? [];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-lg border shadow-sm',
        noteColorClass(note.color, note.note_type),
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={clsx(
          'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5',
          expanded && 'border-b border-white/10 bg-white/[0.03]',
        )}
      >
        {isChecklist ? (
          <ListTodo className={clsx('h-3.5 w-3.5 shrink-0', noteAccentClass('checklist'))} aria-hidden />
        ) : (
          <StickyNote className={clsx('h-3.5 w-3.5 shrink-0', noteAccentClass('note'))} aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
          {noteDisplayTitle(note)}
        </span>
        {note.pinned ? <Pin className="h-3 w-3 shrink-0 text-amber-400/80" aria-label="Pinned" /> : null}
        {isChecklist && items.length > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-emerald-400/80">
            {doneCount}/{items.length}
          </span>
        ) : null}
        <ChevronDown
          className={clsx('h-4 w-4 shrink-0 text-slate-500 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-2">
              {isChecklist ? <ChecklistDetails note={note} /> : <NoteDetails note={note} />}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ComposeForm(props: {
  composeMode: ComposeMode;
  setComposeMode: (mode: ComposeMode) => void;
  draftTitle: string;
  setDraftTitle: (v: string) => void;
  draftBody: string;
  setDraftBody: (v: string) => void;
  saving: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  titleRef: RefObject<HTMLInputElement | null>;
}) {
  const {
    composeMode,
    setComposeMode,
    draftTitle,
    setDraftTitle,
    draftBody,
    setDraftBody,
    saving,
    canSubmit,
    onSubmit,
    onCancel,
    titleRef,
  } = props;

  return (
    <div
      className={clsx(
        'rounded-xl border bg-gray-900/90 p-3 shadow-lg',
        composeMode === 'todo'
          ? 'border-emerald-500/30 ring-1 ring-emerald-500/10'
          : 'border-amber-500/30 ring-1 ring-amber-500/10',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-1 rounded-lg border border-white/10 bg-gray-950/60 p-0.5">
          <button
            type="button"
            onClick={() => setComposeMode('note')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium',
              composeMode === 'note'
                ? 'bg-amber-950/80 text-amber-200 ring-1 ring-amber-700/40'
                : 'text-slate-500 hover:text-amber-300/80',
            )}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Note
          </button>
          <button
            type="button"
            onClick={() => setComposeMode('todo')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium',
              composeMode === 'todo'
                ? 'bg-emerald-950/80 text-emerald-200 ring-1 ring-emerald-700/40'
                : 'text-slate-500 hover:text-emerald-300/80',
            )}
          >
            <ListTodo className="h-3.5 w-3.5" />
            To-do
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        ref={titleRef}
        type="text"
        className="mb-2 w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm font-medium text-slate-100 outline-none ring-cyan-500/40 placeholder:text-slate-500 focus:ring-2"
        placeholder="Title"
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
          }
        }}
      />
      <textarea
        className="min-h-[72px] w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-200 outline-none ring-cyan-500/40 placeholder:text-slate-500 focus:ring-2"
        placeholder={composeMode === 'todo' ? 'One task per line…' : 'Take a note…'}
        value={draftBody}
        onChange={(e) => setDraftBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-600">Ctrl+Enter to save</span>
        <button
          type="button"
          disabled={!canSubmit || saving}
          onClick={onSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {composeMode === 'todo' ? 'Save to-do' : 'Save note'}
        </button>
      </div>
    </div>
  );
}

export function NotesPanel() {
  const panelOpen = useNotesStore((s) => s.panelOpen);
  const closePanel = useNotesStore((s) => s.closePanel);
  const notes = useNotesStore((s) => s.notes);
  const loading = useNotesStore((s) => s.loading);
  const error = useNotesStore((s) => s.error);
  const showArchived = useNotesStore((s) => s.showArchived);
  const setShowArchived = useNotesStore((s) => s.setShowArchived);
  const refresh = useNotesStore((s) => s.refresh);
  const addQuickNote = useNotesStore((s) => s.addQuickNote);
  const addQuickTodo = useNotesStore((s) => s.addQuickTodo);
  const [composeMode, setComposeMode] = useState<ComposeMode>('note');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [position, setPosition] = useState<FloatingPoint>(() => {
    return loadFloatingPosition(NOTES_PANEL_STORAGE) ?? defaultNotesPosition();
  });

  const syncPosition = useCallback(() => {
    const el = rootRef.current;
    const w = el?.offsetWidth ?? NOTES_PANEL_W;
    const h = el?.offsetHeight ?? NOTES_PANEL_H;
    setPosition((prev) => clampToViewport(prev.x, prev.y, w, h));
  }, []);

  useLayoutEffect(() => {
    if (!panelOpen) return;
    syncPosition();
  }, [panelOpen, syncPosition]);

  useEffect(() => {
    if (!panelOpen) return;
    const onResize = () => syncPosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelOpen, syncPosition]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position.x, position.y],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = rootRef.current;
    const w = el?.offsetWidth ?? NOTES_PANEL_W;
    const h = el?.offsetHeight ?? NOTES_PANEL_H;
    const next = clampToViewport(
      drag.originX + (e.clientX - drag.startX),
      drag.originY + (e.clientY - drag.startY),
      w,
      h,
    );
    setPosition(next);
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const el = rootRef.current;
    const w = el?.offsetWidth ?? NOTES_PANEL_W;
    const h = el?.offsetHeight ?? NOTES_PANEL_H;
    const next = clampToViewport(
      drag.originX + (e.clientX - drag.startX),
      drag.originY + (e.clientY - drag.startY),
      w,
      h,
    );
    setPosition(next);
    saveFloatingPosition(NOTES_PANEL_STORAGE, next);
  }, []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setDraftTitle('');
    setDraftBody('');
  }, []);

  const openCompose = useCallback((mode: ComposeMode = 'note') => {
    setComposeMode(mode);
    setDraftTitle('');
    setDraftBody('');
    setComposeOpen(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!panelOpen) {
      setComposeOpen(false);
      setDraftTitle('');
      setDraftBody('');
      setExpandedId(null);
    }
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (composeOpen) {
          closeCompose();
        } else if (expandedId) {
          setExpandedId(null);
        } else {
          closePanel();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeCompose, closePanel, composeOpen, expandedId, panelOpen]);

  const submitDraft = async () => {
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if ((!title && !body) || saving) return;
    setSaving(true);
    try {
      if (composeMode === 'todo') {
        const tasks = body.split('\n').map((l) => l.trim()).filter(Boolean);
        await addQuickTodo(title || 'To-do', tasks);
      } else {
        await addQuickNote(title || 'Untitled', body);
      }
      closeCompose();
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = Boolean(draftTitle.trim() || draftBody.trim());

  return (
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          ref={rootRef}
          className="fixed z-[198] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-950/95 shadow-2xl backdrop-blur-md"
          style={{
            left: position.x,
            top: position.y,
            height: 'min(32rem, calc(100vh - 2rem))',
            maxHeight: 'min(32rem, calc(100vh - 2rem))',
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          aria-label="Quick notes"
        >
          <header className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-2">
            <div
              className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-1.5 active:cursor-grabbing"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
              <StickyNote className="h-4 w-4 shrink-0 text-amber-300" strokeWidth={1.75} />
              <h2 className="truncate text-sm font-semibold text-slate-100">Notes & To-do</h2>
            </div>
            <button
              type="button"
              onClick={() => (composeOpen ? closeCompose() : openCompose())}
              className={clsx(
                'shrink-0 rounded-lg p-1.5 transition-colors',
                composeOpen
                  ? 'bg-cyan-600/20 text-cyan-300'
                  : 'text-slate-400 hover:bg-white/10 hover:text-cyan-300',
              )}
              aria-label={composeOpen ? 'Close new note form' : 'Add note or to-do'}
              title={composeOpen ? 'Close' : 'New note or to-do'}
            >
              {composeOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Close notes"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={clsx(
                'rounded-md px-2 py-1 text-[11px] font-medium',
                showArchived ? 'bg-white/10 text-slate-200' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {showArchived ? 'Archived' : 'Active'}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-[11px] text-slate-500 hover:text-cyan-300"
            >
              Refresh
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {composeOpen ? (
              <div className="mb-3">
                <ComposeForm
                  composeMode={composeMode}
                  setComposeMode={setComposeMode}
                  draftTitle={draftTitle}
                  setDraftTitle={setDraftTitle}
                  draftBody={draftBody}
                  setDraftBody={setDraftBody}
                  saving={saving}
                  canSubmit={canSubmit}
                  onSubmit={() => void submitDraft()}
                  onCancel={closeCompose}
                  titleRef={titleRef}
                />
              </div>
            ) : null}
            {loading && notes.length === 0 ? (
              <p className="text-center text-sm text-slate-500">Loading notes…</p>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {error}
              </div>
            ) : null}
            {!loading && !error && notes.length === 0 && !composeOpen ? (
              <p className="text-center text-sm text-slate-500">No notes yet. Tap + to add one.</p>
            ) : null}
            <div className="flex flex-col gap-1">
              {notes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  expanded={expandedId === note.id}
                  onToggle={() => setExpandedId((id) => (id === note.id ? null : note.id))}
                />
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
