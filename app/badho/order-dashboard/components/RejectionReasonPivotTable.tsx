'use client';

import { useEffect, useState, Fragment, useRef } from 'react';
import MultiSelectFilter from './MultiSelectFilter';
import GroupByMenu, { type GroupDimension } from './GroupByMenu';
import GroupByModal, { type GroupableOrderRow } from './GroupByModal';

interface DrilldownCell {
  count: number;
  amount: number;
}

interface PeriodMap {
  [comboKey: string]: DrilldownCell;
}

interface ReasonRow {
  reason: string;
  cells: Record<string, { count: number; amount: number }>;
  drilldown: Record<string, PeriodMap>;
  total: { count: number; amount: number };
}

interface ApiResponse {
  data: ReasonRow[];
  totals: {
    byPeriod: Record<string, { count: number; amount: number }>;
    byReason: Record<string, { count: number; amount: number }>;
    grand: { count: number; amount: number };
  };
  periods: string[];
  granularity: 'month' | 'week' | 'day';
  year: number;
  month?: number;
  timestamp: string;
}

interface OrderDetail {
  poNumber: string;
  MarkedpendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;
  paidAmount: string | number | null;
  poAmount: string | number | null;
  itemTotal?: number | null;
  grossAmount?: number | null;
  orderMarginDiscount?: number | null;
  CoupanAmount: string | number | null;
  orderStatus: string | null;
  discountBySeller: number | null;
  PaymentOptionDiscountByBadho: number | null;
  appliedWalletAmount: string | number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatusDv: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: string | number | null;
  codAmountToBeCollected: string | number | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  deliveryStatusPo: string | null;
  reason_category: string;
  pushedStatus: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
}

interface ModalFilters {
  reason: string;
  periodKey: string | null;
  periodLabel: string;
  orderStatus?: string;
  deliveryStatus?: string;
  granularity: 'month' | 'week' | 'day';
  dayMonth?: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Compact human-readable duration: 1.5h / 3d / 12d 4h
const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
};

const formatAmount = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const formatNumber = (n: string | number | null | undefined) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return d;
  }
};

type CsvCell = string | number | null | undefined;
const downloadCSV = (filename: string, headers: string[], rows: CsvCell[][]) => {
  const escape = (v: CsvCell) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const periodLabel = (key: string, granularity: 'month' | 'week' | 'day', dayMonth?: number) => {
  if (granularity === 'month') {
    const [, mo] = key.split('-');
    return MONTH_NAMES[parseInt(mo) - 1] || key;
  }
  if (granularity === 'week') return `W${key}`;
  if (granularity === 'day') return `${MONTH_NAMES[(dayMonth || 1) - 1]} ${key}`;
  return key;
};

interface RejectionReasonPivotTableProps {
  onViewItems?: (poNumber: string, breakup?: {
    orderAmount: number | null;
    couponAmount: number | null;
    badhoDiscount: number | null;
    appliedWalletAmount: number | null;
    paidAmount?: number | null;
    sellerDiscount?: number | null;
    paymentOption?: string | null;
  }) => void;
  onBuyerClick?: (lookup: { phone?: string | null; businessName?: string | null }) => void;
  onSellerClick?: (lookup: { phone?: string | null; businessName?: string | null }) => void;
}

const formatDateTime = (s: string | null | undefined) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return s;
  }
};

const statusMarkedFieldFor = (status: string | null | undefined): string => {
  switch ((status || '').toUpperCase()) {
    case 'REJECTED':    return 'markedRejectedTime';
    case 'CANCELLED':   return 'markedCancelledTime';
    case 'DELIVERED':   return 'markedDeliveredTime';
    case 'COMPLETED':   return 'markedCompletedTime';
    case 'DISPATCHED':  return 'markedDispatchedTime';
    case 'IN_TRANSIT':
    case 'INTRANSIT':   return 'markedInTransitTime';
    case 'IN_PROGRESS':
    case 'INPROGRESS':  return 'markedInProgressTime';
    case 'PARTIAL':     return 'markedPartialTime';
    case 'PENDING':     return 'markedPendingTime';
    default:            return 'statusMarkedTime';
  }
};

const statusMarkedHeaderFor = (rows: Array<{ orderStatus?: string | null }> | null | undefined): string => {
  if (!rows || rows.length === 0) return 'Status Marked Time';
  const set = new Set<string>();
  for (const r of rows) {
    const s = (r.orderStatus ?? '').toUpperCase();
    if (s) set.add(s);
    if (set.size > 1) return 'Status Marked Time';
  }
  if (set.size === 1) return statusMarkedFieldFor([...set][0]);
  return 'Status Marked Time';
};

export default function RejectionReasonPivotTable({ onViewItems, onBuyerClick, onSellerClick }: RejectionReasonPivotTableProps = {}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [granularity, setGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [dayMonth, setDayMonth] = useState(new Date().getMonth() + 1);
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  // Modal state
  const [modalFilters, setModalFilters] = useState<ModalFilters | null>(null);
  const [modalData, setModalData] = useState<OrderDetail[] | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalPushedFilter, setModalPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [modalPaymentFilter, setModalPaymentFilter] = useState<Set<string>>(new Set());
  const [modalCourierFilter, setModalCourierFilter] = useState<Set<string>>(new Set());
  const [modalDeliveryFilter, setModalDeliveryFilter] = useState<Set<string>>(new Set());
  const [modalSort, setModalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  // Group By (multi-select) state
  const [groupByDims, setGroupByDims] = useState<GroupDimension[]>([]);

  // Latest scans per PO
  const [scansByPo, setScansByPo] = useState<Record<string, { location: string | null; date: string | null; status: string | null; activity: string | null }[]>>({});
  const [scansLoading, setScansLoading] = useState(false);

  const awbLink = (awb: string | null | undefined) => awb ? (
    <a href={`https://one.delhivery.com/shipments/forward/${encodeURIComponent(awb)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-purple-700 hover:text-purple-900 hover:underline cursor-pointer" title="Track this shipment on Delhivery">{awb}</a>
  ) : (<span className="text-slate-400">—</span>);

  const formatScanDate = (s: string | null | undefined) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return s;
    }
  };

  const fetchScansBatch = (poNumbers: string[]) => {
    setScansByPo({});
    if (!poNumbers.length) return;
    setScansLoading(true);
    fetch('/api/order-scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poNumbers }) })
      .then(async (r) => { const j = await r.json(); if (r.ok) setScansByPo(j.data || {}); })
      .catch(() => {})
      .finally(() => setScansLoading(false));
  };

  const renderScanCell = (poNumber: string, idx: number) => {
    const scans = scansByPo[poNumber];
    const s = scans?.[idx];
    const sub = s ? [s.status, s.activity].filter((v) => v && String(v).trim() !== '').join(' · ') : '';
    return (
      <td className="px-2.5 py-2 align-top bg-indigo-50/20 min-w-[180px]">{!scans ? <span className="text-slate-400">{scansLoading ? '…' : '—'}</span> : !s ? <span className="text-slate-400">—</span> : (
        <div className="max-w-[230px]"><div className="flex items-start gap-1.5"><span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${idx === 0 ? 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.7)]' : 'bg-slate-300'}`} /><div className="min-w-0"><div className="font-semibold text-slate-800 text-[11px] leading-tight break-words">{s.location && s.location.trim() ? s.location : '—'}</div><div className="text-[10px] text-slate-500">{s.date ? formatScanDate(s.date) : '—'}</div>{sub && <div className="text-[10px] text-slate-600 break-words">{sub}</div>}</div></div></div>
      )}</td>
    );
  };

  const toggleModalSort = (key: string) => {
    setModalSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };
  const modalSortValue = (r: OrderDetail, key: string): number | string | null => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const dt = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
    switch (key) {
      case 'pushed': return r.pushedStatus ?? '';
      case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
      case 'status': return r.orderStatus ?? '';
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
      case 'deliveryStatus': return r.deliveryStatusDv ?? '';
      case 'cod': return num(r.codAmountToBeCollected);
      case 'buyerPhone': return r.buyerPhone ?? '';
      case 'buyerBusiness': return r.buyerBusinessName ?? '';
      case 'sellerPhone': return r.sellerPhone ?? '';
      case 'sellerBusiness': return r.sellerBusinessName ?? '';
      case 'markedPending': return dt(r.MarkedpendingTime);
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ year: String(year), granularity });
        if (granularity === 'day') params.set('month', String(dayMonth));
        const res = await fetch(`/api/rejection-reason-breakdown?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [year, granularity, dayMonth]);

  useEffect(() => {
    if (!modalFilters) return;
    const fetchOrders = async () => {
      try {
        setModalLoading(true);
        setModalError(null);
        const params = new URLSearchParams({ reason: modalFilters.reason, year: String(year) });
        if (modalFilters.periodKey) {
          if (modalFilters.granularity === 'month') params.set('month', modalFilters.periodKey);
          else if (modalFilters.granularity === 'week') params.set('week', modalFilters.periodKey);
          else if (modalFilters.granularity === 'day') {
            params.set('day', modalFilters.periodKey);
            if (modalFilters.dayMonth) params.set('dayMonth', String(modalFilters.dayMonth));
          }
        }
        if (modalFilters.orderStatus) params.set('orderStatus', modalFilters.orderStatus);
        if (modalFilters.deliveryStatus !== undefined) params.set('deliveryStatus', modalFilters.deliveryStatus);

        const res = await fetch(`/api/rejection-reason-orders?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch order details');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setModalData(json.data);
        fetchScansBatch((json.data as OrderDetail[] | null | undefined)?.map((r) => r.poNumber).filter(Boolean) ?? []);
      } catch (err) {
        setModalError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setModalLoading(false);
      }
    };
    fetchOrders();
  }, [modalFilters, year]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeModal = () => {
    setModalFilters(null);
    setModalData(null);
    setModalSearch('');
    setModalPushedFilter('all');
    setModalPaymentFilter(new Set());
    setModalCourierFilter(new Set());
    setModalDeliveryFilter(new Set());
    setModalSort(null);
    setGroupByDims([]);
    setScansByPo({});
  };

  const toggleExpand = (reason: string) => {
    const next = new Set(expandedReasons);
    if (next.has(reason)) next.delete(reason);
    else next.add(reason);
    setExpandedReasons(next);
  };

  const openModal = (
    reason: string,
    periodKey: string | null,
    pLabel: string,
    orderStatus?: string,
    deliveryStatus?: string
  ) => {
    setModalFilters({
      reason,
      periodKey,
      periodLabel: pLabel,
      orderStatus,
      deliveryStatus,
      granularity,
      dayMonth: granularity === 'day' ? dayMonth : undefined,
    });
    setModalSearch('');
  };

  // Build a generic option list (value, label, count) from a row accessor
  const buildOpts = (accessor: (r: OrderDetail) => string | null | undefined) => {
    if (!modalData) return [] as Array<{ value: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const r of modalData) {
      const k = accessor(r) || '__NONE__';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
  };
  const modalPaymentOpts  = buildOpts((r) => r.PaymentOption);
  const modalCourierOpts  = buildOpts((r) => r.courierName);
  const modalDeliveryOpts = buildOpts((r) => r.deliveryStatusDv);
  const modalPushedCounts = (() => {
    const total = modalData?.length ?? 0;
    let pushed = 0;
    if (modalData) for (const r of modalData) if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushed++;
    return { all: total, pushed, notPushed: total - pushed };
  })();

  let filteredModalData: OrderDetail[] | null = modalData;
  if (filteredModalData && modalSearch.trim()) {
    const q = modalSearch.toLowerCase();
    filteredModalData = filteredModalData.filter((r) => (
      (r.poNumber || '').toLowerCase().includes(q) ||
      (r.sellerBusinessName || '').toLowerCase().includes(q) ||
      (r.sellerPhone || '').toLowerCase().includes(q) ||
      (r.buyerBusinessName || '').toLowerCase().includes(q) ||
      (r.buyerPhone || '').toLowerCase().includes(q) ||
      (r.buyerAddressLine1 || '').toLowerCase().includes(q) ||
      (r.buyerLandmark || '').toLowerCase().includes(q) ||
      (r.buyerPincode || '').toLowerCase().includes(q) ||
      (r.buyerCity || '').toLowerCase().includes(q) ||
      (r.buyerDistrict || '').toLowerCase().includes(q) ||
      (r.buyerState || '').toLowerCase().includes(q) ||
      (r.awbNumber || '').toLowerCase().includes(q) ||
      (r.courierName || '').toLowerCase().includes(q) ||
      (r.rejectReason || '').toLowerCase().includes(q) ||
      (r.reasonAddedByBadhoTeam || '').toLowerCase().includes(q) ||
      (r.deliveryStatusPo || '').toLowerCase().includes(q) ||
      (r.deliveryStatusDv || '').toLowerCase().includes(q)
    ));
  }
  if (filteredModalData && modalPushedFilter !== 'all') {
    filteredModalData = filteredModalData.filter((r) => (r.pushedStatus || 'Not Pushed') === modalPushedFilter);
  }
  if (filteredModalData && modalPaymentFilter.size > 0) {
    filteredModalData = filteredModalData.filter((r) => modalPaymentFilter.has(r.PaymentOption || '__NONE__'));
  }
  if (filteredModalData && modalCourierFilter.size > 0) {
    filteredModalData = filteredModalData.filter((r) => modalCourierFilter.has(r.courierName || '__NONE__'));
  }
  if (filteredModalData && modalDeliveryFilter.size > 0) {
    filteredModalData = filteredModalData.filter((r) => modalDeliveryFilter.has(r.deliveryStatusDv || '__NONE__'));
  }
  if (filteredModalData && modalSort) {
    const { key, direction } = modalSort;
    filteredModalData = [...filteredModalData].sort((a, b) => {
      const av = modalSortValue(a, key);
      const bv = modalSortValue(b, key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return direction === 'asc' ? cmp : -cmp;
    });
  }

  const modalHasActiveFilters =
    modalSearch.trim() !== '' ||
    modalPushedFilter !== 'all' ||
    modalPaymentFilter.size > 0 ||
    modalCourierFilter.size > 0 ||
    modalDeliveryFilter.size > 0;

  const clearAllModalFilters = () => {
    setModalSearch('');
    setModalPushedFilter('all');
    setModalPaymentFilter(new Set());
    setModalCourierFilter(new Set());
    setModalDeliveryFilter(new Set());
  };

  const groupRows: GroupableOrderRow[] = (filteredModalData ?? []).map((r) => ({
    poNumber: r.poNumber,
    orderStatus: r.orderStatus ?? undefined,
    status: r.orderStatus ?? undefined,
    deliveryStatus: r.deliveryStatusDv ?? null,
    poAmount: r.poAmount != null ? Number(r.poAmount) : null,
    paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
    CoupanAmount: r.CoupanAmount != null ? Number(r.CoupanAmount) : null,
    appliedWalletAmount: r.appliedWalletAmount != null ? Number(r.appliedWalletAmount) : null,
    discountBySeller: r.discountBySeller != null ? Number(r.discountBySeller) : null,
    PaymentOptionDiscountByBadho: r.PaymentOptionDiscountByBadho != null ? Number(r.PaymentOptionDiscountByBadho) : null,
    codAmountToBeCollected: r.codAmountToBeCollected != null ? Number(r.codAmountToBeCollected) : null,
    RefundAmount: r.RefundAmount != null ? Number(r.RefundAmount) : null,
    buyerBusinessName: r.buyerBusinessName,
    buyerPhone: r.buyerPhone,
    buyerState: r.buyerState,
    buyerDistrict: r.buyerDistrict,
    sellerBusinessName: r.sellerBusinessName,
    sellerPhone: r.sellerPhone,
    MarkedpendingTime: r.MarkedpendingTime,
  }));

  return (
    <>
      <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Rejection Reason Breakdown</h2>
            <p className="text-purple-300 text-sm mt-1">
              {granularity === 'month'
                ? `Click any reason to drill down · click any number for order details — ${year}`
                : granularity === 'week'
                ? `Week-by-week — ${year} (ISO week)`
                : `Day-by-day — ${MONTH_NAMES[dayMonth - 1]} ${year}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Month/Week/Day toggle */}
            <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
              {(['month', 'week', 'day'] as const).map((g) => {
                const active = granularity === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                        : 'text-purple-200 hover:bg-white/10'
                    }`}
                  >
                    {g === 'month' ? 'Month' : g === 'week' ? 'Week' : 'Day'}
                  </button>
                );
              })}
            </div>
            {granularity === 'day' && (
              <select
                value={dayMonth}
                onChange={(e) => setDayMonth(parseInt(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i + 1} className="bg-slate-900">
                    {name} {year}
                  </option>
                ))}
              </select>
            )}
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y} className="bg-slate-900">
                  {y}
                </option>
              ))}
            </select>
            {data && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{data.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(data.totals.grand.amount)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-8 py-12 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                <p className="text-purple-300">Loading rejection reason breakdown…</p>
              </div>
            </div>
          ) : error ? (
            <div className="px-8 py-12 text-center text-rose-300">Error: {error}</div>
          ) : !data || data.data.length === 0 ? (
            <div className="px-8 py-12 text-center text-purple-300">No data available for {year}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th
                    rowSpan={2}
                    className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[260px]"
                  >
                    Reason Category
                  </th>
                  {data.periods.map((p) => (
                    <th
                      key={p}
                      colSpan={2}
                      className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10"
                    >
                      {periodLabel(p, data.granularity, data.month)}
                    </th>
                  ))}
                  <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                    Total
                  </th>
                </tr>
                <tr className="bg-white/5 border-b border-white/10">
                  {data.periods.map((p) => (
                    <Fragment key={p}>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300">Count</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300 border-r border-white/10">
                        Amount
                      </th>
                    </Fragment>
                  ))}
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20">Count</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20 border-r border-white/10">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => {
                  const isExpanded = expandedReasons.has(row.reason);

                  const subRowKeys = new Set<string>();
                  for (const p of Object.keys(row.drilldown)) {
                    for (const combo of Object.keys(row.drilldown[p])) {
                      subRowKeys.add(combo);
                    }
                  }
                  const subRows = Array.from(subRowKeys).sort();

                  return (
                    <Fragment key={row.reason}>
                      {/* Parent reason row */}
                      <tr
                        onClick={() => toggleExpand(row.reason)}
                        className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-semibold">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-4 text-purple-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              ▸
                            </span>
                            <span>{row.reason}</span>
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-purple-200 tabular-nums">
                              {subRows.length} sub
                            </span>
                          </div>
                        </td>
                        {data.periods.map((p) => {
                          const cell = row.cells[p];
                          const has = !!cell?.count;
                          return (
                            <Fragment key={p}>
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (has) openModal(row.reason, p, periodLabel(p, data.granularity, data.month));
                                }}
                                className={`group/cell px-2 py-3 text-right text-purple-100 tabular-nums ${has ? 'cursor-pointer' : ''}`}
                              >
                                {cell?.count ? (
                                  <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                    {cell.count.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-purple-500/40">—</span>
                                )}
                              </td>
                              <td className="group/cell px-2 py-3 text-right text-purple-200/90 tabular-nums border-r border-white/10">
                                {cell?.amount ? (
                                  <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                    {formatAmount(cell.amount)}
                                  </span>
                                ) : (
                                  <span className="text-purple-500/40">—</span>
                                )}
                              </td>
                            </Fragment>
                          );
                        })}
                        {/* Total at END */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal(row.reason, null, 'All periods');
                          }}
                          className="group/cell px-2 py-3 text-right font-bold text-white tabular-nums bg-purple-500/15 cursor-pointer"
                        >
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                            {row.total.count.toLocaleString()}
                          </span>
                        </td>
                        <td className="group/cell px-2 py-3 text-right font-bold text-fuchsia-300 tabular-nums bg-purple-500/15 border-r border-white/10">
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                            {formatAmount(row.total.amount)}
                          </span>
                        </td>
                      </tr>

                      {/* Drill-down sub-rows */}
                      {isExpanded &&
                        subRows.map((sr) => {
                          const [orderStatus, deliveryStatus] = sr.split('|||');
                          let subTotalCount = 0;
                          let subTotalAmount = 0;
                          for (const p of Object.keys(row.drilldown)) {
                            const cell = row.drilldown[p]?.[sr];
                            if (cell) {
                              subTotalCount += cell.count;
                              subTotalAmount += cell.amount;
                            }
                          }
                          return (
                            <tr
                              key={`${row.reason}-${sr}`}
                              className="bg-slate-950/40 border-b border-white/5 text-xs hover:bg-fuchsia-500/10 transition-colors"
                            >
                              <td className="px-4 py-2 sticky left-0 bg-slate-950/80 z-10 border-r border-white/10">
                                <div className="pl-8 flex items-center gap-2">
                                  <span className="text-purple-500">└</span>
                                  <span className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-200 font-semibold text-[10px]">
                                      {orderStatus}
                                    </span>
                                    <span className="text-purple-500/50">+</span>
                                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-200 font-semibold text-[10px]">
                                      {deliveryStatus}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              {data.periods.map((p) => {
                                const cell = row.drilldown[p]?.[sr];
                                const has = !!cell?.count;
                                return (
                                  <Fragment key={p}>
                                    <td
                                      onClick={() => has && openModal(row.reason, p, periodLabel(p, data.granularity, data.month), orderStatus, deliveryStatus)}
                                      className={`group/cell px-2 py-2 text-right text-purple-200/80 tabular-nums ${has ? 'cursor-pointer' : ''}`}
                                    >
                                      {cell?.count ? (
                                        <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                          {cell.count.toLocaleString()}
                                        </span>
                                      ) : (
                                        <span className="text-purple-500/30">—</span>
                                      )}
                                    </td>
                                    <td className="group/cell px-2 py-2 text-right text-purple-300/70 tabular-nums border-r border-white/10">
                                      {cell?.amount ? (
                                        <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                          {formatAmount(cell.amount)}
                                        </span>
                                      ) : (
                                        <span className="text-purple-500/30">—</span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                              })}
                              {/* Sub-row Total at END */}
                              <td
                                onClick={() => subTotalCount && openModal(row.reason, null, 'All periods', orderStatus, deliveryStatus)}
                                className={`group/cell px-2 py-2 text-right text-purple-100 tabular-nums bg-purple-500/15 ${subTotalCount ? 'cursor-pointer' : ''}`}
                              >
                                <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                  {subTotalCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="group/cell px-2 py-2 text-right text-fuchsia-300/90 tabular-nums bg-purple-500/15 border-r border-white/10">
                                <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                  {formatAmount(subTotalAmount)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}

                {/* Grand Total row */}
                <tr className="bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-indigo-500/20 border-t-2 border-fuchsia-500/50 font-bold">
                  <td className="px-4 py-3 sticky left-0 bg-slate-900/95 z-10 border-r border-white/10 text-white">
                    Grand Total
                  </td>
                  {data.periods.map((p) => {
                    const t = data.totals.byPeriod[p];
                    return (
                      <Fragment key={p}>
                        <td className="group/cell px-2 py-3 text-right text-white tabular-nums">
                          {t?.count ? (
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                              {t.count.toLocaleString()}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="group/cell px-2 py-3 text-right text-fuchsia-200 tabular-nums border-r border-white/10">
                          {t?.amount ? (
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                              {formatAmount(t.amount)}
                            </span>
                          ) : '—'}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="group/cell px-2 py-3 text-right text-white tabular-nums bg-purple-500/25">
                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                      {data.totals.grand.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="group/cell px-2 py-3 text-right text-fuchsia-200 tabular-nums bg-purple-500/25 border-r border-white/10">
                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                      {formatAmount(data.totals.grand.amount)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="px-8 py-3 border-t border-white/10 bg-white/5 text-xs text-purple-300/70 flex items-center justify-between">
            <span>
              {data.data.length} reason categories · {data.periods.length}{' '}
              {data.granularity === 'month' ? 'months' : data.granularity === 'week' ? 'weeks' : 'days'} ·{' '}
              {data.totals.grand.count.toLocaleString()} total orders
            </span>
            <span>Last updated: {new Date(data.timestamp).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Order Detail Modal — matches the pivot drill modal in page.tsx */}
      {modalFilters && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md"
          onClick={closeModal}
        >
          <div
            className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden animate-corner-breath"
            onClick={(e) => e.stopPropagation()}
          >
            {/* breathing purple corner accents */}
            <div className="pointer-events-none absolute -top-px -left-px w-20 h-20 rounded-tl-2xl border-t-2 border-l-2 border-purple-500 animate-edge-pulse" />
            <div className="pointer-events-none absolute -top-px -right-px w-20 h-20 rounded-tr-2xl border-t-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '0.6s' }} />
            <div className="pointer-events-none absolute -bottom-px -left-px w-20 h-20 rounded-bl-2xl border-b-2 border-l-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.2s' }} />
            <div className="pointer-events-none absolute -bottom-px -right-px w-20 h-20 rounded-br-2xl border-b-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.8s' }} />

            <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900 truncate">
                  <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.7)] animate-pulse shrink-0" />
                  <span className="truncate">{modalFilters.reason}</span>
                  <span className="text-slate-400 text-sm font-normal mx-1">·</span>
                  <span className="text-purple-700 text-sm font-bold">{modalFilters.periodLabel} {year}</span>
                </h3>
                <p className="text-slate-500 text-xs mt-1 flex items-center gap-2 flex-wrap">
                  {modalFilters.orderStatus && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-semibold text-[10px] border border-rose-200">
                      Order: {modalFilters.orderStatus}
                    </span>
                  )}
                  {modalFilters.deliveryStatus !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-700 font-semibold text-[10px] border border-cyan-200">
                      Delivery: {modalFilters.deliveryStatus || 'N/A'}
                    </span>
                  )}
                  {modalData && <span className="text-slate-900 font-semibold">{filteredModalData?.length || 0} of {modalData.length} orders</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <GroupByMenu selected={groupByDims} onChange={setGroupByDims} align="right" />
                <button
                  className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]"
                  disabled={!filteredModalData || filteredModalData.length === 0}
                  onClick={() => {
                    if (!filteredModalData) return;
                    const headers = [
                      'poNumber', 'MarkedpendingTime', 'orderStatus',
                      'Item Total', 'Gross Amount', 'Item Discount', 'paidAmount', 'CoupanAmount',
                      'discountBySeller', 'PaymentOptionDiscountByBadho',
                      'appliedWalletAmount', 'PaymentOption',
                      'awbNumber', 'courierName',
                      'codAmountToBeCollected', 'reason_category',
                      'sellerPhone', 'sellerBusinessName',
                      'buyerBusinessName', 'buyerPhone', 'buyerAddress',
                      'paymentDate', 'paymentEvent',
                      'deliveryStatus (dv)',
                      'RefundIntiatedTime', 'RefundCompletedTime',
                      'rejectReason', 'rejectedBy', 'reasonAddedByBadhoTeam',
                      'deliveryStatus (po)',
                    ];
                    const rows: CsvCell[][] = filteredModalData.map((r) => [
                      r.poNumber, r.MarkedpendingTime, r.orderStatus,
                      r.itemTotal, r.grossAmount, r.orderMarginDiscount, r.paidAmount, r.CoupanAmount,
                      r.discountBySeller, r.PaymentOptionDiscountByBadho,
                      r.appliedWalletAmount, r.PaymentOption,
                      r.awbNumber, r.courierName,
                      r.codAmountToBeCollected, r.reason_category,
                      r.sellerPhone, r.sellerBusinessName,
                      r.buyerBusinessName, r.buyerPhone,
                      [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_'),
                      r.paymentDate, r.paymentEvent,
                      r.deliveryStatusDv,
                      r.RefundIntiatedTime, r.RefundCompletedTime,
                      r.rejectReason, r.rejectedBy, r.reasonAddedByBadhoTeam,
                      r.deliveryStatusPo,
                    ]);
                    const fname = `rejection-${modalFilters.reason.replace(/\s+/g, '-')}-${modalFilters.periodKey || 'all'}-${year}.csv`;
                    downloadCSV(fname, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Toolbar — compact single row matching pivot drill modal */}
            <div ref={filterBarRef} className="relative px-4 py-2 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-64 max-w-full">
                  <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="text"
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    placeholder="Search PO, buyer, seller…"
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      onClick={() => setModalSearch('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
                {modalData && (
                  <div role="group" aria-label="Filter by pushed status" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
                    {([
                      { value: 'all' as const, label: 'All', count: modalPushedCounts.all },
                      { value: 'Pushed' as const, label: 'Pushed', count: modalPushedCounts.pushed },
                      { value: 'Not Pushed' as const, label: 'Not Pushed', count: modalPushedCounts.notPushed },
                    ]).map((opt, idx) => {
                      const active = modalPushedFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setModalPushedFilter(opt.value)}
                          className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          {opt.label}<span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {modalPaymentOpts.length > 1 && (
                  <MultiSelectFilter
                    label="Payment"
                    allLabel="All payments"
                    options={modalPaymentOpts}
                    selected={modalPaymentFilter}
                    onChange={setModalPaymentFilter}
                    widthClass="w-44"
                  />
                )}
                {modalCourierOpts.length > 1 && (
                  <MultiSelectFilter
                    label="Courier"
                    allLabel="All couriers"
                    options={modalCourierOpts}
                    selected={modalCourierFilter}
                    onChange={setModalCourierFilter}
                    widthClass="w-44"
                  />
                )}
                {modalDeliveryOpts.length > 1 && (
                  <MultiSelectFilter
                    label="Delivery"
                    allLabel="All delivery"
                    options={modalDeliveryOpts}
                    selected={modalDeliveryFilter}
                    onChange={setModalDeliveryFilter}
                    widthClass="w-44"
                  />
                )}
                {modalHasActiveFilters && (
                  <button
                    onClick={clearAllModalFilters}
                    className="ml-auto text-[11px] font-semibold text-purple-600 hover:text-purple-700 underline underline-offset-2"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Body table — same look as pivot drill modal */}
            <div className="relative flex-1 overflow-auto">
              {modalLoading ? (
                <div className="px-6 py-12 text-center text-slate-500">Loading order details…</div>
              ) : modalError ? (
                <div className="px-6 py-12 text-center text-rose-600">Error: {modalError}</div>
              ) : !filteredModalData || filteredModalData.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-500">
                  {modalSearch ? `No matches for "${modalSearch}"` : 'No orders found'}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10 shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                    <tr className="border-b border-slate-200">
                      {(() => {
                        const arrowFor = (k: string) => {
                          const active = modalSort?.key === k;
                          const dir = active ? modalSort?.direction : null;
                          return (
                            <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>
                              {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
                            </span>
                          );
                        };
                        const SortTh = ({ k, label, cls = '' }: { k: string; label: string; cls?: string }) => (
                          <th
                            onClick={() => toggleModalSort(k)}
                            className={`sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${cls || 'text-slate-700'}`}
                          >
                            <span className="inline-flex items-center">{label}{arrowFor(k)}</span>
                          </th>
                        );
                        return (
                          <>
                            <th
                              onClick={() => toggleModalSort('markedPending')}
                              className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"
                            >
                              <span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span>
                            </th>
                            <th
                              onClick={() => toggleModalSort('pushed')}
                              className="sticky top-0 left-[160px] z-30 bg-slate-100 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700"
                            >
                              <span className="inline-flex items-center">Pushed{arrowFor('pushed')}</span>
                            </th>
                            <th
                              onClick={() => toggleModalSort('poNumber')}
                              className="sticky top-0 left-[280px] z-30 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
                            >
                              <span className="inline-flex items-center">PO Number{arrowFor('poNumber')}</span>
                            </th>
                            <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Items</th>
                            <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">View Ticket</th>
                            <SortTh k="status" label="Order Status" />
                            <SortTh k="itemTotal" label="Item Total" />
                            <SortTh k="grossAmount" label="Gross Amount" />
                            <SortTh k="orderMarginDiscount" label="Item Discount" />
                            <SortTh k="coupon" label="Coupon Amount" />
                            <SortTh k="wallet" label="Applied Wallet Amount" />
                            <SortTh k="sellerDiscount" label="Seller Discount" />
                            <SortTh k="badhoDiscount" label="Payment Option Badho Discount" />
                            <SortTh k="cod" label="COD Amount" />
                            <SortTh k="deliveryStatus" label="Delivery Status" />
                            <SortTh k="paidAmount" label="Paid Amount" />
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
                            <SortTh k="statusMarkedTime" label={statusMarkedHeaderFor(filteredModalData)} cls="text-slate-700 bg-amber-50/60" />
                            <SortTh k="statusDuration" label="Status Duration" cls="text-slate-700 bg-amber-50/60" />
                            <SortTh k="refundInit" label="Refund Initiated" />
                            <SortTh k="refundDone" label="Refund Completed" />
                            <SortTh k="refundAmount" label="Refund Amount" />
                            <SortTh k="rejectReason" label="Reject Reason" cls="text-rose-700 bg-rose-50/60" />
                            <SortTh k="rejectedBy" label="Rejected By" cls="text-rose-700 bg-rose-50/60" />
                            <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="text-rose-700 bg-rose-50/60" />
                            <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 1</th>
                            <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 2</th>
                            <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 3</th>
                          </>
                        );
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalData.slice(0, 2000).map((r, idx) => {
                      const buyerAddr = [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_');
                      const isPushed = r.pushedStatus === 'Pushed';
                      const paid = Number(r.paidAmount ?? 0);
                      const isFullyPaid = r.PaymentOption === 'FULLY_PAID' && paid > 0;
                      const isPartialPaid = r.PaymentOption === 'PARTIALLY_PAID' && paid > 0;
                      const rowBg = isFullyPaid
                        ? 'bg-emerald-50'
                        : isPartialPaid
                        ? 'bg-violet-50'
                        : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50');
                      return (
                        <tr
                          key={`${r.poNumber}-${idx}`}
                          className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}
                        >
                          <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>
                            {formatDateTime(r.MarkedpendingTime)}
                          </td>
                          <td className={`sticky left-[160px] z-10 ${rowBg} group-hover:bg-purple-50 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2 whitespace-nowrap`}>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPushed ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isPushed ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'}`} />
                              {r.pushedStatus || 'Not Pushed'}
                            </span>
                          </td>
                          <td className={`sticky left-[280px] z-10 ${rowBg} group-hover:bg-purple-50 px-2.5 py-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`}>
                            {r.poNumber ? (
                              <>
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
                              <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" title="AWB number">
                                AWB: {awbLink(r.awbNumber)}
                              </div>
                              </>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            {onViewItems && r.poNumber ? (
                              <button
                                onClick={() => onViewItems(r.poNumber, {
                                  orderAmount: r.poAmount != null ? Number(r.poAmount) : null,
                                  couponAmount: r.CoupanAmount != null ? Number(r.CoupanAmount) : null,
                                  badhoDiscount: r.PaymentOptionDiscountByBadho != null ? Number(r.PaymentOptionDiscountByBadho) : null,
                                  appliedWalletAmount: r.appliedWalletAmount != null ? Number(r.appliedWalletAmount) : null,
                                  paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
                                  sellerDiscount: r.discountBySeller != null ? Number(r.discountBySeller) : null,
                                  paymentOption: r.PaymentOption,
                                })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-[11px] font-bold border border-emerald-300 hover:border-emerald-400 transition-all"
                                title="View items in this PO"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                  <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                                View Items
                              </button>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            <a
                              href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 text-[11px] font-bold border border-sky-300 hover:border-sky-400 transition-all"
                              title={`Search Freshdesk tickets for PO ${r.poNumber}`}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              View Ticket
                            </a>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.itemTotal != null ? `₹${Number(r.itemTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.grossAmount != null ? `₹${Number(r.grossAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount != null ? `₹${Number(r.orderMarginDiscount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount != null && Number(r.CoupanAmount) !== 0 ? `₹${Number(r.CoupanAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount != null && Number(r.appliedWalletAmount) !== 0 ? `₹${Number(r.appliedWalletAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller != null && Number(r.discountBySeller) !== 0 ? `₹${Number(r.discountBySeller).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho != null && Number(r.PaymentOptionDiscountByBadho) !== 0 ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null && Number(r.codAmountToBeCollected) !== 0 ? `₹${Number(r.codAmountToBeCollected).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            {r.deliveryStatusDv ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatusDv}</span> : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? `₹${Number(r.paidAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap">{awbLink(r.awbNumber)}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{formatDate(r.paymentDate)}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 font-medium">
                            {r.buyerBusinessName ? (
                              onBuyerClick ? (
                                <button
                                  type="button"
                                  onClick={() => onBuyerClick({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                  className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                  title="View buyer details"
                                >
                                  {r.buyerBusinessName}
                                </button>
                              ) : (
                                <span className="text-slate-900">{r.buyerBusinessName}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {r.buyerPhone ? (
                              onBuyerClick ? (
                                <button
                                  type="button"
                                  onClick={() => onBuyerClick({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                  className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                  title="View buyer details"
                                >
                                  {r.buyerPhone}
                                </button>
                              ) : (
                                <span className="text-slate-700">{r.buyerPhone}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md" title={buyerAddr}>
                            {buyerAddr ? <div className="whitespace-normal break-words">{buyerAddr}</div> : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2.5 py-2 font-medium">
                            {r.sellerBusinessName ? (
                              onSellerClick ? (
                                <button
                                  type="button"
                                  onClick={() => onSellerClick({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                  className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                  title="View seller details"
                                >
                                  {r.sellerBusinessName}
                                </button>
                              ) : (
                                <span className="text-slate-900">{r.sellerBusinessName}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {r.sellerPhone ? (
                              onSellerClick ? (
                                <button
                                  type="button"
                                  onClick={() => onSellerClick({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                  className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                  title="View seller details"
                                >
                                  {r.sellerPhone}
                                </button>
                              ) : (
                                <span className="text-slate-700">{r.sellerPhone}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap bg-amber-50/40">
                            <div className="text-[9px] font-mono text-amber-700/90 leading-tight">{statusMarkedFieldFor(r.orderStatus)}</div>
                            <div className="text-slate-700 mt-0.5">{r.statusMarkedTime ? formatDateTime(r.statusMarkedTime) : <span className="text-slate-400">—</span>}</div>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium" title={r.statusDurationSec != null ? `${r.statusDurationSec.toFixed(0)} seconds` : undefined}>{formatDuration(r.statusDurationSec)}</td>
                          <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{formatDate(r.RefundIntiatedTime)}</td>
                          <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{formatDate(r.RefundCompletedTime)}</td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? `₹${Number(r.RefundAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : <span className="text-slate-400">—</span>}</td>
                          {renderScanCell(r.poNumber, 0)}
                          {renderScanCell(r.poNumber, 1)}
                          {renderScanCell(r.poNumber, 2)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const t = filteredModalData.reduce((a, r) => {
                        a.itemTotal += Number(r.itemTotal) || 0;
                        a.gross     += Number(r.grossAmount) || 0;
                        a.margin    += Number(r.orderMarginDiscount) || 0;
                        a.coupon += Number(r.CoupanAmount) || 0;
                        a.wallet += Number(r.appliedWalletAmount) || 0;
                        a.seller += Number(r.discountBySeller) || 0;
                        a.badho  += Number(r.PaymentOptionDiscountByBadho) || 0;
                        a.cod    += Number(r.codAmountToBeCollected) || 0;
                        a.paid   += Number(r.paidAmount) || 0;
                        a.refund += Number(r.RefundAmount) || 0;
                        return a;
                      }, { itemTotal: 0, gross: 0, margin: 0, coupon: 0, wallet: 0, seller: 0, badho: 0, cod: 0, paid: 0, refund: 0 });
                      const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                      const cell = 'sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap';
                      const num = `${cell} text-right tabular-nums`;
                      return (
                        <tr className="shadow-[0_-2px_0_rgba(168,85,247,0.6)]">
                          <td className={`${cell} left-0 z-30 min-w-[160px] max-w-[160px] w-[160px] uppercase tracking-wider`}>Total</td>
                          <td className={`${cell} left-[160px] z-30 min-w-[120px] max-w-[120px] w-[120px]`}>{filteredModalData.length.toLocaleString('en-IN')} orders</td>
                          <td className={`${cell} left-[280px] z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]`} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={num}>{money(t.itemTotal)}</td>
                          <td className={num}>{money(t.gross)}</td>
                          <td className={num}>{money(t.margin)}</td>
                          <td className={num}>{money(t.coupon)}</td>
                          <td className={num}>{money(t.wallet)}</td>
                          <td className={num}>{money(t.seller)}</td>
                          <td className={num}>{money(t.badho)}</td>
                          <td className={num}>{money(t.cod)}</td>
                          <td className={cell} />
                          <td className={num}>{money(t.paid)}</td>
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={num}>{money(t.refund)}</td>
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                          <td className={cell} />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              )}
            </div>

            {modalData && filteredModalData && filteredModalData.length > 2000 && (
              <div className="px-4 py-2 border-t border-amber-300 bg-amber-50 text-amber-700 text-xs">
                Showing first 2,000 of {filteredModalData.length.toLocaleString()} rows — CSV includes everything.
              </div>
            )}
          </div>
        </div>
      )}

      <GroupByModal
        open={!!modalFilters && groupByDims.length > 0}
        dimensions={groupByDims}
        rows={groupRows}
        contextLabel={modalFilters?.reason ?? ''}
        onClose={() => setGroupByDims([])}
        onChangeDimensions={setGroupByDims}
      />
    </>
  );
}
