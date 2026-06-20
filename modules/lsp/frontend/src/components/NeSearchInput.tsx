import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NE_LIST_LIMIT, commitNeDraft, countNeMatches, filterNeIds } from "../utils/nePicker";

export function NeSearchInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  neIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [showFullList, setShowFullList] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setDraft(props.value);
      setShowFullList(false);
      setHighlightIndex(-1);
    }
  }, [props.value, open]);

  const filtered = useMemo(
    () => filterNeIds(showFullList ? "" : draft, props.neIds, NE_LIST_LIMIT),
    [draft, props.neIds, showFullList],
  );

  const totalMatches = useMemo(
    () => countNeMatches(showFullList ? "" : draft, props.neIds),
    [draft, props.neIds, showFullList],
  );

  useEffect(() => {
    if (!open || filtered.length === 0) {
      setHighlightIndex(-1);
      return;
    }
    const currentIdx = filtered.findIndex((id) => id === props.value);
    setHighlightIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [open, filtered, props.value]);

  const openFullList = () => {
    setOpen(true);
    setShowFullList(true);
  };

  const closeList = () => {
    setOpen(false);
    setShowFullList(false);
    setHighlightIndex(-1);
  };

  const pick = (id: string) => {
    pickingRef.current = false;
    props.onChange(id);
    setDraft(id);
    closeList();
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeList();
        setDraft(props.value);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, props.value]);

  const commitDraft = () => {
    const result = commitNeDraft(draft, props.neIds);
    if (result.kind === "clear") {
      props.onChange("");
      setDraft("");
      closeList();
      return;
    }
    if (result.kind === "pick") {
      pick(result.value);
      return;
    }
    setDraft(props.value);
    closeList();
  };

  const pickHighlighted = () => {
    if (highlightIndex >= 0 && highlightIndex < filtered.length) {
      pick(filtered[highlightIndex]!);
      return;
    }
    commitDraft();
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        id={props.id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${props.id}-options`}
        aria-activedescendant={
          open && highlightIndex >= 0 ? `${props.id}-opt-${highlightIndex}` : undefined
        }
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          setOpen(true);
          setShowFullList(false);
          if (next.trim() === "") {
            props.onChange("");
          }
        }}
        onFocus={openFullList}
        onClick={openFullList}
        onBlur={() => {
          window.setTimeout(() => {
            if (!pickingRef.current) {
              commitDraft();
            }
            pickingRef.current = false;
          }, 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && filtered.length > 0) {
              pickHighlighted();
            } else {
              commitDraft();
            }
          } else if (e.key === "Escape") {
            setDraft(props.value);
            closeList();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) {
              openFullList();
              return;
            }
            if (filtered.length > 0) {
              setHighlightIndex((i) => (i + 1) % filtered.length);
            }
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
              openFullList();
              return;
            }
            if (filtered.length > 0) {
              setHighlightIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
            }
          }
        }}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-3 pr-8 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Show ${props.placeholder} options`}
        aria-expanded={open}
        aria-controls={`${props.id}-options`}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
        onMouseDown={(e) => {
          e.preventDefault();
          pickingRef.current = true;
          if (open) {
            closeList();
            setDraft(props.value);
          } else {
            openFullList();
            inputRef.current?.focus();
          }
          window.setTimeout(() => {
            pickingRef.current = false;
          }, 0);
        }}
      >
        <ChevronDown size={16} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && filtered.length > 0 ? (
        <ul
          id={`${props.id}-options`}
          role="listbox"
          className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-gray-900 py-1 text-sm shadow-lg"
        >
          {filtered.map((id, idx) => (
            <li key={id} role="option" aria-selected={idx === highlightIndex}>
              <button
                id={`${props.id}-opt-${idx}`}
                type="button"
                className={`block w-full px-3 py-1.5 text-left hover:bg-white/10 ${
                  idx === highlightIndex
                    ? "bg-white/10 text-cyan-300"
                    : id === props.value
                      ? "text-cyan-400"
                      : "text-slate-100"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickingRef.current = true;
                  pick(id);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                {id}
              </button>
            </li>
          ))}
          {totalMatches > NE_LIST_LIMIT ? (
            <li className="px-3 py-1 text-[10px] text-slate-500">
              {totalMatches - NE_LIST_LIMIT} more — type to narrow
            </li>
          ) : null}
        </ul>
      ) : open && props.neIds.length === 0 ? (
        <div className="absolute z-[60] mt-1 w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs text-slate-500 shadow-lg">
          No NEs loaded
        </div>
      ) : open && !showFullList && draft.trim() && filtered.length === 0 ? (
        <div className="absolute z-[60] mt-1 w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs text-slate-500 shadow-lg">
          No matching NEs
        </div>
      ) : null}
    </div>
  );
}
