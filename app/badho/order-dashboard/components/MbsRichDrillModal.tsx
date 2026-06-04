'use client';

import { ReactNode, useEffect, useState } from 'react';
import MultiSelectFilter from './MultiSelectFilter';

const MBS_PAGE_SIZE = 50;

export type MbsCsvCell = string | number | null | undefined;

// Row shape returned by /api/order-list. Mirrors the order-dashboard pivot
// drill modal so brand-performance drills can present the same column set.
export interface MbsOrderRow {
  poNumber: string;
  status: string;
  orderStatus?: string;
  deliveryStatus?: string | null;
  amount: number;
  itemTotal?: number | null;
  grossAmount?: number | null;
  orderMarginDiscount?: number | null;
  paidAmount?: number | null;
  CoupanAmount?: number | null;
  discountBySeller?: number;
  PaymentOptionDiscountByBadho?: number;
  appliedWalletAmount?: number | null;
  PaymentOption?: string | null;
  paymentDate?: string | null;
  paymentEvent?: string | null;
  awbNumber?: string | null;
  courierName?: string | null;
  RefundIntiatedTime?: string | null;
  RefundCompletedTime?: string | null;
  RefundAmount?: number | null;
  codAmountToBeCollected?: number | null;
  pushedStatus?: string;
  MarkedpendingTime?: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerAddress: string;
  buyerFullAddress?: string;
  buyerState: string | null;
  rejectReason?: string | null;
  rejectedBy?: string | null;
  reasonAddedByBadhoTeam?: string | null;
  markedPendingTime: string | null;
  createdAt: string;
  statusMarkedTime?: string | null;
  statusDurationSec?: number | null;
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return String(s); }
}

function mbsSortValue(r: MbsOrderRow, key: string): number | string | null {
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const dt  = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
  switch (key) {
    case 'pushed': return r.pushedStatus ?? '';
    case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
    case 'status': return r.orderStatus ?? r.status ?? '';
    case 'itemTotal': return num(r.itemTotal);
    case 'grossAmount': return num(r.grossAmount);
    case 'orderMarginDiscount': return num(r.orderMarginDiscount);
    case 'paidAmount': return num(r.paidAmount);
    case 'coupon': return num(r.CoupanAmount);
    case 'sellerDiscount': return num(r.discountBySeller);
    case 'badhoDiscount': return num(r.PaymentOptionDiscountByBadho);
    case 'wallet': return num(r.appliedWalletAmount);
    case 'paymentOption': return r.PaymentOption ?? '';
    case 'paymentDate': return dt(r.paymentDate);
    case 'paymentEvent': return r.paymentEvent ?? '';
    case 'awb': return r.awbNumber ?? '';
    case 'courier': return r.courierName ?? '';
    case 'deliveryStatus': return r.deliveryStatus ?? '';
    case 'cod': return num(r.codAmountToBeCollected);
    case 'buyerPhone': return r.buyerPhone ?? '';
    case 'buyerBusiness': return r.buyerBusinessName ?? '';
    case 'sellerPhone': return r.sellerPhone ?? '';
    case 'sellerBusiness': return r.sellerBusinessName ?? '';
    case 'markedPending': return dt(r.MarkedpendingTime ?? r.markedPendingTime);
    case 'refundInit': return dt(r.RefundIntiatedTime);
    case 'refundDone': return dt(r.RefundCompletedTime);
    case 'refundAmount': return num(r.RefundAmount);
    case 'rejectReason': return r.rejectReason ?? '';
    case 'rejectedBy': return r.rejectedBy ?? '';
    case 'reasonByBadho': return r.reasonAddedByBadhoTeam ?? '';
    case 'statusDuration': return r.statusDurationSec ?? null;
    case 'statusMarkedTime': return dt(r.statusMarkedTime);
    default: return '';
  }
}

function buildMbsOptions(
  rows: MbsOrderRow[] | null,
  accessor: (r: MbsOrderRow) => string | null | undefined,
): Array<{ value: string; label: string; count: number }> {
  if (!rows) return [];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = accessor(r) || '__NONE__';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([value, count]) => ({
      value,
      label: value === '__NONE__' ? 'Unspecified' : value,
      count,
    }));
}

function statusMarkedFieldFor(status: string | null | undefined): string {
  switch ((status || '').toUpperCase()) {
    case 'REJECTED':   return 'markedRejectedTime';
    case 'CANCELLED':  return 'markedCancelledTime';
    case 'DELIVERED':  return 'markedDeliveredTime';
    case 'COMPLETED':  return 'markedCompletedTime';
    case 'DISPATCHED': return 'markedDispatchedTime';
    case 'IN_TRANSIT':
    case 'INTRANSIT':  return 'markedInTransitTime';
    case 'IN_PROGRESS':
    case 'INPROGRESS': return 'markedInProgressTime';
    case 'PARTIAL':    return 'markedPartialTime';
    case 'PENDING':    return 'markedPendingTime';
    default:           return 'statusMarkedTime';
  }
}

function statusMarkedHeaderFor(rows: MbsOrderRow[] | null | undefined): string {
  if (!rows || rows.length === 0) return 'Status Marked Time';
  const set = new Set<string>();
  for (const r of rows) {
    const s = (r.orderStatus ?? r.status ?? '').toUpperCase();
    if (s) set.add(s);
    if (set.size > 1) return 'Status Marked Time';
  }
  if (set.size === 1) return statusMarkedFieldFor([...set][0]);
  return 'Status Marked Time';
}

function csvEscape(v: MbsCsvCell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadMbsCSV(filename: string, headers: string[], rows: MbsCsvCell[][]) {
  const body = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export interface MbsRichDrillModalProps {
  open: boolean;
  onClose: () => void;
  rows: MbsOrderRow[] | null;
  loading: boolean;
  error: string | null;
  titleMain: ReactNode;
  titleSub: ReactNode;
  isRejectedContext?: boolean;
  csvFilename: string;
  // When this string changes, internal filter / sort / page state is reset
  // (so opening a new drill always starts fresh).
  resetKey?: string;
}

export default function MbsRichDrillModal({
  open,
  onClose,
  rows,
  loading,
  error,
  titleMain,
  titleSub,
  isRejectedContext = false,
  csvFilename,
  resetKey,
}: MbsRichDrillModalProps) {
  const [search, setSearch] = useState('');
  const [pushedFilter, setPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [paymentFilter, setPaymentFilter] = useState<Set<string>>(new Set());
  const [courierFilter, setCourierFilter] = useState<Set<string>>(new Set());
  const [deliveryFilter, setDeliveryFilter] = useState<Set<string>>(new Set());
  const [rejectReasonFilter, setRejectReasonFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSearch('');
    setPushedFilter('all');
    setPaymentFilter(new Set());
    setCourierFilter(new Set());
    setDeliveryFilter(new Set());
    setRejectReasonFilter(new Set());
    setSort(null);
    setPage(1);
  }, [resetKey]);

  useEffect(() => { setPage(1); }, [search, pushedFilter, paymentFilter, courierFilter, deliveryFilter, rejectReasonFilter, sort]);

  if (!open) return null;

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const resetFilters = () => {
    setSearch('');
    setPushedFilter('all');
    setPaymentFilter(new Set());
    setCourierFilter(new Set());
    setDeliveryFilter(new Set());
    setRejectReasonFilter(new Set());
    setSort(null);
  };

  const totalLoaded = rows?.length ?? 0;
  const pushedCounts = (() => {
    let pushed = 0;
    if (rows) for (const r of rows) if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushed++;
    return { all: totalLoaded, pushed, notPushed: totalLoaded - pushed };
  })();
  const paymentOptions  = buildMbsOptions(rows, (r) => r.PaymentOption);
  const courierOptions  = buildMbsOptions(rows, (r) => r.courierName);
  const deliveryOptions = buildMbsOptions(rows, (r) => r.deliveryStatus);
  const rejectReasonOptions = (() => {
    if (!rows) return [] as Array<{ value: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = (r.rejectReason || '').trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({ value, label: value, count }));
  })();

  const hasActiveFilters =
    search.trim() !== '' ||
    pushedFilter !== 'all' ||
    paymentFilter.size > 0 ||
    courierFilter.size > 0 ||
    deliveryFilter.size > 0 ||
    rejectReasonFilter.size > 0;

  const filteredRows: MbsOrderRow[] | null = (() => {
    if (!rows) return null;
    let out: MbsOrderRow[] = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        (r.poNumber || '').toLowerCase().includes(q) ||
        (r.buyerPhone || '').toLowerCase().includes(q) ||
        (r.sellerPhone || '').toLowerCase().includes(q) ||
        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
        (r.sellerBusinessName || '').toLowerCase().includes(q)
      );
    }
    if (pushedFilter !== 'all') out = out.filter((r) => (r.pushedStatus || 'Not Pushed') === pushedFilter);
    if (paymentFilter.size > 0)  out = out.filter((r) => paymentFilter.has(r.PaymentOption || '__NONE__'));
    if (courierFilter.size > 0)  out = out.filter((r) => courierFilter.has(r.courierName || '__NONE__'));
    if (deliveryFilter.size > 0) out = out.filter((r) => deliveryFilter.has(r.deliveryStatus || '__NONE__'));
    if (rejectReasonFilter.size > 0) out = out.filter((r) => rejectReasonFilter.has((r.rejectReason || '').trim()));
    if (sort) {
      const { key, direction } = sort;
      out = [...out].sort((a, b) => {
        const av = mbsSortValue(a, key);
        const bv = mbsSortValue(b, key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        return direction === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  })();
  const filteredCount = filteredRows?.length ?? 0;

  const paged = (() => {
    if (!filteredRows) return null;
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / MBS_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * MBS_PAGE_SIZE;
    const endIdx = Math.min(startIdx + MBS_PAGE_SIZE, filteredRows.length);
    return { totalPages, safePage, startIdx, endIdx, rows: filteredRows.slice(startIdx, endIdx) };
  })();

  const arrowFor = (k: string) => {
    const active = sort?.key === k;
    const dir = active ? sort?.direction : null;
    return (
      <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>
        {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
      </span>
    );
  };
  const SortTh = ({ k, label, align = 'left', cls = '' }: { k: string; label: string; align?: 'left' | 'right'; cls?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-${align} text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${cls || 'text-slate-700'}`}
    >
      <span className={`inline-flex items-center ${align === 'right' ? 'justify-end w-full' : ''}`}>{label}{arrowFor(k)}</span>
    </th>
  );

  const handleCsvExport = () => {
    if (!filteredRows) return;
    const headers = [
      'Pushed', 'PO Number', 'Order Status', 'Buyer Address', 'Item Total', 'Gross Amount', 'Order Margin Discount', 'Paid Amount', 'Coupon Amount',
      'Seller Discount', 'Applied Wallet Amount', 'Payment Option',
      'AWB Number', 'Courier Name', 'COD Amount', 'Buyer Phone',
      'Payment Option Badho Discount', 'Payment Date', 'Payment Event',
      'Delivery Status', 'Buyer Business', 'Seller Phone', 'Seller Business',
      'Marked Pending', statusMarkedHeaderFor(filteredRows), 'Status Duration (sec)',
      'Refund Initiated', 'Refund Completed', 'Refund Amount',
      ...(isRejectedContext ? ['Reject Reason', 'Rejected By', 'Reason Added By Badho Team'] : []),
    ];
    const csvRows: MbsCsvCell[][] = filteredRows.map((r) => [
      r.pushedStatus ?? 'Not Pushed', r.poNumber, r.orderStatus ?? r.status, r.buyerFullAddress ?? r.buyerAddress ?? '',
      r.itemTotal ?? '', r.grossAmount ?? '', r.orderMarginDiscount ?? '', r.paidAmount ?? '', r.CoupanAmount ?? '',
      r.discountBySeller ?? '', r.appliedWalletAmount ?? '', r.PaymentOption ?? '',
      r.awbNumber ?? '', r.courierName ?? '', r.codAmountToBeCollected ?? '', r.buyerPhone ?? '',
      r.PaymentOptionDiscountByBadho ?? '', r.paymentDate ?? '', r.paymentEvent ?? '',
      r.deliveryStatus ?? '', r.buyerBusinessName ?? '', r.sellerPhone ?? '', r.sellerBusinessName ?? '',
      r.MarkedpendingTime ?? r.markedPendingTime ?? '',
      r.statusMarkedTime ?? '', r.statusDurationSec ?? '',
      r.RefundIntiatedTime ?? '', r.RefundCompletedTime ?? '', r.RefundAmount ?? '',
      ...(isRejectedContext ? [r.rejectReason ?? '', r.rejectedBy ?? '', r.reasonAddedByBadhoTeam ?? ''] : []),
    ]);
    downloadMbsCSV(csvFilename, headers, csvRows);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-slate-900 border border-slate-200 rounded-2xl w-[97vw] max-w-[97vw] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-slate-900 truncate">{titleMain}</h3>
            <p className="text-slate-500 text-xs mt-0.5 truncate">{titleSub}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]"
              disabled={!filteredRows || filteredRows.length === 0}
              onClick={handleCsvExport}
            >
              ↓ CSV
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="relative px-4 py-2 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-64 max-w-full">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, buyer, seller…"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            <div role="group" aria-label="Filter by pushed status" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
              {([
                { value: 'all' as const, label: 'All', count: pushedCounts.all },
                { value: 'Pushed' as const, label: 'Pushed', count: pushedCounts.pushed },
                { value: 'Not Pushed' as const, label: 'Not Pushed', count: pushedCounts.notPushed },
              ]).map((opt, idx) => {
                const active = pushedFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPushedFilter(opt.value)}
                    aria-pressed={active}
                    className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                    <span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                  </button>
                );
              })}
            </div>

            {paymentOptions.length > 1 && (
              <MultiSelectFilter
                label="Payment"
                allLabel="All payments"
                options={paymentOptions}
                selected={paymentFilter}
                onChange={setPaymentFilter}
                widthClass="w-44"
              />
            )}
            {courierOptions.length > 1 && (
              <MultiSelectFilter
                label="Courier"
                allLabel="All couriers"
                options={courierOptions}
                selected={courierFilter}
                onChange={setCourierFilter}
                widthClass="w-44"
              />
            )}
            {deliveryOptions.length > 1 && (
              <MultiSelectFilter
                label="Delivery"
                allLabel="All delivery"
                options={deliveryOptions}
                selected={deliveryFilter}
                onChange={setDeliveryFilter}
                widthClass="w-44"
              />
            )}
            {rejectReasonOptions.length > 0 && (
              <MultiSelectFilter
                label="Reason"
                allLabel="All reasons"
                options={rejectReasonOptions}
                selected={rejectReasonFilter}
                onChange={setRejectReasonFilter}
                widthClass="w-48"
              />
            )}

            <span className="ml-auto text-[11px] font-semibold text-slate-600 whitespace-nowrap">
              {loading ? 'Loading…' : `${filteredCount.toLocaleString('en-IN')} of ${totalLoaded.toLocaleString('en-IN')} order${totalLoaded === 1 ? '' : 's'}`}
            </span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="absolute right-4 -bottom-3 text-[11px] font-semibold text-purple-600 hover:text-purple-700 underline underline-offset-2"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Table */}
        <div className="relative flex-1 overflow-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
          ) : error ? (
            <div className="px-6 py-12 text-center text-rose-600">{error}</div>
          ) : !rows || rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
          ) : !filteredRows || filteredRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">No matches for current filters</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                <tr className="border-b border-slate-200">
                  <th
                    onClick={() => toggleSort('markedPending')}
                    className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"
                  >
                    <span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span>
                  </th>
                  <th
                    onClick={() => toggleSort('pushed')}
                    className="sticky top-0 left-[160px] z-30 bg-slate-100 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700"
                  >
                    <span className="inline-flex items-center">Pushed{arrowFor('pushed')}</span>
                  </th>
                  <th
                    onClick={() => toggleSort('poNumber')}
                    className="sticky top-0 left-[280px] z-30 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
                  >
                    <span className="inline-flex items-center">PO Number{arrowFor('poNumber')}</span>
                  </th>
                  <SortTh k="status" label="Order Status" />
                  <SortTh k="itemTotal" label="Item Total" align="right" />
                  <SortTh k="grossAmount" label="Gross Amount" align="right" />
                  <SortTh k="orderMarginDiscount" label="Order Margin Discount" align="right" />
                  <SortTh k="coupon" label="Coupon Amount" align="right" />
                  <SortTh k="wallet" label="Applied Wallet Amount" align="right" />
                  <SortTh k="sellerDiscount" label="Seller Discount" align="right" />
                  <SortTh k="badhoDiscount" label="Payment Option Badho Discount" align="right" />
                  <SortTh k="cod" label="COD Amount" align="right" />
                  <SortTh k="deliveryStatus" label="Delivery Status" />
                  <SortTh k="paidAmount" label="Paid Amount" align="right" />
                  <SortTh k="paymentOption" label="Payment Option" />
                  <SortTh k="awb" label="AWB Number" />
                  <SortTh k="courier" label="Courier Name" />
                  <SortTh k="paymentDate" label="Payment Date" />
                  <SortTh k="paymentEvent" label="Payment Event" />
                  <SortTh k="buyerBusiness" label="Buyer Business" />
                  <SortTh k="buyerPhone" label="Buyer Phone" />
                  <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Buyer Address</th>
                  <SortTh k="sellerBusiness" label="Seller Business" />
                  <SortTh k="sellerPhone" label="Seller Phone" />
                  <SortTh k="statusMarkedTime" label={statusMarkedHeaderFor(filteredRows)} cls="text-slate-700 bg-amber-50/60" />
                  <SortTh k="statusDuration" label="Status Duration" cls="text-slate-700 bg-amber-50/60" />
                  <SortTh k="refundInit" label="Refund Initiated" />
                  <SortTh k="refundDone" label="Refund Completed" />
                  <SortTh k="refundAmount" label="Refund Amount" align="right" />
                  <SortTh k="rejectReason" label="Reject Reason" cls="text-rose-700 bg-rose-50" />
                  <SortTh k="rejectedBy" label="Rejected By" cls="text-rose-700 bg-rose-50" />
                  <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="text-rose-700 bg-rose-50" />
                </tr>
              </thead>
              <tbody>
                {(paged?.rows || filteredRows).map((r, idx) => {
                  const paid = Number(r.paidAmount ?? 0);
                  const isFullyPaid   = r.PaymentOption === 'FULLY_PAID' && paid > 0;
                  const isPartialPaid = r.PaymentOption === 'PARTIALLY_PAID' && paid > 0;
                  const rowBg = isFullyPaid
                    ? 'bg-emerald-50'
                    : isPartialPaid
                    ? 'bg-violet-50'
                    : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50');
                  const fmtAmt = (n: number | null | undefined) => n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>;
                  return (
                    <tr key={r.poNumber} className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}>
                      <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>
                        {formatDateTime(r.MarkedpendingTime ?? r.markedPendingTime)}
                      </td>
                      <td className={`sticky left-[160px] z-10 ${rowBg} group-hover:bg-purple-50 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2 whitespace-nowrap`}>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.pushedStatus === 'Pushed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${r.pushedStatus === 'Pushed' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'}`} />
                          {r.pushedStatus || 'Not Pushed'}
                        </span>
                      </td>
                      <td className={`sticky left-[280px] z-10 ${rowBg} group-hover:bg-purple-50 px-2.5 py-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`}>
                        <div className="inline-flex items-center gap-2">
                          <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                          <a
                            href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-all"
                            title="Open in D2R Support Dashboard"
                          >
                            Details
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M7 17L17 7" />
                              <polyline points="7 7 17 7 17 17" />
                            </svg>
                          </a>
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus ?? r.status}</td>
                      <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{fmtAmt(r.itemTotal)}</td>
                      <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{fmtAmt(r.grossAmount)}</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount ? `₹${Number(r.orderMarginDiscount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount ? `₹${Number(r.CoupanAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? `₹${Number(r.appliedWalletAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? `₹${Number(r.discountBySeller).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null ? `₹${Number(r.codAmountToBeCollected).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{r.deliveryStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatus}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{fmtAmt(r.paidAmount)}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap">{r.awbNumber || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate ? formatDateTime(r.paymentDate) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 font-medium whitespace-nowrap" title={r.buyerBusinessName ?? ''}>{r.buyerBusinessName || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap">{r.buyerPhone || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-600 max-w-[260px] truncate" title={r.buyerFullAddress || r.buyerAddress}>{r.buyerFullAddress || r.buyerAddress || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap" title={r.sellerBusinessName ?? ''}>{r.sellerBusinessName || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap">{r.sellerPhone || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-amber-800 whitespace-nowrap bg-amber-50/60">{formatDateTime(r.statusMarkedTime)}</td>
                      <td className="px-2.5 py-2 text-amber-800 tabular-nums whitespace-nowrap bg-amber-50/60">{r.statusDurationSec != null ? `${(r.statusDurationSec / 86400).toFixed(1)}d` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.RefundIntiatedTime ? formatDateTime(r.RefundIntiatedTime) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.RefundCompletedTime ? formatDateTime(r.RefundCompletedTime) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.RefundAmount != null ? `₹${Number(r.RefundAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/60">{r.rejectReason || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/60">{r.rejectedBy || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/60">{r.reasonAddedByBadhoTeam || <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {paged && filteredRows && filteredRows.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600 flex-wrap gap-2">
            <div>
              Showing <span className="font-semibold text-slate-900">{paged.startIdx + 1}</span>–<span className="font-semibold text-slate-900">{paged.endIdx}</span> of <span className="font-semibold text-slate-900">{filteredRows.length.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={paged.safePage <= 1}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-slate-500">Page <span className="text-slate-900 font-semibold">{paged.safePage}</span> of {paged.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                disabled={paged.safePage >= paged.totalPages}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
