'use client';

import { useEffect, useState } from 'react';
import { PoModifiedMarker } from '../poModifiedMarker';

// Reusable PO Items + Price Breakup modal. Mirrors the inline "View Items"
// modal on the order-dashboard page so every "View Items" button across the
// app (order-dashboard, brand-performance drills) shows the identical UI.
// Opened by setting `poNumber`; pass an optional partial `breakup` for an
// optimistic price panel that is overwritten once /api/po-financials returns.

export interface PoItemRow {
  id: string;
  brandSKUId: string;
  skuLabel: string | null;
  brandLabel: string | null;
  status: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  unitPrice: number | null;
  discount: number | null;
  amount: number | null;
  total: number | null;
  isAccepted: boolean | null;
  isRejected: boolean | null;
  rejectedComment: string | null;
}

export interface PriceBreakup {
  orderAmount: number | null;
  itemTotalAmount?: number | null;
  itemDiscount?: number | null;
  couponAmount: number | null;
  badhoDiscount: number | null;
  appliedWalletAmount: number | null;
  paidAmount?: number | null;
  sellerDiscount?: number | null;
  upiDiscountBySeller?: number | null;
  volumeDiscount?: number | null;
  totalDiscount?: number | null;
  paymentOption?: string | null;
}

interface PoItemsModalProps {
  poNumber: string | null;
  breakup?: PriceBreakup | null;
  onClose: () => void;
}

export default function PoItemsModal({ poNumber, breakup: initialBreakup = null, onClose }: PoItemsModalProps) {
  const [data, setData] = useState<PoItemRow[] | null>(null);
  const [totals, setTotals] = useState<{ items: number; qty: number; amount: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'amount' | 'qty' | 'name'>('amount');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priceBreakup, setPriceBreakup] = useState<PriceBreakup | null>(initialBreakup);

  useEffect(() => {
    if (!poNumber) return;
    let cancelled = false;
    setData(null);
    setTotals(null);
    setError(null);
    setSearch('');
    setSort('amount');
    setStatusFilter('all');
    setPriceBreakup(initialBreakup ?? null);
    setLoading(true);
    // Always fetch the full breakup — inline callers only supply a partial set
    // (no UPI / volume discount), so use theirs optimistically and overwrite
    // with the complete, aggregated figures once they arrive.
    fetch(`/api/po-financials?poNumber=${encodeURIComponent(poNumber)}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json?.data) setPriceBreakup(json.data as PriceBreakup); })
      .catch(() => { /* keep optimistic / null breakup; modal still usable */ });
    (async () => {
      try {
        const res = await fetch(`/api/po-items?poNumber=${encodeURIComponent(poNumber)}`);
        if (!res.ok) throw new Error('Failed to fetch items');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (cancelled) return;
        setData(json.data);
        setTotals(json.totals);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poNumber]);

  useEffect(() => {
    if (!poNumber) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poNumber]);

  if (!poNumber) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gradient-to-br from-slate-950/85 via-indigo-950/85 to-purple-950/85 backdrop-blur-lg animate-modal-fade gap-4"
      onClick={onClose}
    >
      <div
        className={`relative bg-white text-slate-900 rounded-2xl ${priceBreakup ? 'w-[60vw] max-w-3xl' : 'w-[94vw] max-w-5xl'} max-h-[88vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45),0_0_60px_-10px_rgba(168,85,247,0.3)] border border-slate-200 animate-modal-scale`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header — minimal */}
        <header className="relative px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white overflow-hidden flex items-center justify-between gap-4">
          <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.14)_50%,transparent_70%)] bg-[length:200%_100%] animate-shimmer pointer-events-none" />
          <div className="relative flex items-baseline gap-3 min-w-0">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">PO</span>
            <h3 className="text-xl font-extrabold tracking-tight truncate">{poNumber}</h3>
            <PoModifiedMarker poNumber={poNumber} className="h-5 min-w-[20px] text-[12px]" />
            {totals && (
              <span className="hidden sm:flex items-baseline gap-4 ml-4 text-[12px] text-white/85">
                <span><span className="font-bold tabular-nums">{totals.items}</span> <span className="text-white/60">SKUs</span></span>
                <span><span className="font-bold tabular-nums">{totals.qty.toLocaleString('en-IN')}</span> <span className="text-white/60">qty</span></span>
                <span className="font-bold tabular-nums text-base">₹{totals.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="relative shrink-0 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-all hover:rotate-90"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* Toolbar — compact single row */}
        {data && data.length > 0 && (() => {
          const statusCounts = data.reduce<Record<string, number>>((acc, it) => {
            const s = it.status || '—';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {});
          const statusOrder = ['REJECTED', 'PENDING', 'IN_PROGRESS', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
          const sortedStatuses = Object.keys(statusCounts).sort((a, b) => {
            const ai = statusOrder.indexOf(a); const bi = statusOrder.indexOf(b);
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
          });
          const dotFor: Record<string, string> = {
            'REJECTED':    'bg-rose-500',
            'DELIVERED':   'bg-emerald-500',
            'COMPLETED':   'bg-emerald-500',
            'DISPATCHED':  'bg-blue-500',
            'IN_TRANSIT':  'bg-cyan-500',
            'IN_PROGRESS': 'bg-amber-500',
            'PENDING':     'bg-slate-400',
          };
          return (
            <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2 flex-wrap text-xs">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search SKU…"
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-300"
                />
              </div>
              <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden bg-white">
                {(['amount', 'qty', 'name'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                      sort === s ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap ml-auto">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  All <span className="opacity-70 tabular-nums">{data.length}</span>
                </button>
                {sortedStatuses.map((s) => {
                  const active = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(active ? 'all' : s)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dotFor[s] || 'bg-slate-400'}`} />
                      {s} <span className="opacity-70 tabular-nums">{statusCounts[s]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Body — clean table */}
        <div className="relative flex-1 overflow-auto">
          {loading ? (
            <div className="px-6 py-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="rounded-md h-10 animate-shimmer-skeleton"
                  style={{ backgroundSize: '400% 100%', animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center text-rose-600 text-sm">⚠ {error}</div>
          ) : !data || data.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500 text-sm">No items found for this PO</div>
          ) : (() => {
            const maxAmount = Math.max(...data.map((i) => i.amount || 0), 1);
            const topAmount = maxAmount;
            const dotFor: Record<string, string> = {
              'REJECTED':    'bg-rose-500',
              'DELIVERED':   'bg-emerald-500',
              'COMPLETED':   'bg-emerald-500',
              'DISPATCHED':  'bg-blue-500',
              'IN_TRANSIT':  'bg-cyan-500',
              'IN_PROGRESS': 'bg-amber-500',
              'PENDING':     'bg-slate-400',
            };
            const textFor: Record<string, string> = {
              'REJECTED':    'text-rose-700',
              'DELIVERED':   'text-emerald-700',
              'COMPLETED':   'text-emerald-700',
              'DISPATCHED':  'text-blue-700',
              'IN_TRANSIT':  'text-cyan-700',
              'IN_PROGRESS': 'text-amber-700',
              'PENDING':     'text-slate-600',
            };

            const q = search.trim().toLowerCase();
            let rows = data.filter((it) =>
              (statusFilter === 'all' || it.status === statusFilter) &&
              (q === '' ||
                (it.skuLabel || '').toLowerCase().includes(q) ||
                (it.brandLabel || '').toLowerCase().includes(q))
            );
            rows = [...rows].sort((a, b) => {
              if (sort === 'amount') return (b.amount || 0) - (a.amount || 0);
              if (sort === 'qty')    return (b.quantity || 0) - (a.quantity || 0);
              return (a.skuLabel || '').localeCompare(b.skuLabel || '');
            });

            if (rows.length === 0) {
              return <div className="px-6 py-16 text-center text-slate-500 text-sm">No items match your filters</div>;
            }

            return (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    <th className="px-3 py-2 text-left w-8 border-b border-slate-200">#</th>
                    <th className="pl-2 pr-3 py-2 text-left border-b border-slate-200">SKU</th>
                    <th className="px-3 py-2 text-left border-b border-slate-200 w-32">Status</th>
                    <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Qty</th>
                    <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Unit</th>
                    <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Discount</th>
                    <th className="px-3 py-2 text-right border-b border-slate-200 w-40">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it, idx) => {
                    const barPct = it.amount ? Math.max(2, (it.amount / maxAmount) * 100) : 0;
                    const isTop = it.amount != null && it.amount === topAmount && data.length > 1;
                    return (
                      <tr
                        key={it.id}
                        className={`group transition-colors hover:bg-indigo-50/50 animate-card-in ${isTop ? 'bg-amber-50/60' : ''}`}
                        style={{ animationDelay: `${idx * 25}ms` }}
                      >
                        <td className={`px-3 py-2.5 text-[11px] tabular-nums border-b border-slate-100 font-semibold ${isTop ? 'text-amber-600' : 'text-slate-400'}`}>
                          {isTop ? '★' : idx + 1}
                        </td>
                        <td className="pl-2 pr-3 py-2.5 border-b border-slate-100">
                          <div className={`font-semibold break-words ${isTop ? 'text-amber-900' : 'text-slate-900'}`} title={it.skuLabel || undefined}>
                            {it.skuLabel || <span className="text-slate-400 italic font-normal">Unnamed SKU</span>}
                          </div>
                          {it.brandLabel && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 break-words">
                              <span className="text-indigo-400 font-bold uppercase tracking-wide">Brand</span>
                              <span className="text-indigo-700">{it.brandLabel}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-slate-100">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${textFor[it.status || ''] || 'text-slate-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotFor[it.status || ''] || 'bg-slate-400'}`} />
                            {it.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums border-b border-slate-100">
                          <span className="font-semibold text-slate-900">{it.quantity != null ? it.quantity.toLocaleString('en-IN') : '—'}</span>
                          {it.quantityUnit ? <span className="text-[10px] text-slate-400 ml-0.5">{it.quantityUnit}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-b border-slate-100">
                          {it.unitPrice != null ? `₹${it.unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums border-b border-slate-100">
                          {it.discount ? <span className="text-amber-600 font-medium">−₹{it.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right border-b border-slate-100">
                          <div className={`font-bold tabular-nums leading-none ${isTop ? 'text-amber-700' : 'text-slate-900'}`}>
                            {it.amount != null ? `₹${it.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                          </div>
                          <div className="mt-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${isTop ? 'bg-amber-400' : 'bg-gradient-to-r from-indigo-400 to-fuchsia-500'}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>

        {/* Footer — single clean line */}
        {totals && data && data.length > 0 && (
          <footer className="px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {totals.items} SKU{totals.items === 1 ? '' : 's'} · Order Total
            </span>
            <span className="flex items-baseline gap-5">
              <span className="text-slate-500">
                <span className="font-bold tabular-nums text-slate-900 text-sm">{totals.qty.toLocaleString('en-IN')}</span> qty
              </span>
              <span className="text-xl font-extrabold tabular-nums bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent leading-none">
                ₹{totals.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </span>
          </footer>
        )}
      </div>

      {/* Price Breakup — sleek companion panel on the right */}
      {priceBreakup && (() => {
        const gross = priceBreakup.orderAmount ?? 0;            // GrossAmount = amount + platformMarginDiscount
        const itemTotal = priceBreakup.itemTotalAmount ?? 0;    // Item Total Amount = po.amount
        const itemDisc = priceBreakup.itemDiscount ?? 0;        // platformMarginDiscount
        const coupon = priceBreakup.couponAmount ?? 0;
        const sellerDisc = priceBreakup.sellerDiscount ?? 0;
        const badho = priceBreakup.badhoDiscount ?? 0;
        const upiDisc = priceBreakup.upiDiscountBySeller ?? 0;
        const volumeDisc = priceBreakup.volumeDiscount ?? 0;
        const wallet = priceBreakup.appliedWalletAmount ?? 0;
        const anotherDisc = priceBreakup.totalDiscount ?? 0;    // AnotherDiscount = po.totalDiscount
        const paid = priceBreakup.paidAmount ?? 0;
        // Spec: Total Discount = every discount component (incl. item discount).
        const totalDiscount = itemDisc + coupon + sellerDisc + badho + upiDisc + volumeDisc + wallet + anotherDisc;
        // Amount to be paid = Item Total Amount − Total Discount.
        const amountToBePaid = itemTotal - totalDiscount;
        // Net Payable = Amount to be paid − Paid Amount.
        const netPayable = amountToBePaid - paid;
        const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;

        type DLine = { key: string; label: string; value: number; iconBg: string; icon: React.ReactNode };
        // The eight discount components that sum to Total Discount — every one
        // is shown, ₹0 included, in the same order as the source breakup.
        const discountLines: DLine[] = [
          {
            key: 'itemDisc', label: 'Item Discount', value: itemDisc, iconBg: 'from-slate-400 to-slate-500',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>),
          },
          {
            key: 'coupon', label: 'Coupon Applied', value: coupon, iconBg: 'from-fuchsia-500 to-pink-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4Z" /><line x1="15" y1="9" x2="9" y2="15" /></svg>),
          },
          {
            key: 'sellerDisc', label: 'Discount by Seller', value: sellerDisc, iconBg: 'from-rose-500 to-red-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>),
          },
          {
            key: 'badho', label: 'Payment Discount by Badho', value: badho, iconBg: 'from-amber-500 to-orange-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 8.5 12 2" /></svg>),
          },
          {
            key: 'upiDisc', label: 'UPI Discount by Seller', value: upiDisc, iconBg: 'from-violet-500 to-purple-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>),
          },
          {
            key: 'volumeDisc', label: 'Applied Volume Discount', value: volumeDisc, iconBg: 'from-sky-500 to-blue-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>),
          },
          {
            key: 'wallet', label: 'Applied Wallet Amount', value: wallet, iconBg: 'from-cyan-500 to-teal-600',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>),
          },
          {
            key: 'anotherDisc', label: 'Another Discount', value: anotherDisc, iconBg: 'from-slate-400 to-slate-500',
            icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2V2Z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /></svg>),
          },
        ];
        const fullyCovered = netPayable <= 0.005;
        return (
          <div
            className="relative w-[34vw] max-w-md max-h-[88vh] flex flex-col overflow-hidden rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45),0_0_60px_-10px_rgba(168,85,247,0.3)] animate-modal-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-fuchsia-200/40 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />

            <header className="relative px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-fuchsia-50 via-white to-indigo-50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(217,70,239,0.55)]">
                    <span className="text-white font-extrabold text-sm leading-none">₹</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-purple-600 font-bold">Price Breakup</div>
                    <div className="text-slate-900 font-bold text-sm leading-tight truncate">PO {poNumber} <PoModifiedMarker poNumber={poNumber} /></div>
                  </div>
                </div>
                {(() => {
                  const opt = priceBreakup.paymentOption ? String(priceBreakup.paymentOption) : 'PENDING';
                  const styles: Record<string, string> = {
                    FULLY_PAID:     'bg-emerald-100 text-emerald-700 border-emerald-300',
                    PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-300',
                    COD:            'bg-cyan-100 text-cyan-700 border-cyan-300',
                    PENDING:        'bg-rose-100 text-rose-700 border-rose-300',
                  };
                  const cls = styles[opt] || 'bg-slate-100 text-slate-700 border-slate-300';
                  return (
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-0.5">Payment</div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {opt}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </header>

            <div className="relative flex-1 overflow-y-auto px-4 py-2.5 space-y-2">
              {/* Order value — Gross & Item Total side by side */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-indigo-500 font-bold leading-tight">Gross Amount</div>
                  <div className="tabular-nums font-extrabold text-[15px] text-slate-900 leading-tight">{fmt(gross)}</div>
                  <div className="text-[9px] text-slate-400 leading-tight">items + item discount</div>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-violet-500 font-bold leading-tight">Item Total Amount</div>
                  <div className="tabular-nums font-extrabold text-[15px] text-slate-900 leading-tight">{fmt(itemTotal)}</div>
                  <div className="text-[9px] text-slate-400 leading-tight">base for payable</div>
                </div>
              </div>

              {/* Discount components */}
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-1 px-1">Discounts</div>
                <div className="space-y-1">
                  {discountLines.map((ln) => (
                    <div
                      key={ln.key}
                      className="flex items-center gap-2.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200"
                    >
                      <div className={`shrink-0 w-6 h-6 rounded-md bg-gradient-to-br ${ln.iconBg} flex items-center justify-center`}>
                        {ln.icon}
                      </div>
                      <div className="min-w-0 flex-1 text-[11px] font-semibold text-slate-700 truncate">{ln.label}</div>
                      <div className={`tabular-nums font-bold text-[12px] ${ln.value > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {ln.value > 0 ? '− ' : ''}{fmt(ln.value)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Total Discount subtotal */}
                <div className="flex items-center justify-between gap-3 mt-1.5 px-2.5 py-1.5 rounded-md bg-rose-50 border border-rose-200">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-rose-700">Total Discount</span>
                  <span className="tabular-nums font-extrabold text-sm text-rose-700">− {fmt(totalDiscount)}</span>
                </div>
              </div>
            </div>

            <footer className="relative px-4 py-2.5 border-t border-slate-200 bg-gradient-to-r from-emerald-50 via-emerald-100/60 to-emerald-50">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-700 font-semibold leading-tight">Amount to be paid<span className="block text-[9px] text-slate-400 font-normal">Item Total − Total Discount</span></span>
                <span className="tabular-nums font-extrabold text-slate-900">{fmt(amountToBePaid)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1 text-[11px]">
                <span className="text-slate-600">{priceBreakup.paymentOption === 'PARTIALLY_PAID' ? 'Partial paid' : 'Paid amount'}</span>
                <span className="tabular-nums font-bold text-emerald-700">{paid > 0 ? '− ' : ''}{fmt(paid)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1.5 pt-2 border-t border-emerald-200">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${fullyCovered ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]'} animate-pulse`} />
                  <span className={`text-[10px] uppercase tracking-[0.25em] font-bold ${fullyCovered ? 'text-emerald-700' : 'text-amber-700'}`}>Net Payable</span>
                </div>
                <span className={`tabular-nums text-xl font-extrabold bg-clip-text text-transparent ${fullyCovered ? 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700' : 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700'}`}>
                  {netPayable < 0 ? `− ${fmt(Math.abs(netPayable))}` : fmt(netPayable)}
                </span>
              </div>
            </footer>
          </div>
        );
      })()}
    </div>
  );
}
