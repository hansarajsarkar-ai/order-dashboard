'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SellerOption {
  /** sellerId (string). */
  value: string;
  /** Display name, e.g. seller businessName. */
  label: string;
  /** RTO order count for this seller — shown as a hint and used for sorting. */
  count: number;
}

interface Props {
  /** Selected sellerIds. Empty array = All sellers (no filter). */
  selected: string[];
  onChange: (next: string[]) => void;
  options: SellerOption[];
  loading?: boolean;
}

/**
 * Compact dark-themed seller multi-select for the RTO trend chart header.
 * Mirrors MonthMultiSelect's look (portal-rendered menu, fuchsia accent when
 * active) but adds a search box since the seller list can be long. An empty
 * selection means "All sellers" (no filter); users can pick one or many.
 */
export default function SellerMultiSelect({ selected, onChange, options, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => setMounted(true), []);

  // Position the menu just below the button, right-aligned to it.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isAll = selected.length === 0;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : options;
    return [...base].sort((a, b) => b.count - a.count);
  }, [options, q]);

  // Resolve a name for the summary when exactly one seller is picked.
  const oneName = selected.length === 1
    ? options.find((o) => o.value === selected[0])?.label ?? '1 seller'
    : '';
  const summary = isAll
    ? 'All sellers'
    : selected.length === 1
    ? oneName
    : `${selected.length} sellers`;

  const toggle = (value: string) => {
    onChange(selectedSet.has(value) ? selected.filter((x) => x !== value) : [...selected, value]);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-2 transition-colors ${
          isAll
            ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
            : 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100 ring-1 ring-fuchsia-400/30 hover:bg-fuchsia-500/30'
        }`}
        title="Filter to selected seller(s)"
      >
        <span className="truncate max-w-[160px]">{summary}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </button>
      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="z-[9999] w-72 bg-slate-900 border border-white/15 rounded-xl shadow-[0_10px_40px_-5px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-purple-200 uppercase tracking-wide">Sellers</span>
            {!isAll && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] font-semibold text-fuchsia-300 hover:text-fuchsia-200 underline whitespace-nowrap"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>
          <div className="px-2.5 py-2 border-b border-white/10">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sellers…"
              className="w-full px-2 py-1.5 text-xs bg-white/5 border border-white/15 rounded text-white placeholder-purple-300/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-3 text-[11px] text-purple-300/70 italic">Loading sellers…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-purple-300/70 italic">No matches</div>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
                      checked ? 'bg-fuchsia-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="rounded border-white/30 bg-white/10 text-fuchsia-500 focus:ring-fuchsia-400 focus:ring-offset-0"
                    />
                    <span className="flex-1 truncate text-purple-100" title={o.label}>
                      {o.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-purple-300/60">{o.count.toLocaleString()}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
