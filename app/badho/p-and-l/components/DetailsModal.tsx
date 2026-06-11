'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// Categorical dimensions offered as multi-select filters (single or many).
// A filter only renders when its column has >1 distinct value, so single-value
// columns (e.g. Courier when everything is Delhivery) never add clutter.
const FILTER_DEFS: { key: string; label: string; icon: string }[] = [
  { key: 'buyerBusinessName', label: 'Buyer', icon: '🛍️' },
  { key: 'sellerbusinessname', label: 'Seller', icon: '🏭' },
  { key: 'MarkedpendingTime', label: 'Pending Date', icon: '📅' },
  { key: 'orderStatus', label: 'Order Status', icon: '🏷️' },
  { key: 'deliverystatus', label: 'Delivery Status', icon: '🚚' },
  { key: 'paymentoption', label: 'Payment', icon: '💳' },
];

function toggleInSet(set: Set<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

const EMPTY_SET: Set<string> = new Set();

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
  // Multi-select filters (single or many) keyed by column key. Empty set = all.
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [sort, setSort] = useState<SortState | null>(defaultSortKey ? { key: defaultSortKey, dir: 'desc' } : null);
  // User-controlled column order (drag to reorder). Keyed by column key.
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);
  // PO Items / Price Breakup sub-modal — opened from a row's "View Items" button.
  const [poItems, setPoItems] = useState<{ poNumber: string; breakup: PriceBreakup } | null>(null);

  // Approve state — a map of freshly-approved ids → the stored
  // "true | <email> | <ts>" value (so the row flips to "✓ Approved" without a
  // refetch), plus the multi-select set and the in-flight flag.
  const [approvedMap, setApprovedMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // A row is approved if it came back approved or we just approved it this session.
  const isRowApproved = (r: Row, id: string) => {
    const v = approvedMap[id] ?? r['isApproved'];
    return v !== null && v !== undefined && v !== '';
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Approve every selected PO in one request (no confirmation). The route
  // accepts the whole id array and stamps them all with the same value.
  const approveSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkApproving) return;
    setBulkApproving(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      const res = await fetch('/api/p-and-l/orders-pushed/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ purchaseOrderIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if ((json.approved ?? 0) < 1) throw new Error('No orders approved (status may have changed).');
      setApprovedMap((m) => {
        const next = { ...m };
        for (const id of ids) next[id] = json.value;
        return next;
      });
      setSelectedIds(new Set());
    } catch (e) {
      window.alert(`Approve failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBulkApproving(false);
    }
  };

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
    setFilters({});
    setSort(defaultSortKey ? { key: defaultSortKey, dir: 'desc' } : null);
  }, [defaultSortKey, rows]);

  // Distinct values per filterable column (only those with >1 value are shown).
  const filterOptions = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const def of FILTER_DEFS) {
      const s = new Set<string>();
      for (const r of rows) {
        const v = r[def.key];
        if (v !== null && v !== undefined && String(v).trim() !== '') s.add(String(v));
      }
      m[def.key] = [...s].sort((a, b) => a.localeCompare(b));
    }
    return m;
  }, [rows]);

  const activeFilterDefs = FILTER_DEFS.filter((d) => (filterOptions[d.key]?.length ?? 0) > 1);
  const activeFilterCount = activeFilterDefs.reduce((n, d) => n + (filters[d.key]?.size ?? 0), 0);
  const toggleFilter = (key: string, v: string) =>
    setFilters((prev) => ({ ...prev, [key]: toggleInSet(prev[key] ?? new Set(), v) }));
  const clearFilter = (key: string) =>
    setFilters((prev) => ({ ...prev, [key]: new Set() }));
  const clearAllFilters = () => setFilters({});

  const orderedCols = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, c]));
    const out = order.map((k) => map.get(k)).filter(Boolean) as ColumnDef[];
    // Append any columns missing from `order` (defensive: new keys mid-session).
    for (const c of columns) if (!order.includes(c.key)) out.push(c);
    return out;
  }, [order, columns]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Only the filter columns that actually have a selection.
    const active = FILTER_DEFS
      .map((d) => [d.key, filters[d.key]] as const)
      .filter(([, s]) => s && s.size > 0) as [string, Set<string>][];
    return rows.filter((r) => {
      for (const [key, set] of active) {
        if (!set.has(String(r[key] ?? ''))) return false;
      }
      if (q) {
        const hit =
          String(r['poNumber'] ?? '').toLowerCase().includes(q) ||
          String(r['AWBNumber'] ?? '').toLowerCase().includes(q) ||
          String(r['buyerPhone'] ?? '').toLowerCase().includes(q) ||
          String(r['buyerBusinessName'] ?? '').toLowerCase().includes(q) ||
          String(r['sellerphone'] ?? '').toLowerCase().includes(q) ||
          String(r['sellerbusinessname'] ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, search, filters]);

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

  // ── Frozen left columns ────────────────────────────────────────────────
  // Approve + Act + the first two data columns (poNumber, markedPendingTime by
  // default) stay pinned while the many financial columns scroll horizontally.
  const APPROVE_W = 82;
  const ACT_W = 68;
  const FROZEN_ORDERED = 2; // how many leading ordered columns to pin
  const ORD_W = [80, 92]; // pinned ordered-column widths, left → right
  const orderedLeft = (idx: number) =>
    APPROVE_W + ACT_W + ORD_W.slice(0, idx).reduce((a, b) => a + b, 0);
  // A crisp divider + drop-shadow on the right edge of the frozen block so the
  // scrolling columns visibly tuck UNDER it (no see-through on horizontal scroll).
  const FREEZE_EDGE = {
    boxShadow: 'inset -1px 0 0 0 #cbd5e1, 6px 0 8px -4px rgba(15,23,42,0.18)',
  };

  // Rows the user can still approve (not already approved) — drives select-all.
  const selectableIds = sortedRows
    .map((r) => String(r['purchaseOrderId'] ?? '').trim())
    .filter((id, idx) => id !== '' && !isRowApproved(sortedRows[idx], id));
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });

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
                placeholder="Search PO, AWB, phone, buyer, seller…"
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
              onClick={approveSelected}
              disabled={bulkApproving || selectedIds.size === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 text-white transition-colors shadow-[0_2px_8px_-2px_rgba(16,185,129,0.5)] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Approve all selected orders (sets isApproved with your email + timestamp)"
            >
              {bulkApproving ? '⏳ Approving…' : `✓ Approve selected (${selectedIds.size})`}
            </button>
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

        {/* Filter bar — multi-select (single or many) to cut cognitive load.
            Only dimensions with >1 distinct value appear. */}
        {activeFilterDefs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-slate-200 bg-slate-50/70">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mr-0.5">Filters</span>
            {activeFilterDefs.map((d) => (
              <LightMultiSelect
                key={d.key}
                label={d.label}
                icon={d.icon}
                options={filterOptions[d.key]}
                selected={filters[d.key] ?? EMPTY_SET}
                onToggle={(v) => toggleFilter(d.key, v)}
                onClear={() => clearFilter(d.key)}
              />
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 border border-rose-300 bg-rose-50 hover:bg-rose-100 transition-colors"
              >
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              {rows.length === 0 ? 'No orders in this slab.' : 'No rows match the current search / filters.'}
            </div>
          ) : (
            <table className="text-[11px] border-separate border-spacing-0 leading-tight">
              <thead className="sticky top-0 z-10 shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                <tr>
                  {/* Frozen: Approve column — select-all checkbox */}
                  <th
                    style={{ left: 0, width: APPROVE_W, minWidth: APPROVE_W, zIndex: 30 }}
                    className="sticky top-0 px-2 py-1 text-center align-bottom font-bold uppercase tracking-wide text-[10px] text-slate-700 bg-slate-100 border-b border-r border-slate-200 whitespace-nowrap"
                  >
                    <label className="flex items-center justify-center gap-1 cursor-pointer" title="Select all approvable orders">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={selectableIds.length === 0}
                        className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                      />
                      Approve
                    </label>
                  </th>
                  {/* Frozen: action column (View Items + Freshdesk ticket) */}
                  <th
                    style={{ left: APPROVE_W, width: ACT_W, minWidth: ACT_W, zIndex: 30 }}
                    className="sticky top-0 px-2 py-1 text-left align-bottom font-bold uppercase tracking-wide text-[10px] text-slate-700 bg-slate-100 border-b border-r border-slate-200 whitespace-nowrap"
                  >
                    Act.
                  </th>
                  {orderedCols.map((c, ci) => {
                    const active = sort?.key === c.key;
                    const wrap = WRAP_KEYS.has(c.key);
                    const frozen = ci < FROZEN_ORDERED;
                    const lastFrozen = frozen && ci === FROZEN_ORDERED - 1;
                    return (
                      <th
                        key={c.key}
                        onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== c.key) setDragOverKey(c.key); }}
                        onDragLeave={() => setDragOverKey((k) => (k === c.key ? null : k))}
                        onDrop={(e) => { e.preventDefault(); handleDrop(c.key); }}
                        style={frozen ? { left: orderedLeft(ci), width: ORD_W[ci], minWidth: ORD_W[ci], maxWidth: ORD_W[ci], zIndex: 30, ...(lastFrozen ? FREEZE_EDGE : {}) } : undefined}
                        className={
                          'px-2 py-1 text-left align-bottom font-bold uppercase tracking-wide text-[10px] border-b border-slate-200 bg-slate-100 ' +
                          (frozen ? 'sticky top-0 border-r border-slate-200 ' : (wrap ? 'min-w-[90px] max-w-[140px] ' : 'min-w-[78px] max-w-[120px] ')) +
                          (dragOverKey === c.key ? 'border-l-2 border-l-purple-500 ' : '') +
                          (active ? 'text-purple-700' : 'text-slate-700')
                        }
                      >
                        <span className="flex items-start gap-1">
                          <span
                            draggable
                            onDragStart={(e) => { dragKey.current = c.key; e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => { dragKey.current = null; setDragOverKey(null); }}
                            className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-purple-500 select-none leading-none mt-px"
                            title="Drag to reorder column"
                          >
                            ⠿
                          </span>
                          <span
                            onClick={() => toggleSort(c.key)}
                            className="min-w-0 flex-1 cursor-pointer block break-words [overflow-wrap:anywhere] leading-tight select-none"
                            title="Click to sort"
                          >
                            {c.label}
                            <span className={'ml-0.5 inline-block align-text-bottom ' + (active ? 'opacity-100 text-purple-600' : 'opacity-30')}>
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
                  const rowTone = lightRowTone(r, i);
                  const rid = String(r['purchaseOrderId'] ?? '').trim();
                  const approvedVal = approvedMap[rid] ?? (r['isApproved'] as unknown);
                  const isApproved = approvedVal !== null && approvedVal !== undefined && approvedVal !== '';
                  const selected = selectedIds.has(rid);
                  return (
                    <tr key={i} className={'border-b border-slate-100 transition-colors ' + rowTone}>
                      {/* Frozen: Approve — per-row select checkbox / approved badge */}
                      <td
                        style={{ left: 0, width: APPROVE_W, minWidth: APPROVE_W, zIndex: 2 }}
                        className={'sticky px-2 py-1 border-b border-r border-slate-200 text-center ' + rowTone}
                      >
                        {isApproved ? (
                          <span
                            title={String(approvedVal)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300"
                          >
                            ✓ Approved
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!rid}
                            onChange={() => toggleSelect(rid)}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                            title="Select this PO for bulk approve"
                          />
                        )}
                      </td>
                      {/* Frozen: Actions — compact icon buttons */}
                      <td
                        style={{ left: APPROVE_W, width: ACT_W, minWidth: ACT_W, zIndex: 2 }}
                        className={'sticky px-2 py-1 border-b border-r border-slate-200 whitespace-nowrap ' + rowTone}
                      >
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
                      {orderedCols.map((c, ci) => {
                        const v = r[c.key];
                        const frozen = ci < FROZEN_ORDERED;
                        const lastFrozen = frozen && ci === FROZEN_ORDERED - 1;
                        const frozenStyle = frozen
                          ? { left: orderedLeft(ci), width: ORD_W[ci], minWidth: ORD_W[ci], maxWidth: ORD_W[ci], zIndex: 2, ...(lastFrozen ? FREEZE_EDGE : {}) }
                          : undefined;
                        const frozenCls = frozen ? 'sticky border-r border-slate-200 ' + rowTone + ' ' : '';
                        // poNumber → D2R support detail link.
                        if (c.key === 'poNumber') {
                          return (
                            <td key={c.key} style={frozenStyle} className={'px-2 py-1 border-b border-slate-100 whitespace-nowrap text-left ' + frozenCls}>
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
                            <td key={c.key} style={frozenStyle} className={'px-2 py-1 border-b border-slate-100 whitespace-nowrap text-left tabular-nums ' + frozenCls}>
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
                            style={{ ...(heat ? { backgroundColor: heat } : {}), ...(frozenStyle || {}) }}
                            className={
                              'px-2 py-1 border-b border-slate-100 ' +
                              (frozen ? 'sticky border-r border-slate-100 ' + rowTone + ' ' : '') +
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

// Light-themed searchable multi-select (single or many). Portalled to <body>
// so the modal's overflow can't clip it; positioned under the trigger button.
function LightMultiSelect({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  icon?: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.toLowerCase().includes(s)) : options;
  }, [options, q]);

  const count = selected.size;
  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ' +
          (count > 0
            ? 'bg-purple-100 border-purple-400 text-purple-800'
            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900')
        }
        title={`Filter by ${label.toLowerCase()} (single or multiple)`}
      >
        {icon && <span className="text-sm leading-none">{icon}</span>}
        <span className="font-semibold">{label}</span>
        {count > 0 ? (
          <span className="px-1.5 rounded-full bg-purple-500 text-white text-[10px] font-bold tabular-nums">{count}</span>
        ) : (
          <span className="text-slate-400">All</span>
        )}
        <span className="text-[8px] opacity-60">▼</span>
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[100] w-64 max-h-80 flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/40"
          >
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
            </div>
            <div className="overflow-auto flex-1 p-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-4 text-center text-[11px] text-slate-400">No matches</div>
              ) : (
                filtered.map((o) => {
                  const on = selected.has(o);
                  return (
                    <button
                      key={o}
                      onClick={() => onToggle(o)}
                      className={
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12px] transition-colors ' +
                        (on ? 'bg-purple-50 text-purple-900' : 'text-slate-700 hover:bg-slate-50')
                      }
                    >
                      <span
                        className={
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] leading-none ' +
                          (on ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-300')
                        }
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="truncate" title={o}>{o}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 tabular-nums">
                {count} selected · {options.length} total
              </span>
              <button
                onClick={onClear}
                disabled={count === 0}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
