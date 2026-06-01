'use client';

import { useEffect, useRef, useState } from 'react';

export interface MSOption { value: string; label?: string; count?: number; }

export function MultiSelect({ label, options, value, onChange, placeholder = 'All' }: {
  label: string;
  options: MSOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const filtered = options.filter((o) => !q || (o.label || o.value).toLowerCase().includes(q.toLowerCase()));
  const selected = new Set(value);
  return (
    <div ref={ref} className="relative">
      <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold mb-1">{label}</div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-sm bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg px-3 py-2 text-purple-100 flex items-center justify-between gap-2"
      >
        <span className="truncate">
          {value.length === 0 ? <span className="text-purple-300/60">{placeholder}</span> : `${value.length} selected`}
        </span>
        <span className="text-purple-300/60">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-slate-900 border border-white/10 rounded-lg shadow-2xl">
          <div className="p-2 border-b border-white/10 sticky top-0 bg-slate-900 flex items-center gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-purple-100 placeholder-purple-300/40 focus:outline-none focus:ring-1 focus:ring-purple-400"
            />
            {value.length > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-rose-300 hover:text-rose-200">Clear</button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="p-2 text-xs text-purple-300/60 text-center">No results</div>
          ) : filtered.map((o) => {
            const isSel = selected.has(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => {
                    if (isSel) onChange(value.filter((v) => v !== o.value));
                    else onChange([...value, o.value]);
                  }}
                  className="accent-fuchsia-500"
                />
                <span className="flex-1 text-purple-100 truncate">{o.label || o.value}</span>
                {o.count !== undefined && (
                  <span className="text-purple-300/50 tabular-nums">{o.count.toLocaleString('en-IN')}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
