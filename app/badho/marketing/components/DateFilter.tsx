'use client';

import { useState } from 'react';

export interface DateSel {
  mode: 'days' | 'range' | 'months';
  days: number;
  from: string;
  to: string;
  year: number;
  months: number[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRESETS: { label: string; days: number }[] = [
  { label: '7D', days: 7 }, { label: '14D', days: 14 }, { label: '1M', days: 30 },
  { label: '3M', days: 90 }, { label: '6M', days: 180 }, { label: '1Y', days: 365 },
];

// Human label for the current selection (also used in panel subtitles + CSV names).
export function dateLabel(d: DateSel): string {
  if (d.mode === 'range' && d.from && d.to) return `${d.from} → ${d.to}`;
  if (d.mode === 'months' && d.months.length) return `${[...d.months].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(', ')} ${d.year}`;
  const p = PRESETS.find((x) => x.days === d.days);
  return `Last ${p ? p.label : d.days + 'D'}`;
}

// Query-string segment for the API.
export function dateQuery(d: DateSel): string {
  if (d.mode === 'range' && d.from && d.to) return `from=${d.from}&to=${d.to}`;
  if (d.mode === 'months' && d.months.length) return `year=${d.year}&months=${[...d.months].sort((a, b) => a - b).join(',')}`;
  return `days=${d.days}`;
}

// Short filename-safe tag for CSV downloads.
export function dateTag(d: DateSel): string {
  if (d.mode === 'range' && d.from && d.to) return `${d.from}_${d.to}`;
  if (d.mode === 'months' && d.months.length) return `${d.year}-${[...d.months].sort((a, b) => a - b).join('-')}`;
  return `${d.days}d`;
}

const pill = (on: boolean) =>
  `px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${on ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_14px_rgba(217,70,239,0.45)]' : 'bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10'}`;

export default function DateFilter({ value, onChange }: { value: DateSel; onChange: (d: DateSel) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [year, setYear] = useState(value.year);
  const [months, setMonths] = useState<number[]>(value.months);
  const toggleMonth = (m: number) => setMonths((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  const label = 'text-[10px] uppercase tracking-wider font-semibold text-purple-300/70';
  const apply = 'mt-2 w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold bg-white/5 border-white/10 text-purple-100 hover:bg-white/10 transition-colors">
        <span className="opacity-70">📅</span>
        <span>{dateLabel(value)}</span>
        <span className="opacity-60">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-[330px] max-w-[90vw] rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-xl p-3 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            {/* Quick presets */}
            <div>
              <div className={label}>Quick</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {PRESETS.map((p) => (
                  <button key={p.days} onClick={() => { onChange({ ...value, mode: 'days', days: p.days }); setOpen(false); }} className={pill(value.mode === 'days' && value.days === p.days)}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* Custom range */}
            <div>
              <div className={label}>Custom range</div>
              <div className="flex items-center gap-2 mt-1.5">
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white [color-scheme:dark] focus:border-fuchsia-400/50 focus:outline-none" />
                <span className="text-purple-300 text-xs">→</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white [color-scheme:dark] focus:border-fuchsia-400/50 focus:outline-none" />
              </div>
              <button disabled={!from || !to} onClick={() => { onChange({ ...value, mode: 'range', from, to }); setOpen(false); }} className={apply}>Apply range</button>
            </div>

            {/* Months of a year */}
            <div>
              <div className="flex items-center justify-between">
                <div className={label}>Months of</div>
                <div className="flex items-center gap-2 text-purple-100">
                  <button onClick={() => setYear((y) => y - 1)} className="px-1.5 rounded hover:bg-white/10">‹</button>
                  <span className="text-sm font-semibold tabular-nums">{year}</span>
                  <button onClick={() => setYear((y) => y + 1)} className="px-1.5 rounded hover:bg-white/10">›</button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1 mt-1.5">
                {MONTHS.map((m, i) => (
                  <button key={m} onClick={() => toggleMonth(i + 1)} className={pill(months.includes(i + 1))}>{m}</button>
                ))}
              </div>
              <button disabled={!months.length} onClick={() => { onChange({ ...value, mode: 'months', year, months }); setOpen(false); }} className={apply}>Apply {months.length || ''} month{months.length === 1 ? '' : 's'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
