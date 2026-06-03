'use client';

import { useEffect, useRef, useState } from 'react';

export type GroupDimension =
  | 'orderStatus'
  | 'deliveryStatus'
  | 'markedPending'
  | 'buyer'
  | 'seller'
  | 'buyerState'
  | 'buyerDistrict';

// Options shown in the dropdown (multi-select). "Order Wise" = no grouping (empty selection).
export const GROUP_OPTIONS: { dim: GroupDimension; label: string }[] = [
  { dim: 'orderStatus', label: 'Order Status Wise' },
  { dim: 'deliveryStatus', label: 'Delivery Status Wise' },
  { dim: 'markedPending', label: 'Marked Pending Wise' },
  { dim: 'buyer', label: 'Buyer Wise' },
  { dim: 'seller', label: 'Seller Wise' },
  { dim: 'buyerState', label: 'Buyer State Wise' },
  { dim: 'buyerDistrict', label: 'Buyer District Wise' },
];

// Canonical column order when several dimensions are combined (status → geo → entity).
export const DIM_ORDER: GroupDimension[] = [
  'orderStatus',
  'deliveryStatus',
  'markedPending',
  'buyerState',
  'buyerDistrict',
  'buyer',
  'seller',
];

export const DIM_LABEL: Record<GroupDimension, string> = {
  orderStatus: 'Order Status',
  deliveryStatus: 'Delivery Status',
  markedPending: 'Marked Pending',
  buyer: 'Buyer',
  seller: 'Seller',
  buyerState: 'State',
  buyerDistrict: 'District',
};

// Selected dims arranged in canonical order (also de-dupes).
export const orderDims = (selected: GroupDimension[]): GroupDimension[] =>
  DIM_ORDER.filter((d) => selected.includes(d));

interface GroupByMenuProps {
  selected: GroupDimension[];
  onChange: (dims: GroupDimension[]) => void;
  align?: 'left' | 'right';
}

export default function GroupByMenu({ selected, onChange, align = 'right' }: GroupByMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (dim: GroupDimension) => {
    if (selected.includes(dim)) onChange(selected.filter((d) => d !== dim));
    else onChange([...selected, dim]);
  };

  const active = selected.length > 0;
  const summary = active ? orderDims(selected).map((d) => DIM_LABEL[d]).join(' › ') : 'Order Wise';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={`Group by: ${summary}`}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          active
            ? 'bg-purple-500 text-white border-purple-600 shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]'
            : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="9" y2="18" />
        </svg>
        <span>Group By</span>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-white/25 text-white">
            {selected.length}
          </span>
        )}
        <span className={`transition-transform text-[10px] ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div
          className={`absolute z-[80] mt-1.5 w-64 rounded-xl border border-slate-200 bg-white shadow-2xl p-1.5 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Group by · pick one or more
          </div>

          {/* Order Wise = no grouping */}
          <button
            type="button"
            onClick={() => onChange([])}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
              selected.length === 0 ? 'bg-purple-50 text-purple-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selected.length === 0 ? 'border-purple-500' : 'border-slate-300'}`}>
              {selected.length === 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
            </span>
            Order Wise <span className="text-slate-400 font-normal">(no grouping)</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          {GROUP_OPTIONS.map((opt) => {
            const checked = selected.includes(opt.dim);
            return (
              <button
                key={opt.dim}
                type="button"
                onClick={() => toggle(opt.dim)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                  checked ? 'bg-purple-50 text-purple-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-purple-500 border-purple-500' : 'border-slate-300'}`}>
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}

          {selected.length > 1 && (
            <p className="px-2.5 pt-2 pb-1 text-[10px] text-slate-400 border-t border-slate-100 mt-1">
              Combining {selected.length} angles: <span className="text-purple-600 font-semibold">{summary}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
