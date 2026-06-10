'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColumnDef,
  formatValue,
  isNumericCol,
  computeMaxLoss,
  heatBg,
} from './columns';
import PoItemsModal, { type PriceBreakup } from '../../order-dashboard/components/PoItemsModal';

type Row = Record<string, unknown>;

interface Props {
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  rows: Row[];
  onClose: () => void;
  // When set, the modal opens sorted by this column key (desc) — used so a
  // slab click lands sorted by that dimension's % (worst rows on top).
  defaultSortKey?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' };

// Long free-text columns that should wrap instead of forcing horizontal scroll.
const WRAP_KEYS = new Set(['buyerBusinessName', 'sellerbusinessname']);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// Light-theme cell tone (green / red text) for the conditional % + P&L columns.
function lightCellTone(col: ColumnDef, v: unknown): string {
  const n = num(v);
  if (!col.cellTone || n === null) return '';
  const t = col.cellTone(n);
  if (t === 'green') return 'text-emerald-600 font-semibold';
  if (t === 'red') return 'text-rose-600 font-semibold';
  return '';
}

// Light-theme row tint driven by P&L %: >0 → faint green, <0 → faint red,
// otherwise zebra striping. Hover always highlights purple.
function lightRowTone(row: Row, idx: number): string {
  const n = num(row['p&l%']);
  if (n !== null) {
    if (n > 0) return 'bg-emerald-50 hover:bg-purple-50';
    if (n < 0) return 'bg-rose-50 hover:bg-purple-50';
  }
  return (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50') + ' hover:bg-purple-50';
}

// Build the optimistic price panel from the P&L row; PoItemsModal overwrites it
// with the full aggregated figures from /api/po-financials once they arrive.
function buildBreakup(r: Row): PriceBreakup {
  return {
    orderAmount: num(r['GrossAmount']),
    itemTotalAmount: num(r['ItemTotal']),
    itemDiscount: num(r['ItemDiscount']),
    couponAmount: num(r['CoupanApplied']),
    badhoDiscount: num(r['discountByBadho']),
    appliedWalletAmount: num(r['appliedWalletAmount']),
    sellerDiscount: num(r['discountBySeller']),
    volumeDiscount: num(r['appliedVolumeDiscountAmount']),
    totalDiscount: num(r['totalDiscount']),
    paymentOption: (r['paymentoption'] as string) ?? null,
  };
}

// AWB rendered as a Delhivery forward-tracking link (matches the order-dashboard
// monthly drill modal).
function awbLink(awb: unknown) {
  const s = awb == null || awb === '' ? '' : String(awb);
  if (!s) return <span className="text-slate-400">—</span>;
  return (
    <a
      href={`https://one.delhivery.com/shipments/forward/${encodeURIComponent(s)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
      title="Track this shipment on Delhivery"
    >
      {s}
    </a>
  );
}

export default function DetailsModal({ title, subtitle, columns, rows, onClose, defaultSortKey }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(defaultSortKey ? { key: defaultSortKey, dir: 'desc' } : null);
  // User-controlled column order (drag to reorder). Keyed by column key.
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);
  // PO Items / Price Breakup sub-modal — opened from a row's "View Items" button.
  const [poItems, setPoItems] = useState<{ poNumber: string; breakup: PriceBreakup } | null>(null);

  // Re-seed the order only when the underlying column set actually changes
  // (a fresh data fetch) — a user's manual arrangement survives slab switches.
  const colKeySig = columns.map((c) => c.key).join('|');
  useEffect(() => {
    setOrder(columns.map((c) => c.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKeySig]);

  // Reset search + sort whenever a different slab opens this modal.
  useEffect(() => {
    setSearch('');
    setSort(defaultSortKey ? { key: defaultSortKey, dir: 'desc' } : null);
  }, [defaultSortKey, rows]);

  const orderedCols = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, c]));
    const out = order.map((k) => map.get(k)).filter(Boolean) as ColumnDef[];
    // Append any columns missing from `order` (defensive: new keys mid-session).
    for (const c of columns) if (!order.includes(c.key)) out.push(c);
    return out;
  }, [order, columns]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r['poNumber'] ?? '').toLowerCase().includes(q) ||
      String(r['AWBNumber'] ?? '').toLowerCase().includes(q) ||
      String(r['buyerPhone'] ?? '').toLowerCase().includes(q) ||
      String(r['buyerBusinessName'] ?? '').toLowerCase().includes(q) ||
      String(r['sellerphone'] ?? '').toLowerCase().includes(q) ||
      String(r['sellerbusinessname'] ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1; // empties always last, regardless of direction
      if (bEmpty) return -1;
      const an = Number(av);
      const bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return (an - bn) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [filteredRows, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return null; // third click clears the sort
    });
  };

  const handleDrop = (targetKey: string) => {
    const src = dragKey.current;
    dragKey.current = null;
    setDragOverKey(null);
    if (!src || src === targetKey) return;
    setOrder((prev) => {
      const next = prev.filter((k) => k !== src);
      const ti = next.indexOf(targetKey);
      next.splice(ti < 0 ? next.length : ti, 0, src);
      return next;
    });
  };

  const isReordered = order.join('|') !== colKeySig;

  const maxLoss = useMemo(() => computeMaxLoss(filteredRows, columns), [filteredRows, columns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const downloadCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = orderedCols.map((c) => esc(c.label)).join(',');
    const body = sortedRows.map((r) => orderedCols.map((c) => esc(r[c.key])).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[97vw] max-w-[97vw] h-[95vh] max-h-[95vh] flex flex-col rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{subtitle}</p>}
            <p className="text-[11px] text-purple-600 mt-0.5 font-semibold">
              {filteredRows.length.toLocaleString('en-IN')}
              {filteredRows.length !== rows.length ? ` / ${rows.length.toLocaleString('en-IN')}` : ''}{' '}
              {rows.length === 1 ? 'order' : 'orders'}
              <span className="text-slate-400 font-normal"> · drag headers to reorder</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isReordered && (
              <button
                onClick={() => setOrder(columns.map((c) => c.key))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                title="Restore the default column order"
              >
                ↺ Reset columns
              </button>
            )}
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, AWB, buyer, seller…"
                className="w-56 pl-3 pr-7 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs px-1"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={downloadCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white transition-colors shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]"
            >
              ⬇ CSV
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all hover:rotate-90"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              {rows.length === 0 ? 'No orders in this slab.' : 'No rows match the current search.'}
            </div>
          ) : (
            <table className="text-[11px] border-collapse leading-tight">
              <thead className="sticky top-0 z-10 shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                <tr>
                  {/* Fixed action column (View Items + Freshdesk ticket) */}
                  <th className="px-2 py-1 text-left align-bottom font-bold uppercase tracking-wide text-[10px] text-slate-700 bg-slate-100 border-b border-slate-200 whitespace-nowrap">
                    Act.
                  </th>
                  {orderedCols.map((c) => {
                    const active = sort?.key === c.key;
                    const wrap = WRAP_KEYS.has(c.key);
                    return (
                      <th
                        key={c.key}
                        onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== c.key) setDragOverKey(c.key); }}
                        onDragLeave={() => setDragOverKey((k) => (k === c.key ? null : k))}
                        onDrop={(e) => { e.preventDefault(); handleDrop(c.key); }}
                        className={
                          'px-2 py-1 text-left align-bottom font-bold uppercase tracking-wide text-[10px] border-b border-slate-200 bg-slate-100 ' +
                          (wrap ? 'whitespace-normal break-words max-w-[120px] ' : 'whitespace-normal max-w-[110px] ') +
                          (dragOverKey === c.key ? 'border-l-2 border-l-purple-500 ' : '') +
                          (active ? 'text-purple-700' : 'text-slate-700')
                        }
                      >
                        <span className="inline-flex items-start gap-1">
                          <span
                            draggable
                            onDragStart={(e) => { dragKey.current = c.key; e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => { dragKey.current = null; setDragOverKey(null); }}
                            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-purple-500 select-none leading-none mt-px"
                            title="Drag to reorder column"
                          >
                            ⠿
                          </span>
                          <span
                            onClick={() => toggleSort(c.key)}
                            className="cursor-pointer inline-flex items-center gap-0.5 select-none"
                            title="Click to sort"
                          >
                            {c.label}
                            <span className={active ? 'opacity-100 text-purple-600' : 'opacity-30'}>
                              {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => {
                  const po = String(r['poNumber'] ?? '');
                  return (
                    <tr key={i} className={'border-b border-slate-100 transition-colors ' + lightRowTone(r, i)}>
                      {/* Actions — compact icon buttons */}
                      <td className="px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!po}
                            onClick={() => setPoItems({ poNumber: po, breakup: buildBreakup(r) })}
                            className="inline-flex items-center justify-center w-6 h-6 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 hover:border-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="View items in this PO"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                          </button>
                          {po ? (
                            <a
                              href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(po)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center w-6 h-6 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 hover:border-sky-400 transition-all"
                              title={`Search Freshdesk tickets for PO ${po}`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                              </svg>
                            </a>
                          ) : (
                            <span className="w-6 text-center text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      {orderedCols.map((c) => {
                        const v = r[c.key];
                        // poNumber → D2R support detail link.
                        if (c.key === 'poNumber') {
                          return (
                            <td key={c.key} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap text-left">
                              {po ? (
                                <a
                                  href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(po)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-bold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer tabular-nums"
                                  title="Open in D2R Support Dashboard"
                                >
                                  {formatValue(c, v)}
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }
                        // AWB → Delhivery tracking link.
                        if (c.key === 'AWBNumber') {
                          return (
                            <td key={c.key} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap text-left tabular-nums">
                              {awbLink(v)}
                            </td>
                          );
                        }
                        const isNum = isNumericCol(v, c.key);
                        const wrap = WRAP_KEYS.has(c.key);
                        const tone = lightCellTone(c, v);
                        const heat = heatBg(c, v, maxLoss);
                        return (
                          <td
                            key={c.key}
                            style={heat ? { backgroundColor: heat } : undefined}
                            className={
                              'px-2 py-1 border-b border-slate-100 ' +
                              (wrap ? 'whitespace-normal break-words max-w-[140px] ' : 'whitespace-nowrap ') +
                              (isNum ? 'text-right tabular-nums ' : 'text-left ') +
                              (heat ? 'text-rose-900 font-bold' : tone || 'text-slate-700')
                            }
                          >
                            {formatValue(c, v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>

    {/* PO Items + Price Breakup, opened from a row's "View Items" button */}
    <PoItemsModal
      poNumber={poItems?.poNumber ?? null}
      breakup={poItems?.breakup ?? null}
      onClose={() => setPoItems(null)}
    />
    </>
  );
}
