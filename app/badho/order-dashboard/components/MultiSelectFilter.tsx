'use client';

import { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  count: number;
}

interface Props {
  label: string;
  allLabel?: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  widthClass?: string;
}

// Compact multi-select chip used in every drill modal. An empty Set means
// "All" (no filter). Users can pick one or many.
export default function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  widthClass = 'w-44',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const total = options.reduce((s, o) => s + o.count, 0);
  const isAll = selected.size === 0;
  const q = search.trim().toLowerCase();
  const filteredOpts = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
      )
    : options;
  const summary = isAll
    ? `${allLabel || `All ${label}`} (${total.toLocaleString()})`
    : `${label}: ${selected.size}`;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div ref={ref} className={`relative ${widthClass} shrink-0`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded-md text-left flex items-center justify-between gap-2 transition-colors ${
          isAll
            ? 'border-slate-300 text-slate-900 hover:bg-slate-50'
            : 'border-purple-400 text-purple-800 bg-purple-50 hover:bg-purple-100 ring-1 ring-purple-200'
        }`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-slate-400 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 max-w-[80vw] bg-white border border-slate-200 rounded-lg shadow-[0_10px_30px_-5px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-slate-300 rounded text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            {!isAll && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[10px] font-semibold text-purple-600 hover:text-purple-700 underline whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={isAll}
                onChange={() => onChange(new Set())}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-400"
              />
              <span className="flex-1 font-semibold text-slate-700">{allLabel || `All ${label}`}</span>
              <span className="text-[10px] tabular-nums text-slate-500">{total}</span>
            </label>
            {filteredOpts.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-400 italic">No matches</div>
            ) : (
              filteredOpts.map((o) => {
                const checked = selected.has(o.value);
                return (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs ${
                      checked ? 'bg-purple-50/40' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-400"
                    />
                    <span className="flex-1 truncate text-slate-800" title={o.label}>
                      {o.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">{o.count}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
