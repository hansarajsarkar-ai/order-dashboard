'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ColumnDef,
  formatValue,
  isNumericCol,
  cellToneClass,
  rowToneClass,
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
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

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
  if (!s) return <span className="text-purple-500/40">—</span>;
  return (
    <a
      href={`https://one.delhivery.com/shipments/forward/${encodeURIComponent(s)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer"
      title="Track this shipment on Delhivery"
    >
      {s}
    </a>
  );
}

export default function DetailsModal({ title, subtitle, columns, rows, onClose }: Props) {
  const [search, setSearch] = useState('');
  // PO Items / Price Breakup sub-modal — opened from a row's "View Items" button.
  const [poItems, setPoItems] = useState<{ poNumber: string; breakup: PriceBreakup } | null>(null);

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
    const header = columns.map((c) => esc(c.label)).join(',');
    const body = filteredRows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[97vw] max-h-[92vh] flex flex-col rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 to-purple-950/90 shadow-[0_0_60px_rgba(217,70,239,0.25)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-purple-300/80 mt-0.5">{subtitle}</p>}
            <p className="text-xs text-fuchsia-300 mt-1 font-semibold">
              {filteredRows.length.toLocaleString('en-IN')}
              {filteredRows.length !== rows.length ? ` / ${rows.length.toLocaleString('en-IN')}` : ''}{' '}
              {rows.length === 1 ? 'order' : 'orders'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, AWB, buyer, seller…"
                className="w-60 pl-3 pr-7 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:border-fuchsia-400/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/30"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-purple-300/70 hover:text-white text-xs px-1"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={downloadCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-purple-100 hover:bg-white/10 transition-colors"
            >
              ⬇ CSV
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-purple-200 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1">
          {filteredRows.length === 0 ? (
            <div className="p-12 text-center text-purple-300/70 text-sm">
              {rows.length === 0 ? 'No orders in this slab.' : 'No rows match the current search.'}
            </div>
          ) : (
            <table className="text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {/* Action columns mirror the monthly drill modal */}
                  <th className="px-3 py-2 text-left font-semibold text-purple-200 bg-slate-900/95 border-b border-white/15 whitespace-nowrap">
                    Items
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-purple-200 bg-slate-900/95 border-b border-white/15 whitespace-nowrap">
                    View Ticket
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="px-3 py-2 text-left font-semibold text-purple-200 bg-slate-900/95 border-b border-white/15 whitespace-nowrap"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const po = String(r['poNumber'] ?? '');
                  return (
                    <tr key={i} className={'transition-colors ' + rowToneClass(r)}>
                      {/* View Items */}
                      <td className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!po}
                          onClick={() => setPoItems({ poNumber: po, breakup: buildBreakup(r) })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-[11px] font-bold border border-emerald-400/30 hover:border-emerald-400/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          title="View items in this PO"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                          View Items
                        </button>
                      </td>
                      {/* View Ticket */}
                      <td className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap">
                        {po ? (
                          <a
                            href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(po)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-[11px] font-bold border border-sky-400/30 hover:border-sky-400/50 transition-all"
                            title={`Search Freshdesk tickets for PO ${po}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="11" cy="11" r="7" />
                              <path d="m20 20-3.5-3.5" />
                            </svg>
                            View Ticket
                          </a>
                        ) : (
                          <span className="text-purple-500/40">—</span>
                        )}
                      </td>
                      {columns.map((c) => {
                        const v = r[c.key];
                        // poNumber → D2R support detail link.
                        if (c.key === 'poNumber') {
                          return (
                            <td key={c.key} className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap text-left">
                              {po ? (
                                <a
                                  href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(po)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-bold text-fuchsia-300 hover:text-fuchsia-200 hover:underline cursor-pointer"
                                  title="Open in D2R Support Dashboard"
                                >
                                  {formatValue(c, v)}
                                </a>
                              ) : (
                                <span className="text-purple-500/40">—</span>
                              )}
                            </td>
                          );
                        }
                        // AWB → Delhivery tracking link.
                        if (c.key === 'AWBNumber') {
                          return (
                            <td key={c.key} className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap text-left tabular-nums">
                              {awbLink(v)}
                            </td>
                          );
                        }
                        const isNum = isNumericCol(v, c.key);
                        const tone = cellToneClass(c, v);
                        const heat = heatBg(c, v, maxLoss);
                        return (
                          <td
                            key={c.key}
                            style={heat ? { backgroundColor: heat } : undefined}
                            className={
                              'px-3 py-1.5 border-b border-white/5 whitespace-nowrap ' +
                              (isNum ? 'text-right tabular-nums ' : 'text-left ') +
                              (heat ? 'text-rose-50 font-semibold' : tone || 'text-purple-100/90')
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
