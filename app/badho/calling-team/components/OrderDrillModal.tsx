'use client';

import { useEffect, useMemo, useState } from 'react';
import MultiSelectFilter from '../../order-dashboard/components/MultiSelectFilter';

// One order row in a drill-down: full order detail (same shape as /api/order-list)
// plus the attributing call's duration + recording (from agent-orders-daily-drill).
export interface DrillOrderRow {
  poNumber: string;
  MarkedpendingTime: string | null;
  markedPendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: number | null;
  poAmount: number | null;
  itemTotal?: number | null;
  grossAmount?: number | null;
  orderMarginDiscount?: number | null;
  CoupanAmount: number | null;
  orderStatus: string;
  status: string;
  discountBySeller: number;
  PaymentOptionDiscountByBadho: number;
  appliedWalletAmount: number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: number | null;
  codAmountToBeCollected: number | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callTs: string | null;
}

interface PoItemRow {
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
}

interface Scan { location: string | null; date: string | null; status: string | null; activity: string | null; }

interface EntityDetails {
  id?: string;
  name?: string | null;
  businessName?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  businessPanNumber?: string | null;
  fssaiNumber?: string | null;
  fullAddress?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  isD2RBrandSeller?: boolean;
  isBadhoVerified?: boolean;
}

// ───────── helpers ─────────
const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};
const fmtDur = (sec: number | null | undefined) => {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
};
const money = (n: number | null | undefined) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null;

type CsvCell = string | number | null | undefined;
function downloadCSV(filename: string, headers: string[], rows: CsvCell[][]) {
  const esc = (v: CsvCell) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sortValue = (r: DrillOrderRow, key: string): number | string | null => {
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const dt = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
  switch (key) {
    case 'pushed': return r.pushedStatus ?? '';
    case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
    case 'callDuration': return num(r.callDurationSec);
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
};

const buildOptions = (rows: DrillOrderRow[] | null, accessor: (r: DrillOrderRow) => string | null | undefined) => {
  if (!rows) return [] as Array<{ value: string; label: string; count: number }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = accessor(r) || '__NONE__';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
};

const awbLink = (awb: string | null | undefined) =>
  awb ? (
    <a
      href={`https://one.delhivery.com/shipments/forward/${encodeURIComponent(awb)}`}
      target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
      title="Track this shipment on Delhivery"
    >{awb}</a>
  ) : <span className="text-slate-400">—</span>;

interface Props {
  title: string;
  subtitle: string;
  rows: DrillOrderRow[] | null;
  loading: boolean;
  error: string | null;
  csvName: string;
  onClose: () => void;
}

export default function OrderDrillModal({ title, subtitle, rows, loading, error, csvName, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [pushedFilter, setPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [paymentFilter, setPaymentFilter] = useState<Set<string>>(new Set());
  const [courierFilter, setCourierFilter] = useState<Set<string>>(new Set());
  const [deliveryFilter, setDeliveryFilter] = useState<Set<string>>(new Set());
  const [reasonFilter, setReasonFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [scansByPo, setScansByPo] = useState<Record<string, Scan[]>>({});
  const [scansLoading, setScansLoading] = useState(false);

  // View Items modal.
  const [poItemsPo, setPoItemsPo] = useState<string | null>(null);
  const [poItemsData, setPoItemsData] = useState<PoItemRow[] | null>(null);
  const [poItemsTotals, setPoItemsTotals] = useState<{ items: number; qty: number; amount: number; total: number } | null>(null);
  const [poItemsLoading, setPoItemsLoading] = useState(false);
  const [poItemsError, setPoItemsError] = useState<string | null>(null);

  // Buyer / seller details modal.
  const [entity, setEntity] = useState<{ type: 'buyer' | 'seller'; lookup: string } | null>(null);
  const [entityData, setEntityData] = useState<EntityDetails | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);

  // Esc closes whichever layer is on top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (poItemsPo) setPoItemsPo(null);
      else if (entity) setEntity(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poItemsPo, entity, onClose]);

  // Batch-load the latest delivery scans for the visible orders.
  useEffect(() => {
    if (!rows || !rows.length) { setScansByPo({}); return; }
    let cancelled = false;
    setScansLoading(true);
    fetch('/api/order-scans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poNumbers: rows.map((r) => r.poNumber) }),
    })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setScansByPo(j.data || {}); })
      .catch(() => { if (!cancelled) setScansByPo({}); })
      .finally(() => { if (!cancelled) setScansLoading(false); });
    return () => { cancelled = true; };
  }, [rows]);

  const openPoItems = async (poNumber: string) => {
    setPoItemsPo(poNumber);
    setPoItemsData(null); setPoItemsTotals(null); setPoItemsError(null); setPoItemsLoading(true);
    try {
      const res = await fetch(`/api/po-items?poNumber=${encodeURIComponent(poNumber)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setPoItemsData(json.data); setPoItemsTotals(json.totals);
    } catch (err) {
      setPoItemsError(err instanceof Error ? err.message : 'Unknown error');
    } finally { setPoItemsLoading(false); }
  };

  const openEntity = async (type: 'buyer' | 'seller', lookup: { phone?: string | null; businessName?: string | null }) => {
    setEntity({ type, lookup: lookup.phone || lookup.businessName || '' });
    setEntityData(null); setEntityError(null); setEntityLoading(true);
    const params = new URLSearchParams();
    if (lookup.phone) params.set('phone', lookup.phone);
    else if (lookup.businessName) params.set('businessName', lookup.businessName);
    try {
      const res = await fetch(`/api/${type}-details?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setEntityData(json.data as EntityDetails);
    } catch (err) {
      setEntityError(err instanceof Error ? err.message : 'Unknown error');
    } finally { setEntityLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    let out = rows;
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) =>
      (r.poNumber || '').toLowerCase().includes(q) ||
      (r.buyerBusinessName || '').toLowerCase().includes(q) ||
      (r.buyerPhone || '').toLowerCase().includes(q) ||
      (r.sellerBusinessName || '').toLowerCase().includes(q) ||
      (r.sellerPhone || '').toLowerCase().includes(q));
    if (pushedFilter !== 'all') out = out.filter((r) => (r.pushedStatus || 'Not Pushed') === pushedFilter);
    if (reasonFilter.size > 0) out = out.filter((r) => reasonFilter.has((r.rejectReason || '').trim()));
    if (paymentFilter.size > 0) out = out.filter((r) => paymentFilter.has(r.PaymentOption || '__NONE__'));
    if (courierFilter.size > 0) out = out.filter((r) => courierFilter.has(r.courierName || '__NONE__'));
    if (deliveryFilter.size > 0) out = out.filter((r) => deliveryFilter.has(r.deliveryStatus || '__NONE__'));
    if (sort) {
      const { key, direction } = sort;
      out = [...out].sort((a, b) => {
        const av = sortValue(a, key), bv = sortValue(b, key);
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
  }, [rows, search, pushedFilter, reasonFilter, paymentFilter, courierFilter, deliveryFilter, sort]);

  const pushedCounts = useMemo(() => {
    const total = rows?.length ?? 0;
    let pushed = 0;
    if (rows) for (const r of rows) if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushed++;
    return { all: total, pushed, notPushed: total - pushed };
  }, [rows]);

  const paymentOptions = useMemo(() => buildOptions(rows, (r) => r.PaymentOption), [rows]);
  const courierOptions = useMemo(() => buildOptions(rows, (r) => r.courierName), [rows]);
  const deliveryOptions = useMemo(() => buildOptions(rows, (r) => r.deliveryStatus), [rows]);
  const reasonOptions = useMemo(() => {
    if (!rows) return [] as Array<{ value: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const r of rows) { const v = (r.rejectReason || '').trim(); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a).map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const hasActiveFilters = search.trim() !== '' || pushedFilter !== 'all' ||
    reasonFilter.size > 0 || paymentFilter.size > 0 || courierFilter.size > 0 || deliveryFilter.size > 0;
  const resetFilters = () => {
    setSearch(''); setPushedFilter('all'); setReasonFilter(new Set());
    setPaymentFilter(new Set()); setCourierFilter(new Set()); setDeliveryFilter(new Set()); setSort(null);
  };

  const toggleSort = (key: string) =>
    setSort((prev) => (!prev || prev.key !== key) ? { key, direction: 'asc' } : prev.direction === 'asc' ? { key, direction: 'desc' } : null);

  const arrowFor = (k: string) => {
    const active = sort?.key === k;
    const dir = active ? sort?.direction : null;
    return <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}</span>;
  };
  const SortTh = ({ k, label, align = 'left', cls = '' }: { k: string; label: string; align?: 'left' | 'right'; cls?: string }) => (
    <th onClick={() => toggleSort(k)} className={`sticky top-0 z-20 px-2.5 py-2.5 text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${align === 'right' ? 'text-right' : 'text-left'} ${cls || 'bg-slate-100 text-slate-700'}`}>
      <span className={`inline-flex items-center ${align === 'right' ? 'justify-end w-full' : ''}`}>{label}{arrowFor(k)}</span>
    </th>
  );
  const PlainTh = ({ label, cls = '' }: { label: string; cls?: string }) => (
    <th className={`sticky top-0 z-20 px-2.5 py-2.5 text-left text-[11px] font-bold whitespace-nowrap uppercase tracking-wider ${cls || 'bg-slate-100 text-slate-700'}`}>{label}</th>
  );
  const dash = <span className="text-slate-400">—</span>;

  const renderScanCell = (poNumber: string, idx: number) => {
    const scans = scansByPo[poNumber];
    const s = scans?.[idx];
    const sub = s ? [s.status, s.activity].filter((v) => v && String(v).trim() !== '').join(' · ') : '';
    return (
      <td className="px-2.5 py-2 align-top bg-indigo-50/20 min-w-[180px]">
        {!scans ? <span className="text-slate-400">{scansLoading ? '…' : '—'}</span>
          : !s ? dash
          : (
            <div className="max-w-[230px]">
              <div className="flex items-start gap-1.5">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${idx === 0 ? 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.7)]' : 'bg-slate-300'}`} />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 text-[11px] leading-tight break-words">{s.location && s.location.trim() ? s.location : '—'}</div>
                  <div className="text-[10px] text-slate-500">{s.date ? fmtDateTime(s.date) : '—'}</div>
                  {sub && <div className="text-[10px] text-slate-600 break-words">{sub}</div>}
                </div>
              </div>
            </div>
          )}
      </td>
    );
  };

  const exportCsv = () => {
    if (!filtered?.length) return;
    const headers = [
      'Marked Pending', 'Pushed', 'PO Number', 'AWB', 'Call Duration (s)', 'Recording URL', 'Order Status',
      'Item Total', 'Gross Amount', 'Item Discount', 'Coupon Amount', 'Applied Wallet Amount', 'Seller Discount', 'Payment Option Badho Discount',
      'COD Amount', 'Delivery Status', 'Paid Amount', 'Payment Option', 'AWB Number', 'Courier Name',
      'Payment Date', 'Payment Event', 'Buyer Business', 'Buyer Phone', 'Buyer Address', 'Seller Business',
      'Seller Phone', 'Status Marked Time', 'Status Duration (s)', 'Refund Initiated', 'Refund Completed',
      'Refund Amount', 'Reject Reason', 'Rejected By', 'Reason Added By Badho Team',
    ];
    const data: CsvCell[][] = filtered.map((r) => [
      r.MarkedpendingTime, r.pushedStatus, r.poNumber, r.awbNumber, r.callDurationSec, r.callRecordingUrl,
      r.orderStatus, r.itemTotal, r.grossAmount, r.orderMarginDiscount, r.CoupanAmount, r.appliedWalletAmount, r.discountBySeller, r.PaymentOptionDiscountByBadho,
      r.codAmountToBeCollected, r.deliveryStatus, r.paidAmount, r.PaymentOption, r.awbNumber, r.courierName,
      r.paymentDate, r.paymentEvent, r.buyerBusinessName, r.buyerPhone,
      [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join(', '),
      r.sellerBusinessName, r.sellerPhone, r.statusMarkedTime, r.statusDurationSec,
      r.RefundIntiatedTime, r.RefundCompletedTime, r.RefundAmount, r.rejectReason, r.rejectedBy, r.reasonAddedByBadhoTeam,
    ]);
    downloadCSV(`${csvName}.csv`, headers, data);
  };

  const totals = useMemo(() => (filtered || []).reduce((a, r) => {
    a.itemTotal += Number(r.itemTotal) || 0; a.gross += Number(r.grossAmount) || 0;
    a.margin += Number(r.orderMarginDiscount) || 0; a.coupon += Number(r.CoupanAmount) || 0;
    a.wallet += Number(r.appliedWalletAmount) || 0; a.seller += Number(r.discountBySeller) || 0;
    a.badho += Number(r.PaymentOptionDiscountByBadho) || 0; a.cod += Number(r.codAmountToBeCollected) || 0;
    a.paid += Number(r.paidAmount) || 0; a.refund += Number(r.RefundAmount) || 0;
    a.callSec += Number(r.callDurationSec) || 0;
    return a;
  }, { itemTotal: 0, gross: 0, margin: 0, coupon: 0, wallet: 0, seller: 0, badho: 0, cod: 0, paid: 0, refund: 0, callSec: 0 }), [filtered]);

  const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md" onClick={onClose}>
      <div className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
              <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.7)] animate-pulse" />
              <span>{title}</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              {subtitle}{' · '}
              {loading ? 'Loading…' : rows ? <span className="text-slate-900 font-semibold">{filtered?.length ?? 0} of {rows.length} orders</span> : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40" disabled={!filtered?.length} onClick={exportCsv}>↓ CSV</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90" aria-label="Close">×</button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="relative px-4 py-2 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-64 max-w-full">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO, buyer, seller…" className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs">×</button>}
            </div>
            <div role="group" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
              {([{ value: 'all' as const, label: 'All', count: pushedCounts.all }, { value: 'Pushed' as const, label: 'Pushed', count: pushedCounts.pushed }, { value: 'Not Pushed' as const, label: 'Not Pushed', count: pushedCounts.notPushed }]).map((opt, idx) => {
                const active = pushedFilter === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setPushedFilter(opt.value)} aria-pressed={active} className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                    {opt.label}<span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                  </button>
                );
              })}
            </div>
            {paymentOptions.length > 1 && <MultiSelectFilter label="Payment" allLabel="All payments" options={paymentOptions} selected={paymentFilter} onChange={setPaymentFilter} widthClass="w-44" />}
            {courierOptions.length > 1 && <MultiSelectFilter label="Courier" allLabel="All couriers" options={courierOptions} selected={courierFilter} onChange={setCourierFilter} widthClass="w-44" />}
            {deliveryOptions.length > 1 && <MultiSelectFilter label="Delivery" allLabel="All delivery" options={deliveryOptions} selected={deliveryFilter} onChange={setDeliveryFilter} widthClass="w-44" />}
            {reasonOptions.length > 0 && <MultiSelectFilter label="Reason" allLabel="All reasons" options={reasonOptions} selected={reasonFilter} onChange={setReasonFilter} widthClass="w-48" />}
          </div>
          {hasActiveFilters && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Active</span>
              {search.trim() !== '' && <button type="button" onClick={() => setSearch('')} className={chip}><span>Search: “{search.length > 24 ? `${search.slice(0, 24)}…` : search}”</span><span className="text-slate-500">×</span></button>}
              {pushedFilter !== 'all' && <button type="button" onClick={() => setPushedFilter('all')} className={chip}><span>Pushed: {pushedFilter}</span><span className="text-slate-500">×</span></button>}
              {paymentFilter.size > 0 && <button type="button" onClick={() => setPaymentFilter(new Set())} className={chip}><span>Payment: {paymentFilter.size}</span><span className="text-slate-500">×</span></button>}
              {courierFilter.size > 0 && <button type="button" onClick={() => setCourierFilter(new Set())} className={chip}><span>Courier: {courierFilter.size}</span><span className="text-slate-500">×</span></button>}
              {deliveryFilter.size > 0 && <button type="button" onClick={() => setDeliveryFilter(new Set())} className={chip}><span>Delivery: {deliveryFilter.size}</span><span className="text-slate-500">×</span></button>}
              {reasonFilter.size > 0 && <button type="button" onClick={() => setReasonFilter(new Set())} className={chip}><span>Reason: {reasonFilter.size}</span><span className="text-slate-500">×</span></button>}
              <button type="button" onClick={resetFilters} className="ml-auto text-[11px] font-semibold text-purple-600 hover:text-purple-700 underline underline-offset-2">Clear all</button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="relative flex-1 overflow-auto">
          {loading ? <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
            : error ? <div className="px-6 py-12 text-center text-rose-600">{error}</div>
            : !rows || rows.length === 0 ? <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
            : !filtered || filtered.length === 0 ? <div className="px-6 py-12 text-center text-slate-500">No matches for the current filters</div>
            : (
              <table className="w-full text-xs">
                <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                  <tr className="border-b border-slate-200">
                    <th onClick={() => toggleSort('markedPending')} className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"><span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span></th>
                    <SortTh k="pushed" label="Pushed" />
                    <SortTh k="poNumber" label="PO Number" />
                    <SortTh k="callDuration" label="Call Duration" cls="bg-purple-50 text-purple-700" />
                    <PlainTh label="Recording" cls="bg-purple-50 text-purple-700" />
                    <PlainTh label="Items" />
                    <PlainTh label="View Ticket" />
                    <SortTh k="status" label="Order Status" />
                    <SortTh k="itemTotal" label="Item Total" align="right" />
                    <SortTh k="grossAmount" label="Gross Amount" align="right" />
                    <SortTh k="orderMarginDiscount" label="Item Discount" align="right" />
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
                    <PlainTh label="Buyer Address" />
                    <SortTh k="sellerBusiness" label="Seller Business" />
                    <SortTh k="sellerPhone" label="Seller Phone" />
                    <SortTh k="statusMarkedTime" label="Status Marked Time" cls="bg-amber-50/60 text-slate-700" />
                    <SortTh k="statusDuration" label="Status Duration" cls="bg-amber-50/60 text-slate-700" />
                    <SortTh k="refundInit" label="Refund Initiated" />
                    <SortTh k="refundDone" label="Refund Completed" />
                    <SortTh k="refundAmount" label="Refund Amount" align="right" />
                    <SortTh k="rejectReason" label="Reject Reason" cls="bg-rose-50 text-rose-700" />
                    <SortTh k="rejectedBy" label="Rejected By" cls="bg-rose-50 text-rose-700" />
                    <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="bg-rose-50 text-rose-700" />
                    <PlainTh label="Latest Scan 1" cls="bg-indigo-50 text-indigo-700" />
                    <PlainTh label="Latest Scan 2" cls="bg-indigo-50 text-indigo-700" />
                    <PlainTh label="Latest Scan 3" cls="bg-indigo-50 text-indigo-700" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                    return (
                      <tr key={r.poNumber} className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}>
                        <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>{r.MarkedpendingTime ? fmtDateTime(r.MarkedpendingTime) : dash}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.pushedStatus === 'Pushed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.pushedStatus === 'Pushed' ? 'bg-emerald-500' : 'bg-rose-500'}`} />{r.pushedStatus || 'Not Pushed'}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                            <a href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all" title="Open in D2R Support Dashboard">Details ↗</a>
                            <a href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all" title="Search Freshdesk tickets">Ticket ↗</a>
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" title="AWB number">AWB: {awbLink(r.awbNumber)}</div>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap bg-purple-50/40">
                          <div className="font-semibold text-purple-800 tabular-nums">{fmtDur(r.callDurationSec) ?? dash}</div>
                          {r.callTs && <div className="text-[10px] text-slate-500 mt-0.5">{fmtDateTime(r.callTs)}</div>}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap bg-purple-50/40">
                          {r.callRecordingUrl ? <a href={r.callRecordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 text-[11px] font-bold border border-fuchsia-300 transition-all" title="Play call recording">▶ Play</a> : dash}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <button onClick={() => openPoItems(r.poNumber)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold border border-emerald-300 transition-all" title="View items in this PO">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                            View Items
                          </button>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <a href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 text-[11px] font-bold border border-sky-300 transition-all" title="Search Freshdesk tickets">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                            View Ticket
                          </a>
                        </td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus ?? r.status}</td>
                        <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.itemTotal != null ? money(r.itemTotal) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.grossAmount != null ? money(r.grossAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount != null ? money(r.orderMarginDiscount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount ? money(r.CoupanAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? money(r.appliedWalletAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? money(r.discountBySeller) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? money(r.PaymentOptionDiscountByBadho) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null ? money(r.codAmountToBeCollected) : dash}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.deliveryStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatus}</span> : dash}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? money(r.paidAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{awbLink(r.awbNumber)}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate ? fmtDateTime(r.paymentDate) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || dash}</td>
                        <td className="px-2.5 py-2 font-medium">{r.buyerBusinessName ? <button type="button" onClick={() => openEntity('buyer', { phone: r.buyerPhone, businessName: r.buyerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left" title="View buyer details">{r.buyerBusinessName}</button> : dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{r.buyerPhone ? <button type="button" onClick={() => openEntity('buyer', { phone: r.buyerPhone, businessName: r.buyerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer" title="View buyer details">{r.buyerPhone}</button> : dash}</td>
                        <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md">
                          {(() => {
                            const addr = [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join(', ');
                            return addr ? <div className="whitespace-normal break-words">{addr}</div> : dash;
                          })()}
                        </td>
                        <td className="px-2.5 py-2 font-medium">{r.sellerBusinessName ? <button type="button" onClick={() => openEntity('seller', { phone: r.sellerPhone, businessName: r.sellerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left" title="View seller details">{r.sellerBusinessName}</button> : dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{r.sellerPhone ? <button type="button" onClick={() => openEntity('seller', { phone: r.sellerPhone, businessName: r.sellerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer" title="View seller details">{r.sellerPhone}</button> : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap bg-amber-50/40">{r.statusMarkedTime ? fmtDateTime(r.statusMarkedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium">{fmtDur(r.statusDurationSec) ?? dash}</td>
                        <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{r.RefundIntiatedTime ? fmtDateTime(r.RefundIntiatedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{r.RefundCompletedTime ? fmtDateTime(r.RefundCompletedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? money(r.RefundAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : dash}</td>
                        {renderScanCell(r.poNumber, 0)}
                        {renderScanCell(r.poNumber, 1)}
                        {renderScanCell(r.poNumber, 2)}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="shadow-[0_-2px_0_rgba(168,85,247,0.6)]">
                    {(() => {
                      const cell = 'sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap';
                      const num = `${cell} text-right tabular-nums`;
                      const m = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                      // One cell per thead column (39 total), so the money totals
                      // sit exactly under their columns.
                      return (
                        <>
                          {/* 1 Marked Pending */}<td className={`${cell} left-0 z-30 min-w-[160px] uppercase tracking-wider`}>Total</td>
                          {/* 2 Pushed */}<td className={cell}>{(filtered?.length ?? 0).toLocaleString('en-IN')} orders</td>
                          {/* 3 PO Number */}<td className={cell} />
                          {/* 4 Call Duration */}<td className={`${cell} text-purple-50`}>{fmtDur(totals.callSec) ?? dash}</td>
                          {/* 5 Recording */}<td className={cell} />
                          {/* 6 Items */}<td className={cell} />
                          {/* 7 View Ticket */}<td className={cell} />
                          {/* 8 Order Status */}<td className={cell} />
                          {/* 9 Item Total */}<td className={num}>{m(totals.itemTotal)}</td>
                          {/* 10 Gross Amount */}<td className={num}>{m(totals.gross)}</td>
                          {/* 11 Item Discount */}<td className={num}>{m(totals.margin)}</td>
                          {/* 12 Coupon */}<td className={num}>{m(totals.coupon)}</td>
                          {/* 13 Wallet */}<td className={num}>{m(totals.wallet)}</td>
                          {/* 14 Seller Discount */}<td className={num}>{m(totals.seller)}</td>
                          {/* 15 Badho Discount */}<td className={num}>{m(totals.badho)}</td>
                          {/* 16 COD */}<td className={num}>{m(totals.cod)}</td>
                          {/* 17 Delivery Status */}<td className={cell} />
                          {/* 18 Paid Amount */}<td className={num}>{m(totals.paid)}</td>
                          {/* 19-32 Payment Option … Refund Completed (14) */}
                          <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
                          <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
                          <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
                          {/* 33 Refund Amount */}<td className={num}>{m(totals.refund)}</td>
                          {/* 34-39 Reject Reason … Latest Scan 3 (6) */}
                          <td className={cell} /><td className={cell} /><td className={cell} />
                          <td className={cell} /><td className={cell} /><td className={cell} />
                        </>
                      );
                    })()}
                  </tr>
                </tfoot>
              </table>
            )}
        </div>
      </div>

      {/* View Items modal */}
      {poItemsPo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md" onClick={() => setPoItemsPo(null)}>
          <div className="relative bg-white text-slate-900 border border-emerald-400/50 rounded-2xl w-[80vw] max-w-[900px] h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-white to-emerald-50/60">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Items · PO {poItemsPo}</h3>
                <p className="text-slate-500 text-xs mt-0.5">{poItemsLoading ? 'Loading…' : poItemsTotals ? `${poItemsTotals.items} items · ${poItemsTotals.qty} qty · ${money(poItemsTotals.amount)}` : ''}</p>
              </div>
              <button onClick={() => setPoItemsPo(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold hover:rotate-90 transition-all" aria-label="Close">×</button>
            </div>
            <div className="flex-1 overflow-auto">
              {poItemsLoading ? <div className="px-6 py-12 text-center text-slate-500">Loading items…</div>
                : poItemsError ? <div className="px-6 py-12 text-center text-rose-600">{poItemsError}</div>
                : !poItemsData || poItemsData.length === 0 ? <div className="px-6 py-12 text-center text-slate-500">No items found</div>
                : (
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-200">
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">SKU</th>
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider">Qty</th>
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider">Unit Price</th>
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider">Discount</th>
                      <th className="sticky top-0 bg-slate-100 px-3 py-2 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>
                    </tr></thead>
                    <tbody>
                      {poItemsData.map((it, i) => (
                        <tr key={it.id} className={`border-b border-slate-100 ${i % 2 ? 'bg-slate-50' : 'bg-white'} hover:bg-emerald-50`}>
                          <td className="px-3 py-2"><div className="font-semibold text-slate-800">{it.skuLabel || it.brandSKUId}</div>{it.brandLabel && <div className="text-[10px] text-slate-500">{it.brandLabel}</div>}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{it.status ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{it.status}</span> : dash}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.quantity ?? dash}{it.quantityUnit ? ` ${it.quantityUnit}` : ''}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(it.unitPrice) ?? dash}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700">{it.discount ? money(it.discount) : dash}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(it.amount) ?? dash}</td>
                        </tr>
                      ))}
                    </tbody>
                    {poItemsTotals && (
                      <tfoot><tr className="bg-emerald-600 text-white font-extrabold">
                        <td className="px-3 py-2.5 uppercase tracking-wider">Total</td>
                        <td className="px-3 py-2.5">{poItemsTotals.items} items</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{poItemsTotals.qty}</td>
                        <td className="px-3 py-2.5" /><td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(poItemsTotals.amount)}</td>
                      </tr></tfoot>
                    )}
                  </table>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Buyer / Seller details modal */}
      {entity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md" onClick={() => setEntity(null)}>
          <div className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 capitalize">{entity.type} details</h3>
                <p className="text-slate-500 text-xs mt-0.5">{entityLoading ? 'Loading…' : entityData?.businessName || entity.lookup}</p>
              </div>
              <button onClick={() => setEntity(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold hover:rotate-90 transition-all" aria-label="Close">×</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {entityLoading ? <div className="py-12 text-center text-slate-500">Loading…</div>
                : entityError ? <div className="py-12 text-center text-rose-600">{entityError}</div>
                : !entityData ? <div className="py-12 text-center text-slate-500">No details</div>
                : (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {([
                      ['Business', entityData.businessName],
                      ['Contact name', entityData.name],
                      ['Phone', entityData.phone],
                      ['WhatsApp', entityData.whatsappNumber],
                      ['Email', entityData.email],
                      ['GST', entityData.gstNumber],
                      ['PAN', entityData.businessPanNumber],
                      ['FSSAI', entityData.fssaiNumber],
                      ['City', entityData.city],
                      ['District', entityData.district],
                      ['State', entityData.state],
                      ['Pincode', entityData.pincode],
                    ] as Array<[string, string | null | undefined]>).filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</dt>
                        <dd className="text-slate-800 break-words">{v}</dd>
                      </div>
                    ))}
                    {entityData.fullAddress && (
                      <div className="col-span-2 min-w-0">
                        <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Full address</dt>
                        <dd className="text-slate-800 break-words">{entityData.fullAddress}</dd>
                      </div>
                    )}
                  </dl>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
