'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function formatAmount(amount: number): string {
  if (!amount || !Number.isFinite(amount)) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000)   return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000)     return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
function formatHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return s;
  }
}
function formatDay(s: string | null | undefined): string {
  if (!s) return '—';
  // Input is YYYY-MM-DD. Construct with explicit parts to avoid TZ shifts.
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-IN', { weekday: 'short' });
  const dayMonth = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${dayMonth} · ${weekday}`;
}
function formatBucketLabel(b: { bucketStart: string; bucketEnd: string }, g: 'day' | 'week' | 'month'): string {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const start = parse(b.bucketStart);
  if (g === 'day') return formatDay(b.bucketStart);
  if (g === 'month') return start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  // week
  const end = parse(b.bucketEnd);
  const s = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const e = end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${s} – ${e}`;
}

interface Summary {
  totalOrders: number;
  totalPaidAmount: number;
  refundedOrders: number;
  totalRefundedAmount: number;
  pendingRefundAmount: number;
  refundRate: number;
  avgRefundAmount: number;
  avgRefundProcessingHours: number | null;
  avgHoursTillRefund: number | null;
}
interface Bucket {
  bucketStart: string;
  bucketEnd: string;
  rejectedCount: number;
  cancelledCount: number;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
  avgRefundProcessingHours: number | null;
}
type Preset = 'all' | 'today' | 'last7' | 'day' | 'week' | 'month' | 'custom';
type Granularity = 'day' | 'week' | 'month';
type CellFilter = 'all' | 'rejected' | 'cancelled' | 'refunded' | 'pending';
interface SellerRow {
  sellerId: string;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
}
interface ListRow {
  purchaseOrderId: string;
  status: string;
  deliveryStatus: string | null;
  amount: number;
  createdAt: string | null;
  markedPendingTime: string | null;
  markedRejectedTime: string | null;
  markedCancelledTime: string | null;
  rejectedOrCancelledTime: string | null;
  poNumber: string;
  paymentOption: string | null;
  paymentEvent: string | null;
  paymentAttemptId: string | null;
  appliedWalletAmount: number | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  orderPaidAmount: number;
  refundAmount: number | null;
  refundARN: string | null;
  markedStatusCompletedTime: string | null;
  markedStatusInitiatedTime: string | null;
  refundProcessingHours: number | null;
  hoursTillRefund: number | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  reasonCategory: string;
}
interface AlertItem {
  purchaseOrderId: string;
  status: string;
  poNumber: string;
  paidAmount: number;
  paymentOption: string | null;
  paymentEvent: string | null;
  paymentAttemptId: string | null;
  appliedWalletAmount: number | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  createdAt: string | null;
  markedPendingTime: string | null;
  rejectedOrCancelledTime: string | null;
  minutesPending: number;
  deliveryStatus: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  reasonCategory: string;
}
interface RefundApiResponse {
  summary: Summary;
  summaryAllTime: Summary;
  byDay: Bucket[];
  byWeek: Bucket[];
  byMonth: Bucket[];
  topSellers: SellerRow[];
  list: ListRow[];
  alerts: AlertItem[];
  startDate: string;
  endDate: string;
  timestamp: string;
}

type CsvCell = string | number | null | undefined;
function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV(filename: string, headers: string[], rows: CsvCell[][]) {
  const body = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function RefundOrderAmountDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [data, setData] = useState<RefundApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'sellers' | 'orders' | 'alerts'>('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [preset, setPreset] = useState<Preset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Seed custom-range inputs the first time the user switches to Custom.
  useEffect(() => {
    if (preset !== 'custom') return;
    if (customStart && customEnd) return;
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const startD = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const start = startD.toISOString().slice(0, 10);
    setCustomStart(start);
    setCustomEnd(end);
  }, [preset, customStart, customEnd]);

  // Derive the actual date range and bucket granularity from the preset.
  const { startDate, endDate, granularity } = useMemo<{
    startDate: string;
    endDate: string;
    granularity: Granularity;
  }>(() => {
    const today = new Date();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const todayStr = ymd(today);
    const yearStart = ymd(new Date(today.getFullYear(), 0, 1));
    const yearEnd = ymd(new Date(today.getFullYear(), 11, 31));
    switch (preset) {
      case 'all':
        // Wide-open range — anything before the Badho purchaseOrder table was
        // created (~2020) is impossible, so 2000-01-01 is a safe floor.
        return { startDate: '2000-01-01', endDate: todayStr, granularity: 'month' };
      case 'today':
        return { startDate: todayStr, endDate: todayStr, granularity: 'day' };
      case 'last7': {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { startDate: ymd(start), endDate: todayStr, granularity: 'day' };
      }
      case 'day':   return { startDate: yearStart, endDate: yearEnd, granularity: 'day' };
      case 'week':  return { startDate: yearStart, endDate: yearEnd, granularity: 'week' };
      case 'month': return { startDate: yearStart, endDate: yearEnd, granularity: 'month' };
      case 'custom':
        return {
          startDate: customStart || todayStr,
          endDate: customEnd || todayStr,
          granularity: 'day',
        };
    }
  }, [preset, customStart, customEnd]);

  // Modal for drilling into a bucket cell
  interface ModalRequest {
    startDate: string;
    endDate: string;
    filter: CellFilter;
    title: string;
  }
  const [modal, setModal] = useState<ModalRequest | null>(null);
  const [modalOrders, setModalOrders] = useState<ListRow[] | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!modal) { setModalOrders(null); setModalError(null); return; }
    const ctrl = new AbortController();
    setModalLoading(true);
    setModalError(null);
    const params = new URLSearchParams({ startDate: modal.startDate, endDate: modal.endDate });
    if (modal.filter === 'rejected')  params.set('status', 'REJECTED');
    if (modal.filter === 'cancelled') params.set('status', 'CANCELLED');
    if (modal.filter === 'refunded')  params.set('refundState', 'refunded');
    if (modal.filter === 'pending')   params.set('refundState', 'pending');
    fetch(`/api/refund-order-amount/orders?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j?.error || 'Fetch failed');
        setModalOrders(j.orders as ListRow[]);
      })
      .catch((err) => { if (err.name !== 'AbortError') setModalError(err.message); })
      .finally(() => setModalLoading(false));
    return () => ctrl.abort();
  }, [modal]);

  // Close modal on Escape
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ startDate, endDate }).toString();
      const res = await fetch(`/api/refund-order-amount?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as RefundApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (authChecked) fetchData();
  }, [authChecked, fetchData]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const buckets = useMemo<Bucket[]>(() => {
    if (!data) return [];
    if (granularity === 'week')  return data.byWeek;
    if (granularity === 'month') return data.byMonth;
    return data.byDay;
  }, [data, granularity]);


  // Category options derived from the data so the dropdown only shows what's
  // actually present in the current year — and always sorted alphabetically.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.list ?? []).forEach((r) => { if (r.reasonCategory) set.add(r.reasonCategory); });
    return Array.from(set).sort();
  }, [data]);

  const filteredList = useMemo(() => {
    if (!data?.list) return [];
    const q = search.trim().toLowerCase();
    return data.list.filter((r) => {
      if (categoryFilter !== 'all' && r.reasonCategory !== categoryFilter) return false;
      if (!q) return true;
      return [r.poNumber, r.buyerBusinessName, r.buyerPhone, r.sellerBusinessName, r.sellerPhone, r.paymentOption, r.status, r.reasonCategory]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, search, categoryFilter]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  // Reusable preset bar — same instance of state, rendered above each tab's
  // main content area. State lives in the parent component so switching tabs
  // preserves the selected range.
  const presetBar = (
    <div className="mb-5 flex items-center gap-3 flex-wrap">
      <div className="inline-flex gap-0.5 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]">
        {(['all', 'today', 'last7', 'day', 'week', 'month', 'custom'] as const).map((p) => {
          const label = p === 'all' ? 'All' : p === 'today' ? 'Today' : p === 'last7' ? '7d' : p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Custom';
          const isActive = preset === p;
          return (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.55)]'
                  : 'text-purple-200 hover:bg-fuchsia-500 hover:text-white hover:shadow-[0_0_12px_rgba(217,70,239,0.5)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl">
          <label className="text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold">From</label>
          <input
            type="date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400 hover:bg-white/20 transition-colors"
          />
          <label className="text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold">To</label>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400 hover:bg-white/20 transition-colors"
          />
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold ml-auto whitespace-nowrap">
        {preset === 'all'
          ? <span>Range: <span className="text-purple-100">All time</span></span>
          : <span>Range: <span className="text-purple-100 font-mono">{startDate}</span> → <span className="text-purple-100 font-mono">{endDate}</span></span>}
      </div>
    </div>
  );

  // KPI cards + mini-stats show all-time totals (across every year),
  // independent of the breakdown table's year/granularity filter.
  const s = data?.summaryAllTime;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="w-[95%] mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/badho"
            className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-fuchsia-500 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.5)] transition-all duration-150"
          >
            ← All dashboards
          </Link>
          <div className="flex items-center gap-3">
            {employeeName && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {employeeName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="text-purple-100 font-medium">{employeeName}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 hover:text-white border border-rose-400/30 hover:border-rose-300/60 hover:shadow-[0_0_14px_rgba(244,63,94,0.55)] text-rose-200 text-sm font-medium disabled:opacity-50 transition-all duration-150"
            >
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Refund Order Dashboard
            </h1>
            <p className="text-purple-200 text-sm mt-1">
              Prepaid (FULL/PARTIAL advance) orders that were rejected or cancelled. KPI cards show all-time totals; everything else filters on <span className="text-purple-100 font-medium">reject/cancel date</span>{' '}
              {preset === 'all'
                ? <span className="text-purple-100 font-medium">all time</span>
                : <><span className="text-purple-100 font-medium">{startDate}</span>{' → '}<span className="text-purple-100 font-medium">{endDate}</span></>}
              .
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-400/30 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)] text-fuchsia-100 text-xs font-semibold disabled:opacity-50 transition-all duration-150"
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

{/* Preset bar is rendered inside each tab body, not here. See `presetBar` below. */}

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl">
          {(['overview', 'sellers', 'orders', 'alerts'] as const).map((t) => {
            const isAlerts = t === 'alerts';
            const alertCount = data?.alerts.length ?? 0;
            const hasAlerts = alertCount > 0;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150 ${
                  tab === t
                    ? isAlerts && hasAlerts
                      ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 text-white shadow-[0_0_24px_rgba(244,63,94,0.55)]'
                      : 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.5)]'
                    : isAlerts && hasAlerts
                      ? 'text-rose-200 hover:bg-rose-500 hover:text-white hover:shadow-[0_0_14px_rgba(244,63,94,0.5)]'
                      : 'text-purple-200 hover:bg-fuchsia-500 hover:text-white hover:shadow-[0_0_14px_rgba(217,70,239,0.5)]'
                }`}
              >
                {t === 'overview' ? 'Dashboard' : t === 'sellers' ? 'Seller wise' : t === 'orders' ? 'Order Details' : 'Alerts'}
                {isAlerts && hasAlerts && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black tabular-nums shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-pulse">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* KPI cards — only on Dashboard tab */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Expected Refund Amount"
              value={s ? formatAmount(s.totalPaidAmount) : '—'}
              hint={s ? `${s.totalOrders.toLocaleString('en-IN')} prepaid orders rejected / cancelled` : 'Sum of paidAmount owed back to buyers'}
              tint="from-fuchsia-500/30 to-purple-500/10"
            />
            <KpiCard
              label="Refunded Amount"
              value={s ? formatAmount(s.totalRefundedAmount) : '—'}
              hint={s ? `${s.refundedOrders.toLocaleString('en-IN')} refunds completed` : 'Sum of refundAmount (COMPLETED)'}
              tint="from-emerald-500/30 to-teal-500/10"
            />
            <KpiCard
              label="Pending Refund"
              value={s ? formatAmount(s.pendingRefundAmount) : '—'}
              hint={s ? `${(s.totalOrders - s.refundedOrders).toLocaleString('en-IN')} orders awaiting refund` : 'Paid − Refunded'}
              tint="from-rose-500/30 to-orange-500/10"
            />
            <KpiCard
              label="Refund Rate"
              value={s ? `${s.refundRate}%` : '—'}
              hint={s ? `Avg refund time: ${formatHours(s.avgRefundProcessingHours)}` : '% of orders refunded'}
              tint="from-sky-500/30 to-blue-500/10"
            />
          </div>
        )}

        {tab === 'overview' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MiniStat label="Avg Refund / Order" value={s ? formatAmount(s.avgRefundAmount) : '—'} hint="per completed refund" />
              <MiniStat label="Refund Processing" value={formatHours(s?.avgRefundProcessingHours ?? null)} hint="initiated → completed" />
              <MiniStat label="Reject/Cancel → Refund" value={formatHours(s?.avgHoursTillRefund ?? null)} hint="reject/cancel → completed" />
              <MiniStat
                label="Unrefunded Orders"
                value={s ? (s.totalOrders - s.refundedOrders).toLocaleString('en-IN') : '—'}
                hint={s && s.totalOrders - s.refundedOrders > 0 ? `${formatAmount(s.pendingRefundAmount)} stuck` : 'All caught up'}
                tone={s && s.totalOrders - s.refundedOrders > 0 ? 'alert' : 'default'}
                onClick={s && s.totalOrders - s.refundedOrders > 0 ? () => setTab('alerts') : undefined}
                action={s && s.totalOrders - s.refundedOrders > 0 ? 'Investigate why' : undefined}
              />
            </div>

            {/* Date-range preset bar drives the breakdown granularity + range */}
            {presetBar}

            {/* Granular breakdown — Day / Week / Month / Custom */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {granularity === 'day' ? 'Day-wise' : granularity === 'week' ? 'Week-wise' : 'Month-wise'} Breakdown
                  </h3>
                  <p className="text-purple-300/80 text-sm mt-1">
                    Orders grouped by reject/cancel {granularity} · {buckets.length} {granularity === 'day' ? 'days' : granularity === 'week' ? 'weeks' : 'months'} in {startDate} → {endDate}. Click any number to see the orders behind it.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      if (!buckets.length) return;
                      downloadCSV(
                        `refund-${granularity}-${startDate}-${endDate}.csv`,
                        ['Period', 'Period Start', 'Period End', 'Rejected', 'Cancelled', 'Total Orders', 'Paid Amount', 'Refunded Amount', 'Pending Amount', 'Refunded Orders', 'Avg Refund Time (hrs)'],
                        buckets.map((b) => [
                          formatBucketLabel(b, granularity), b.bucketStart, b.bucketEnd,
                          b.rejectedCount, b.cancelledCount, b.orderCount,
                          b.paidAmount, b.refundedAmount, b.pendingAmount, b.refundedOrders,
                          b.avgRefundProcessingHours != null ? b.avgRefundProcessingHours.toFixed(2) : '',
                        ]),
                      );
                    }}
                    className="px-3 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-400/30 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)] text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[520px] rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                    <tr className="text-purple-200 uppercase text-xs">
                      <th className="px-4 py-3 text-center">
                        {granularity === 'day' ? 'Date' : granularity === 'week' ? 'Week' : 'Month'}
                      </th>
                      <th className="px-4 py-3 text-center">Rejected</th>
                      <th className="px-4 py-3 text-center">Cancelled</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Paid</th>
                      <th className="px-4 py-3 text-center">Refunded</th>
                      <th className="px-4 py-3 text-center">Pending</th>
                      <th className="px-4 py-3 text-center">Avg Refund Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b) => {
                      const label = formatBucketLabel(b, granularity);
                      const openModal = (filter: CellFilter, suffix: string) => setModal({
                        startDate: b.bucketStart,
                        endDate: b.bucketEnd,
                        filter,
                        title: `${label} · ${suffix}`,
                      });
                      return (
                        <tr key={b.bucketStart} className="border-t border-white/5 hover:bg-white/5">
                          <td className="px-4 py-2.5 text-white whitespace-nowrap font-medium text-center">{label}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="rose" onClick={() => openModal('rejected', 'Rejected')}>{b.rejectedCount.toLocaleString('en-IN')}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="amber" onClick={() => openModal('cancelled', 'Cancelled')}>{b.cancelledCount.toLocaleString('en-IN')}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="purple" bold onClick={() => openModal('all', 'All orders')}>{b.orderCount.toLocaleString('en-IN')}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="purple" onClick={() => openModal('all', 'Paid')}>{formatAmount(b.paidAmount)}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="emerald" onClick={() => openModal('refunded', 'Refunded')}>{formatAmount(b.refundedAmount)}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">
                            <CellButton color="rose" onClick={() => openModal('pending', 'Pending refund')}>{formatAmount(b.pendingAmount)}</CellButton>
                          </td>
                          <td className="px-4 py-2.5 text-center text-sky-300 tabular-nums font-semibold">{formatHours(b.avgRefundProcessingHours)}</td>
                        </tr>
                      );
                    })}
                    {!loading && !buckets.length && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-purple-300/70">No data for this range.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'sellers' && (
          <>
            {presetBar}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Seller-wise Refund Exposure</h2>
              <button
                onClick={() => {
                  if (!data?.topSellers) return;
                  downloadCSV(
                    `refund-top-sellers-${startDate}-${endDate}.csv`,
                    ['Seller', 'Phone', 'Orders', 'Paid Amount', 'Refunded Amount', 'Pending Amount', 'Refunded Orders'],
                    data.topSellers.map((s) => [s.sellerBusinessName ?? '', s.sellerPhone ?? '', s.orderCount, s.paidAmount, s.refundedAmount, s.pendingAmount, s.refundedOrders]),
                  );
                }}
                className="px-3 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/30 text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider"
              >
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-purple-200 text-xs uppercase">
                    <th className="px-4 py-3 text-left">Seller</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Refunded</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-right">% Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topSellers.map((seller) => {
                    // % of paid amount that has been refunded (clipped to 100 in case of rounding quirks)
                    const pct = seller.paidAmount > 0
                      ? Math.min((seller.refundedAmount / seller.paidAmount) * 100, 100)
                      : 0;
                    return (
                      <tr key={seller.sellerId} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2 text-white">{seller.sellerBusinessName || '—'}</td>
                        <td className="px-4 py-2 text-purple-200">{seller.sellerPhone || '—'}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums font-semibold">{seller.orderCount}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(seller.paidAmount)}</td>
                        <td className="px-4 py-2 text-right text-emerald-300 tabular-nums font-semibold">{formatAmount(seller.refundedAmount)}</td>
                        <td className="px-4 py-2 text-right text-rose-300 tabular-nums font-semibold">{formatAmount(seller.pendingAmount)}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums font-semibold">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {!loading && !data?.topSellers?.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-purple-300/70">No data for this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {tab === 'orders' && (
          <>
            {presetBar}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-white">Order Details</h2>
                <p className="text-purple-300/70 text-xs mt-0.5">
                  {data?.list.length ?? 0} orders (showing latest 2,000) · {filteredList.length} match filter
                  {categoryFilter !== 'all' && <span className="text-fuchsia-300"> · category: {categoryFilter}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                  aria-label="Filter by reason category"
                >
                  <option value="all" className="bg-slate-900">All Categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c} className="bg-slate-900">{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search PO, buyer, seller…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 min-w-[220px]"
                />
                {(categoryFilter !== 'all' || search) && (
                  <button
                    onClick={() => { setCategoryFilter('all'); setSearch(''); }}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-rose-500 hover:text-white border border-white/10 hover:border-rose-300/60 text-purple-200 transition-all duration-150"
                    title="Clear filters"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => {
                    downloadCSV(
                      `refund-orders-${startDate}-${endDate}.csv`,
                      ['PO Number', 'PO ID', 'Status', 'Reason Category', 'Order Amount', 'Paid Amount', 'Applied Wallet', 'Payment Event', 'Payment Option', 'Payment Attempt ID', 'Refund Amount', 'Refund ARN', 'Created At', 'Rejected/Cancelled At', 'Refund Completed At', 'Hours till Refund', 'Buyer', 'Buyer Phone', 'Seller', 'Seller Phone', 'Reject Reason', 'Rejected By', 'Badho Team Reason'],
                      filteredList.map((r) => [
                        r.poNumber, r.purchaseOrderId, r.status, r.reasonCategory,
                        r.amount, r.orderPaidAmount, r.appliedWalletAmount ?? '',
                        r.paymentEvent ?? '', r.paymentOption ?? '', r.paymentAttemptId ?? '',
                        r.refundAmount ?? '', r.refundARN ?? '',
                        r.createdAt ?? '', r.rejectedOrCancelledTime ?? '', r.markedStatusCompletedTime ?? '',
                        r.hoursTillRefund ?? '', r.buyerBusinessName ?? '', r.buyerPhone ?? '',
                        r.sellerBusinessName ?? '', r.sellerPhone ?? '',
                        r.rejectReason ?? '', r.rejectedBy ?? '', r.reasonAddedByBadhoTeam ?? '',
                      ]),
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-400/30 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)] text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                  <tr className="text-purple-200 uppercase">
                    <th className="px-3 py-2 text-left">PO Number</th>
                    <th className="px-3 py-2 text-left">PO ID</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Delivery Status</th>
                    <th className="px-3 py-2 text-left">Reason Category</th>
                    <th className="px-3 py-2 text-right">Order Amt</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Wallet</th>
                    <th className="px-3 py-2 text-left">Payment Event</th>
                    <th className="px-3 py-2 text-left">Payment Option</th>
                    <th className="px-3 py-2 text-left">Payment Attempt ID</th>
                    <th className="px-3 py-2 text-right">Refund</th>
                    <th className="px-3 py-2 text-left">Refund ARN</th>
                    <th className="px-3 py-2 text-right">Refund Proc Hrs</th>
                    <th className="px-3 py-2 text-right">Hrs→Refund</th>
                    <th className="px-3 py-2 text-left">Created At</th>
                    <th className="px-3 py-2 text-left">Order Placed At</th>
                    <th className="px-3 py-2 text-left">Rejected At</th>
                    <th className="px-3 py-2 text-left">Cancelled At</th>
                    <th className="px-3 py-2 text-left">Reject/Cancel At</th>
                    <th className="px-3 py-2 text-left">Refunded At</th>
                    <th className="px-3 py-2 text-left">Buyer</th>
                    <th className="px-3 py-2 text-left">Seller</th>
                    <th className="px-3 py-2 text-left">Reject Reason</th>
                    <th className="px-3 py-2 text-left">Rejected By</th>
                    <th className="px-3 py-2 text-left">Badho Team Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((r) => (
                    <tr key={r.purchaseOrderId} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-fuchsia-300 font-mono">{r.poNumber}</td>
                      <td className="px-3 py-2 text-purple-300/70 font-mono text-[10px] select-all" title={r.purchaseOrderId}>{r.purchaseOrderId}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.deliveryStatus
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/15 text-sky-200 border border-sky-400/30 whitespace-nowrap">{r.deliveryStatus}</span>
                          : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const cat = categoryStyleFor(r.reasonCategory);
                          return (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ring-1 whitespace-nowrap ${cat.bg} ${cat.tone} ${cat.ring}`}>
                              {r.reasonCategory}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(r.amount)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(r.orderPaidAmount)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums">
                        {r.appliedWalletAmount != null && r.appliedWalletAmount > 0 ? formatAmount(r.appliedWalletAmount) : <span className="text-purple-400/50">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.paymentEvent
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 whitespace-nowrap">{r.paymentEvent}</span>
                          : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-purple-200">{r.paymentOption ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-300/70 font-mono text-[10px] select-all" title={r.paymentAttemptId || ''}>
                        {r.paymentAttemptId || <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.refundAmount != null ? 'text-emerald-300' : 'text-rose-300/70'}`}>
                        {r.refundAmount != null ? formatAmount(r.refundAmount) : 'Pending'}
                      </td>
                      <td className="px-3 py-2 text-emerald-200/90 font-mono text-[10px] select-all" title={r.refundARN || ''}>
                        {r.refundARN || <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">
                        {r.refundProcessingHours != null ? r.refundProcessingHours.toFixed(1) : <span className="text-purple-400/50">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{r.hoursTillRefund != null ? r.hoursTillRefund.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedRejectedTime)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedCancelledTime)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.rejectedOrCancelledTime)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedStatusCompletedTime)}</td>
                      <td className="px-3 py-2 text-purple-200">
                        <div className="text-white">{r.buyerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{r.buyerPhone || ''}</div>
                      </td>
                      <td className="px-3 py-2 text-purple-200">
                        <div className="text-white">{r.sellerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{r.sellerPhone || ''}</div>
                      </td>
                      <td className="px-3 py-2 text-purple-100 min-w-[180px] max-w-[300px]">
                        {r.rejectReason ? <span className="block whitespace-normal break-words leading-snug">{r.rejectReason}</span> : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-purple-200">{r.rejectedBy || <span className="text-purple-400/50 italic">—</span>}</td>
                      <td className="px-3 py-2 text-purple-100 min-w-[180px] max-w-[300px]">
                        {r.reasonAddedByBadhoTeam ? <span className="block whitespace-normal break-words leading-snug">{r.reasonAddedByBadhoTeam}</span> : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredList.length === 0 && (
                    <tr>
                      <td colSpan={26} className="px-4 py-8 text-center text-purple-300/70">No orders match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {tab === 'alerts' && (
          <>
            {presetBar}
            <AlertsTabContent
              alerts={data?.alerts ?? []}
              loading={loading}
              onRefresh={fetchData}
            />
          </>
        )}

        {loading && !data && (
          <div className="mt-6 text-purple-200 text-sm">Loading refund data…</div>
        )}
      </div>

      {/* Drill-down modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div>
                <h3 className="text-base font-bold text-white">{modal.title}</h3>
                <p className="text-purple-300/70 text-xs mt-0.5">
                  {modal.startDate}{modal.startDate !== modal.endDate ? ` → ${modal.endDate}` : ''}
                  {modalOrders ? ` · ${modalOrders.length} orders` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {modalOrders && modalOrders.length > 0 && (
                  <button
                    onClick={() => {
                      downloadCSV(
                        `refund-${modal.filter}-${modal.startDate}-${modal.endDate}.csv`,
                        ['PO Number', 'PO ID', 'Status', 'Reason Category', 'Order Amount', 'Paid Amount', 'Applied Wallet', 'Payment Event', 'Payment Option', 'Payment Attempt ID', 'Refund Amount', 'Refund ARN', 'Created At', 'Rejected/Cancelled At', 'Refund Completed At', 'Hours till Refund', 'Buyer', 'Buyer Phone', 'Seller', 'Seller Phone', 'Reject Reason', 'Rejected By', 'Badho Team Reason'],
                        modalOrders.map((r) => [
                          r.poNumber, r.purchaseOrderId, r.status, r.reasonCategory,
                          r.amount, r.orderPaidAmount, r.appliedWalletAmount ?? '',
                          r.paymentEvent ?? '', r.paymentOption ?? '', r.paymentAttemptId ?? '',
                          r.refundAmount ?? '', r.refundARN ?? '',
                          r.createdAt ?? '', r.rejectedOrCancelledTime ?? '', r.markedStatusCompletedTime ?? '',
                          r.hoursTillRefund ?? '', r.buyerBusinessName ?? '', r.buyerPhone ?? '',
                          r.sellerBusinessName ?? '', r.sellerPhone ?? '',
                          r.rejectReason ?? '', r.rejectedBy ?? '', r.reasonAddedByBadhoTeam ?? '',
                        ]),
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-400/30 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)] text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
                  >
                    Export CSV
                  </button>
                )}
                <button
                  onClick={() => setModal(null)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500 hover:text-white border border-white/10 hover:border-rose-300/60 hover:shadow-[0_0_14px_rgba(244,63,94,0.55)] text-purple-200 text-lg font-bold flex items-center justify-center transition-all duration-150"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {modalLoading && (
                <div className="p-8 text-center text-purple-200 text-sm">Loading orders…</div>
              )}
              {modalError && (
                <div className="p-4 m-4 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">{modalError}</div>
              )}
              {modalOrders && !modalLoading && (
                modalOrders.length === 0 ? (
                  <div className="p-8 text-center text-purple-300/70 text-sm">No orders match this slice.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900/95 backdrop-blur sticky top-0 z-10">
                      <tr className="text-purple-200 uppercase">
                        <th className="px-3 py-2 text-left">PO Number</th>
                        <th className="px-3 py-2 text-left">PO ID</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Delivery Status</th>
                        <th className="px-3 py-2 text-left">Reason Category</th>
                        <th className="px-3 py-2 text-right">Order Amt</th>
                        <th className="px-3 py-2 text-right">Paid</th>
                        <th className="px-3 py-2 text-right">Wallet</th>
                        <th className="px-3 py-2 text-left">Payment Event</th>
                        <th className="px-3 py-2 text-left">Payment Option</th>
                        <th className="px-3 py-2 text-left">Payment Attempt ID</th>
                        <th className="px-3 py-2 text-right">Refund</th>
                        <th className="px-3 py-2 text-left">Refund ARN</th>
                        <th className="px-3 py-2 text-right">Refund Proc Hrs</th>
                        <th className="px-3 py-2 text-right">Hrs→Refund</th>
                        <th className="px-3 py-2 text-left">Created At</th>
                        <th className="px-3 py-2 text-left">Order Placed At</th>
                        <th className="px-3 py-2 text-left">Rejected At</th>
                        <th className="px-3 py-2 text-left">Cancelled At</th>
                        <th className="px-3 py-2 text-left">Reject/Cancel At</th>
                        <th className="px-3 py-2 text-left">Refunded At</th>
                        <th className="px-3 py-2 text-left">Buyer</th>
                        <th className="px-3 py-2 text-left">Seller</th>
                        <th className="px-3 py-2 text-left">Reject Reason</th>
                        <th className="px-3 py-2 text-left">Rejected By</th>
                        <th className="px-3 py-2 text-left">Badho Team Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalOrders.map((r) => (
                        <tr key={r.purchaseOrderId} className="border-t border-white/5 hover:bg-white/5">
                          <td className="px-3 py-2 text-fuchsia-300 font-mono">{r.poNumber}</td>
                          <td className="px-3 py-2 text-purple-300/70 font-mono text-[10px] select-all" title={r.purchaseOrderId}>{r.purchaseOrderId}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              r.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                              : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                            }`}>{r.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            {r.deliveryStatus
                              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/15 text-sky-200 border border-sky-400/30 whitespace-nowrap">{r.deliveryStatus}</span>
                              : <span className="text-purple-400/50 italic">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const cat = categoryStyleFor(r.reasonCategory);
                              return (
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ring-1 whitespace-nowrap ${cat.bg} ${cat.tone} ${cat.ring}`}>
                                  {r.reasonCategory}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(r.amount)}</td>
                          <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(r.orderPaidAmount)}</td>
                          <td className="px-3 py-2 text-right text-purple-100 tabular-nums">
                            {r.appliedWalletAmount != null && r.appliedWalletAmount > 0 ? formatAmount(r.appliedWalletAmount) : <span className="text-purple-400/50">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {r.paymentEvent
                              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 whitespace-nowrap">{r.paymentEvent}</span>
                              : <span className="text-purple-400/50 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-purple-200">{r.paymentOption ?? '—'}</td>
                          <td className="px-3 py-2 text-purple-300/70 font-mono text-[10px] select-all" title={r.paymentAttemptId || ''}>
                            {r.paymentAttemptId || <span className="text-purple-400/50 italic">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.refundAmount != null ? 'text-emerald-300' : 'text-rose-300/70'}`}>
                            {r.refundAmount != null ? formatAmount(r.refundAmount) : 'Pending'}
                          </td>
                          <td className="px-3 py-2 text-emerald-200/90 font-mono text-[10px] select-all" title={r.refundARN || ''}>
                            {r.refundARN || <span className="text-purple-400/50 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">
                            {r.refundProcessingHours != null ? r.refundProcessingHours.toFixed(1) : <span className="text-purple-400/50">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-purple-100 tabular-nums font-semibold">{r.hoursTillRefund != null ? r.hoursTillRefund.toFixed(1) : '—'}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedRejectedTime)}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedCancelledTime)}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.rejectedOrCancelledTime)}</td>
                          <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedStatusCompletedTime)}</td>
                          <td className="px-3 py-2 text-purple-200">
                            <div className="text-white">{r.buyerBusinessName || '—'}</div>
                            <div className="text-purple-300/70 text-[10px]">{r.buyerPhone || ''}</div>
                          </td>
                          <td className="px-3 py-2 text-purple-200">
                            <div className="text-white">{r.sellerBusinessName || '—'}</div>
                            <div className="text-purple-300/70 text-[10px]">{r.sellerPhone || ''}</div>
                          </td>
                          <td className="px-3 py-2 text-purple-100 min-w-[180px] max-w-[300px]">
                            {r.rejectReason ? <span className="block whitespace-normal break-words leading-snug">{r.rejectReason}</span> : <span className="text-purple-400/50 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-purple-200">{r.rejectedBy || <span className="text-purple-400/50 italic">—</span>}</td>
                          <td className="px-3 py-2 text-purple-100 min-w-[180px] max-w-[300px]">
                            {r.reasonAddedByBadhoTeam ? <span className="block whitespace-normal break-words leading-snug">{r.reasonAddedByBadhoTeam}</span> : <span className="text-purple-400/50 italic">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, hint, tint }: { label: string; value: string; hint: string; tint: string }) {
  return (
    <div className={`relative rounded-2xl p-5 border border-white/10 backdrop-blur-xl overflow-hidden bg-gradient-to-br ${tint}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-purple-200/80 font-semibold">{label}</div>
      <div className="text-3xl font-black text-white tabular-nums tracking-tight mt-2">{value}</div>
      <div className="text-[11px] text-purple-200/70 mt-1">{hint}</div>
    </div>
  );
}

function MiniStat({
  label, value, hint, onClick, action, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  action?: string;
  tone?: 'default' | 'alert';
}) {
  const isAlert = tone === 'alert';
  const isClickable = !!onClick;
  const Wrapper: 'button' | 'div' = isClickable ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`relative rounded-xl px-5 py-4 border backdrop-blur-xl text-left transition-all duration-150 ${
        isAlert
          ? 'bg-gradient-to-br from-rose-500/20 to-orange-500/10 border-rose-400/30'
          : 'bg-white/5 border-white/10'
      } ${
        isClickable
          ? (isAlert
              ? 'hover:from-rose-500/35 hover:to-orange-500/20 hover:border-rose-300/60 hover:shadow-[0_0_20px_rgba(244,63,94,0.35)] cursor-pointer'
              : 'hover:bg-white/10 hover:border-fuchsia-400/40 hover:shadow-[0_0_18px_rgba(217,70,239,0.3)] cursor-pointer')
          : ''
      }`}
    >
      <div className={`text-xs uppercase tracking-wider font-semibold ${isAlert ? 'text-rose-200' : 'text-purple-200/80'}`}>{label}</div>
      <div className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight mt-1 ${isAlert ? 'text-white drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]' : 'text-white'}`}>{value}</div>
      {hint && <div className={`text-xs mt-1 ${isAlert ? 'text-rose-200/80' : 'text-purple-200/70'}`}>{hint}</div>}
      {isClickable && action && (
        <div className={`mt-2 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${isAlert ? 'text-rose-200' : 'text-fuchsia-300'}`}>
          {action} <span aria-hidden>→</span>
        </div>
      )}
    </Wrapper>
  );
}

function formatPendingDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} hr`;
  return `${(minutes / 60 / 24).toFixed(1)} day${minutes >= 60 * 48 ? 's' : ''}`;
}

function severityFor(minutes: number): {
  label: string;
  tone: string;
  ring: string;
  bg: string;
} {
  if (minutes < 30)        return { label: 'JUST BREACHED', tone: 'text-amber-200',  ring: 'ring-amber-400/50',  bg: 'bg-amber-500/15' };
  if (minutes < 60)        return { label: 'WARNING',       tone: 'text-orange-200', ring: 'ring-orange-400/50', bg: 'bg-orange-500/15' };
  if (minutes < 60 * 3)    return { label: 'ALERT',         tone: 'text-rose-200',   ring: 'ring-rose-400/50',   bg: 'bg-rose-500/20' };
  if (minutes < 60 * 24)   return { label: 'CRITICAL',      tone: 'text-rose-100',   ring: 'ring-rose-300/70',   bg: 'bg-rose-600/30' };
  return                          { label: 'SEVERE',        tone: 'text-white',      ring: 'ring-red-300',       bg: 'bg-red-700/50' };
}

function categoryStyleFor(category: string): { tone: string; bg: string; ring: string } {
  switch (category) {
    case 'Delivery Partner SLA Breach':
      return { tone: 'text-orange-100', bg: 'bg-orange-500/25', ring: 'ring-orange-400/50' };
    case 'Rejected due to RTO':
      return { tone: 'text-rose-100',   bg: 'bg-rose-500/25',   ring: 'ring-rose-400/50' };
    case 'Brand SLA Breach':
      return { tone: 'text-red-100',    bg: 'bg-red-600/30',    ring: 'ring-red-400/60' };
    case 'Serviceability Issue':
      return { tone: 'text-amber-100',  bg: 'bg-amber-500/25',  ring: 'ring-amber-400/50' };
    case 'Address Issue':
      return { tone: 'text-yellow-100', bg: 'bg-yellow-500/25', ring: 'ring-yellow-400/50' };
    default:
      return { tone: 'text-purple-200', bg: 'bg-white/10',      ring: 'ring-white/20' };
  }
}

function formatAlertsTablePlain(alerts: AlertItem[], limit: number): string {
  if (!alerts.length) return '(no pending refunds)';
  const top = alerts.slice(0, limit);
  const headers = ['PO',       'Age',         'Reason',                'Paid',     'Seller'];
  const widths  = [10,         11,            22,                      9,          24];
  const rows = top.map((a) => [
    (a.poNumber || '—').slice(0, widths[0]),
    formatPendingDuration(a.minutesPending).slice(0, widths[1]),
    (a.reasonCategory || '—').slice(0, widths[2]),
    formatAmount(a.paidAmount).slice(0, widths[3]),
    (a.sellerBusinessName || '—').slice(0, widths[4]),
  ]);
  const lines: string[] = [];
  lines.push(headers.map((h, i) => h.padEnd(widths[i])).join('  '));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => lines.push(r.map((c, i) => c.padEnd(widths[i])).join('  ')));
  if (alerts.length > limit) {
    lines.push('');
    lines.push(`... +${alerts.length - limit} more`);
  }
  return lines.join('\n');
}

function buildAlertSummary(alerts: AlertItem[]): string {
  if (!alerts.length) return '✅ No refunds breaching 10-min SLA';
  const stuck = alerts.reduce((s, a) => s + (a.paidAmount || 0), 0);
  const oldest = alerts[0]?.minutesPending ?? 0;
  return `🚨 ${alerts.length} refund${alerts.length === 1 ? '' : 's'} breaching 10-min SLA · ${formatAmount(stuck)} stuck · Oldest: ${formatPendingDuration(oldest)}`;
}

function AlertsTabContent({
  alerts, loading, onRefresh,
}: {
  alerts: AlertItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const totalStuck = alerts.reduce((s, a) => s + (a.paidAmount || 0), 0);
  const oldest = alerts[0]?.minutesPending ?? 0;

  // ─── Send-alert modal state ──────────────────────────────────────
  type Channel = 'slack' | 'email' | 'whatsapp';
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Reset everything when the modal closes
  useEffect(() => {
    if (notifyOpen) return;
    setChannel(null);
    setRecipient('');
    setNote('');
    setResult(null);
    setSending(false);
  }, [notifyOpen]);

  // Escape closes
  useEffect(() => {
    if (!notifyOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNotifyOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifyOpen]);

  const handleSend = async () => {
    if (!channel) return;
    setSending(true);
    setResult(null);

    const summary = buildAlertSummary(alerts);
    const noteText = note.trim();

    try {
      if (channel === 'slack') {
        // Slack mrkdwn — code block keeps monospace alignment
        const table = formatAlertsTablePlain(alerts, 25);
        const text = `*${summary}*${noteText ? `\n${noteText}` : ''}\n\n\`\`\`\n${table}\n\`\`\``;
        const res = await fetch('/api/refund-order-amount/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setResult({ ok: true, msg: 'Sent to Slack ✓' });
      } else if (channel === 'email') {
        if (!recipient.trim()) throw new Error('Add at least one email address');
        const table = formatAlertsTablePlain(alerts, 25);
        const subject = encodeURIComponent(summary.replace(/^[^\s]+\s/, '')); // strip leading emoji from subject line
        const body = encodeURIComponent(`${summary}\n${noteText ? '\n' + noteText + '\n' : ''}\n${table}\n`);
        const to = encodeURIComponent(recipient.trim());
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
        setResult({ ok: true, msg: 'Opening your email app…' });
      } else if (channel === 'whatsapp') {
        const phone = recipient.replace(/[^\d]/g, '');
        if (phone.length < 8) throw new Error('Add a valid phone number (with country code, no +)');
        // WhatsApp limits URLs; cap at 15 rows so we stay well under the wa.me limit.
        const table = formatAlertsTablePlain(alerts, 15);
        const text = encodeURIComponent(`${summary}\n${noteText ? '\n' + noteText + '\n' : ''}\n\`\`\`\n${table}\n\`\`\``);
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
        setResult({ ok: true, msg: 'Opening WhatsApp…' });
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setSending(false);
    }
  };

  // Severity buckets
  const sevBuckets = useMemo(() => {
    const b = {
      '10–30 min':  { count: 0, amount: 0, color: '#f59e0b' },
      '30–60 min':  { count: 0, amount: 0, color: '#fb923c' },
      '1–3 hr':     { count: 0, amount: 0, color: '#f43f5e' },
      '3–24 hr':    { count: 0, amount: 0, color: '#e11d48' },
      '24 hr+':     { count: 0, amount: 0, color: '#b91c1c' },
    };
    for (const a of alerts) {
      const m = a.minutesPending;
      if (m < 30) { b['10–30 min'].count++; b['10–30 min'].amount += a.paidAmount; }
      else if (m < 60) { b['30–60 min'].count++; b['30–60 min'].amount += a.paidAmount; }
      else if (m < 180) { b['1–3 hr'].count++; b['1–3 hr'].amount += a.paidAmount; }
      else if (m < 1440) { b['3–24 hr'].count++; b['3–24 hr'].amount += a.paidAmount; }
      else { b['24 hr+'].count++; b['24 hr+'].amount += a.paidAmount; }
    }
    return Object.entries(b).map(([label, v]) => ({ label, ...v }));
  }, [alerts]);

  return (
    <div className="space-y-4">
      {/* Hero summary */}
      <div className={`rounded-2xl border p-5 ${
        alerts.length > 0
          ? 'border-rose-400/40 bg-gradient-to-br from-rose-500/20 via-rose-600/15 to-red-700/20 shadow-[0_0_40px_rgba(244,63,94,0.25)]'
          : 'border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15'
      }`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
              alerts.length > 0 ? 'bg-rose-500/30 border border-rose-400/40 animate-pulse' : 'bg-emerald-500/30 border border-emerald-400/40'
            }`}>
              {alerts.length > 0 ? '⚠️' : '✅'}
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">
                {alerts.length > 0
                  ? `${alerts.length.toLocaleString('en-IN')} refund${alerts.length === 1 ? '' : 's'} breaching 10-min SLA`
                  : 'All caught up'}
              </h2>
              <p className={`text-sm ${alerts.length > 0 ? 'text-rose-200' : 'text-emerald-200'}`}>
                {alerts.length > 0
                  ? `₹${formatAmount(totalStuck).replace('₹', '')} stuck · Oldest: ${formatPendingDuration(oldest)}`
                  : 'No refunds older than 10 minutes are pending.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {alerts.length > 0 && (
              <button
                onClick={() => setNotifyOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-white hover:border-rose-300 text-xs font-black uppercase tracking-wider transition-all duration-150 shadow-[0_0_18px_rgba(255,255,255,0.3)] flex items-center gap-1.5"
              >
                <span aria-hidden>📢</span> Send Alert
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white hover:text-slate-900 border border-white/20 hover:border-white text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:opacity-50"
            >
              {loading ? 'Checking…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        {/* Severity strip */}
        {alerts.length > 0 && (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2">
            {sevBuckets.map((b) => (
              <div key={b.label} className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: b.color }}>{b.label}</div>
                <div className="text-xl font-black text-white tabular-nums">{b.count}</div>
                <div className="text-[10px] text-white/60">{b.count > 0 ? formatAmount(b.amount) : '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerts table */}
      {alerts.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-bold text-white">Pending Refunds &gt; 10 minutes</h3>
              <p className="text-purple-300/70 text-xs mt-0.5">Sorted oldest first. Color = age severity.</p>
            </div>
            <button
              onClick={() => {
                downloadCSV(
                  `refund-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['PO Number', 'PO ID', 'Status', 'Delivery Status', 'Paid Amount', 'Applied Wallet', 'Payment Event', 'Payment Option', 'Payment Attempt ID', 'Reason Category', 'Pending For', 'Created At', 'Order Placed At', 'Reject/Cancel At', 'Buyer', 'Buyer Phone', 'Seller', 'Seller Phone', 'Reject Reason', 'Rejected By', 'Badho Team Reason'],
                  alerts.map((a) => [
                    a.poNumber, a.purchaseOrderId, a.status, a.deliveryStatus ?? '', a.paidAmount,
                    a.appliedWalletAmount ?? '', a.paymentEvent ?? '', a.paymentOption ?? '', a.paymentAttemptId ?? '',
                    a.reasonCategory,
                    formatPendingDuration(a.minutesPending),
                    a.createdAt ?? '', a.markedPendingTime ?? '', a.rejectedOrCancelledTime ?? '',
                    a.buyerBusinessName ?? '', a.buyerPhone ?? '',
                    a.sellerBusinessName ?? '', a.sellerPhone ?? '',
                    a.rejectReason ?? '', a.rejectedBy ?? '', a.reasonAddedByBadhoTeam ?? '',
                  ]),
                );
              }}
              className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white border border-fuchsia-400/30 hover:border-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)] text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                <tr className="text-purple-200 uppercase text-xs">
                  <th className="px-4 py-3 text-left">Severity</th>
                  <th className="px-4 py-3 text-left">Pending For</th>
                  <th className="px-4 py-3 text-left">PO Number</th>
                  <th className="px-4 py-3 text-left">PO ID</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Delivery Status</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-left">Payment</th>
                  <th className="px-4 py-3 text-left">Reason Category</th>
                  <th className="px-4 py-3 text-left">Order Placed At</th>
                  <th className="px-4 py-3 text-left">Reject/Cancel At</th>
                  <th className="px-4 py-3 text-left">Buyer</th>
                  <th className="px-4 py-3 text-left">Seller</th>
                  <th className="px-4 py-3 text-left">Reject Reason</th>
                  <th className="px-4 py-3 text-left">Rejected By</th>
                  <th className="px-4 py-3 text-left">Badho Team Reason</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const sev = severityFor(a.minutesPending);
                  return (
                    <tr key={a.purchaseOrderId} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ring-1 ${sev.bg} ${sev.tone} ${sev.ring}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 font-bold tabular-nums ${sev.tone}`}>{formatPendingDuration(a.minutesPending)}</td>
                      <td className="px-4 py-2.5 text-fuchsia-300 font-mono">{a.poNumber}</td>
                      <td className="px-4 py-2.5 text-purple-300/70 font-mono text-[10px] select-all" title={a.purchaseOrderId}>{a.purchaseOrderId}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          a.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        }`}>{a.status}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {a.deliveryStatus
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/15 text-sky-200 border border-sky-400/30 whitespace-nowrap">{a.deliveryStatus}</span>
                          : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-purple-100 tabular-nums font-semibold">{formatAmount(a.paidAmount)}</td>
                      <td className="px-4 py-2.5 text-purple-200">{a.paymentOption ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const cat = categoryStyleFor(a.reasonCategory);
                          return (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ring-1 whitespace-nowrap ${cat.bg} ${cat.tone} ${cat.ring}`}>
                              {a.reasonCategory}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-purple-200 whitespace-nowrap">{formatDateTime(a.markedPendingTime)}</td>
                      <td className="px-4 py-2.5 text-purple-200 whitespace-nowrap">{formatDateTime(a.rejectedOrCancelledTime)}</td>
                      <td className="px-4 py-2.5 text-purple-200">
                        <div className="text-white">{a.buyerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{a.buyerPhone || ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-purple-200">
                        <div className="text-white">{a.sellerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{a.sellerPhone || ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-purple-100 min-w-[180px] max-w-[300px]">
                        {a.rejectReason ? <span className="block whitespace-normal break-words leading-snug">{a.rejectReason}</span> : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-purple-200">{a.rejectedBy || <span className="text-purple-400/50 italic">—</span>}</td>
                      <td className="px-4 py-2.5 text-purple-100 min-w-[180px] max-w-[300px]">
                        {a.reasonAddedByBadhoTeam ? <span className="block whitespace-normal break-words leading-snug">{a.reasonAddedByBadhoTeam}</span> : <span className="text-purple-400/50 italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send-alert modal */}
      {notifyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setNotifyOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-br from-rose-500/20 via-purple-600/10 to-slate-900">
              <div>
                <h3 className="text-base font-bold text-white">
                  {channel === null ? 'Send Alert' : channel === 'slack' ? 'Send to Slack' : channel === 'email' ? 'Send via Email' : 'Send via WhatsApp'}
                </h3>
                <p className="text-purple-300/70 text-xs mt-0.5">
                  {channel === null
                    ? `${alerts.length} pending refund${alerts.length === 1 ? '' : 's'} will be included as a table.`
                    : 'Recipients see a summary line + a monospace table of the top alerts.'}
                </p>
              </div>
              <button
                onClick={() => setNotifyOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500 hover:text-white border border-white/10 text-purple-200 text-lg font-bold flex items-center justify-center transition-all duration-150"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-4">
              {/* Step 1: Channel picker */}
              {channel === null && (
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { id: 'slack' as const,    label: 'Slack',    emoji: '💬', tint: 'from-purple-500/30 to-indigo-500/10', ring: 'hover:ring-purple-400/60' },
                    { id: 'email' as const,    label: 'Email',    emoji: '📧', tint: 'from-sky-500/30    to-blue-500/10',   ring: 'hover:ring-sky-400/60' },
                    { id: 'whatsapp' as const, label: 'WhatsApp', emoji: '📱', tint: 'from-emerald-500/30 to-teal-500/10',  ring: 'hover:ring-emerald-400/60' },
                  ]).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setChannel(c.id)}
                      className={`p-4 rounded-xl border border-white/10 bg-gradient-to-br ${c.tint} hover:bg-white/10 hover:ring-2 ${c.ring} transition-all duration-150 flex flex-col items-center gap-2`}
                    >
                      <span className="text-3xl" aria-hidden>{c.emoji}</span>
                      <span className="text-white text-sm font-bold uppercase tracking-wider">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: Channel form */}
              {channel !== null && (
                <div className="space-y-3">
                  {channel === 'slack' && (
                    <div className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-400/30 text-xs text-purple-200">
                      Goes to the channel bound to your team&apos;s Slack webhook (<code className="text-purple-100">SLACK_WEBHOOK_URL</code> env var).
                    </div>
                  )}
                  {channel === 'email' && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold mb-1">To (comma-separated)</label>
                      <input
                        type="text"
                        placeholder="ops@badho.in, alerts@badho.in"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>
                  )}
                  {channel === 'whatsapp' && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold mb-1">Phone (with country code, no +)</label>
                      <input
                        type="tel"
                        placeholder="919876543210"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <p className="text-[10px] text-purple-300/60 mt-1">Opens WhatsApp Web / app with the table pre-filled.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold mb-1">Optional note</label>
                    <textarea
                      placeholder="Anything you want above the table…"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 resize-none"
                    />
                  </div>

                  {/* Preview */}
                  <details className="rounded-lg bg-black/30 border border-white/10">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-purple-200 font-semibold">
                      Preview ({channel === 'whatsapp' ? 'top 15' : 'top 25'} of {alerts.length})
                    </summary>
                    <pre className="px-3 py-2 text-[10px] text-purple-100 font-mono overflow-x-auto max-h-48 leading-tight border-t border-white/10">{buildAlertSummary(alerts)}{note.trim() ? `\n${note.trim()}` : ''}{'\n\n'}{formatAlertsTablePlain(alerts, channel === 'whatsapp' ? 15 : 25)}</pre>
                  </details>

                  {result && (
                    <div className={`px-3 py-2 rounded-lg text-xs ${
                      result.ok
                        ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-200'
                        : 'bg-rose-500/15 border border-rose-400/30 text-rose-200'
                    }`}>
                      {result.msg}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      onClick={() => { setChannel(null); setResult(null); }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-purple-200 text-xs font-semibold transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending || alerts.length === 0}
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-500 hover:from-rose-600 hover:to-fuchsia-600 text-white text-xs font-black uppercase tracking-wider shadow-[0_0_14px_rgba(244,63,94,0.5)] transition-all duration-150 disabled:opacity-50"
                    >
                      {sending ? 'Sending…' : channel === 'slack' ? 'Send to Slack' : channel === 'email' ? 'Open Mail App' : 'Open WhatsApp'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CellButton({
  children, onClick, color, bold,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: 'rose' | 'amber' | 'emerald' | 'purple';
  bold?: boolean;
}) {
  const tone =
    color === 'rose'    ? 'text-rose-300    hover:text-white hover:bg-rose-500    hover:ring-1 hover:ring-rose-300/60    hover:shadow-[0_0_14px_rgba(244,63,94,0.55)]'
    : color === 'amber' ? 'text-amber-300   hover:text-white hover:bg-amber-500   hover:ring-1 hover:ring-amber-300/60   hover:shadow-[0_0_14px_rgba(245,158,11,0.55)]'
    : color === 'emerald' ? 'text-emerald-300 hover:text-white hover:bg-emerald-500 hover:ring-1 hover:ring-emerald-300/60 hover:shadow-[0_0_14px_rgba(16,185,129,0.55)]'
    : 'text-purple-100 hover:text-white hover:bg-fuchsia-500 hover:ring-1 hover:ring-fuchsia-300/60 hover:shadow-[0_0_14px_rgba(217,70,239,0.55)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-block px-2 py-0.5 rounded-md transition-all duration-150 font-semibold ${tone} ${bold ? 'font-bold' : ''}`}
    >
      {children}
    </button>
  );
}
