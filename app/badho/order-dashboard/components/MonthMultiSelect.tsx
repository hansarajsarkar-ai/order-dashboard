'use client';

import { useEffect, useRef, useState } from 'react';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface Props {
  /** Selected month numbers (1-12). Empty array = All months. */
  selected: number[];
  onChange: (next: number[]) => void;
  /** Shown in the option labels, e.g. 2026. */
  year: number;
}

/**
 * Compact dark-themed month multi-select for the granularity toggles. An empty
 * selection means "All months" (no filter). Users can pick one or many; months
 * are stored as numbers 1-12.
 */
export default function MonthMultiSelect({ selected, onChange, year }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isAll = selected.length === 0;
  const sorted = [...selected].sort((a, b) => a - b);
  const summary = isAll
    ? 'All months'
    : sorted.length <= 3
    ? sorted.map((m) => MONTHS[m - 1]).join(', ')
    : `${sorted.length} months`;

  const toggle = (m: number) => {
    onChange(selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-2 transition-colors ${
          isAll
            ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
            : 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100 ring-1 ring-fuchsia-400/30 hover:bg-fuchsia-500/30'
        }`}
        title="Filter to selected month(s)"
      >
        <span className="truncate max-w-[140px]">{summary}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-52 bg-slate-900 border border-white/15 rounded-xl shadow-[0_10px_40px_-5px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-purple-200 uppercase tracking-wide">Months · {year}</span>
            {!isAll && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] font-semibold text-fuchsia-300 hover:text-fuchsia-200 underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 p-2">
            {MONTHS.map((name, i) => {
              const m = i + 1;
              const checked = selected.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle(m)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    checked
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_10px_rgba(217,70,239,0.45)]'
                      : 'text-purple-200 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
