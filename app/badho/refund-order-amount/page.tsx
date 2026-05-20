'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
interface MonthBucket {
  month: number;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
}
interface DayBucket {
  day: string;
  rejectedCount: number;
  cancelledCount: number;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
  avgRefundProcessingHours: number | null;
}
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
  amount: number;
  markedRejectedTime: string | null;
  markedCancelledTime: string | null;
  rejectedOrCancelledTime: string | null;
  poNumber: string;
  paymentOption: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  orderPaidAmount: number;
  refundAmount: number | null;
  markedStatusCompletedTime: string | null;
  markedStatusInitiatedTime: string | null;
  refundProcessingHours: number | null;
  hoursTillRefund: number | null;
}
interface RefundApiResponse {
  summary: Summary;
  byMonth: MonthBucket[];
  byDay: DayBucket[];
  topSellers: SellerRow[];
  list: ListRow[];
  year: number;
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

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<RefundApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'sellers' | 'orders'>('overview');
  const [search, setSearch] = useState('');

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
      const res = await fetch(`/api/refund-order-amount?year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as RefundApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [year]);

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

  const monthlyChart = useMemo(() => {
    const map = new Map(data?.byMonth.map((b) => [b.month, b]) ?? []);
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = map.get(m);
      return {
        label: MONTH_NAMES[i],
        month: m,
        paid: row?.paidAmount ?? 0,
        refunded: row?.refundedAmount ?? 0,
        pending: row?.pendingAmount ?? 0,
        orders: row?.orderCount ?? 0,
      };
    });
  }, [data]);

  const filteredList = useMemo(() => {
    if (!data?.list) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.list;
    return data.list.filter((r) =>
      [r.poNumber, r.buyerBusinessName, r.buyerPhone, r.sellerBusinessName, r.sellerPhone, r.paymentOption, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="w-[95%] mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/badho"
            className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
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
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Refund Order Amount
            </h1>
            <p className="text-purple-200 text-sm mt-1">
              Prepaid (FULL/PARTIAL advance) D2R orders that were rejected or cancelled — tracked against refunds completed in <span className="text-purple-100 font-medium">{year}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-purple-300">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y} className="bg-slate-900">{y}</option>
              ))}
            </select>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/30 text-fuchsia-100 text-xs font-semibold disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl">
          {(['overview', 'sellers', 'orders'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === t
                  ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.5)]'
                  : 'text-purple-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              {t === 'overview' ? 'Monthly Overview' : t === 'sellers' ? 'Top Sellers' : 'Order Details'}
            </button>
          ))}
        </div>

        {/* KPI cards — only on Monthly Overview */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Total Paid Amount"
              value={s ? formatAmount(s.totalPaidAmount) : '—'}
              hint={s ? `${s.totalOrders.toLocaleString('en-IN')} prepaid orders rejected / cancelled` : 'Sum of paidAmount'}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Monthly Refund Trend — {year}</h2>
              <button
                onClick={() => {
                  downloadCSV(
                    `refund-monthly-${year}.csv`,
                    ['Month', 'Orders', 'Paid Amount', 'Refunded Amount', 'Pending Amount', 'Refunded Orders'],
                    monthlyChart.map((r) => [r.label, r.orders, r.paid, r.refunded, r.pending, data?.byMonth.find((b) => b.month === r.month)?.refundedOrders ?? 0]),
                  );
                }}
                className="px-3 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/30 text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider"
              >
                Export CSV
              </button>
            </div>
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer>
                <ComposedChart data={monthlyChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" stroke="#c4b5fd" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" stroke="#c4b5fd" tick={{ fontSize: 11 }} tickFormatter={(v) => formatAmount(Number(v))} />
                  <YAxis yAxisId="right" orientation="right" stroke="#c4b5fd" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#f5d0fe' }}
                    formatter={(v, name) => {
                      if (name === 'Orders') return [String(v), String(name)];
                      return [formatAmount(Number(v)), String(name)];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="paid" name="Paid" fill="#a855f7" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="left" dataKey="refunded" name="Refunded" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="left" dataKey="pending" name="Pending" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <MiniStat label="Avg Refund / Order" value={s ? formatAmount(s.avgRefundAmount) : '—'} />
              <MiniStat label="Refund Processing" value={formatHours(s?.avgRefundProcessingHours ?? null)} hint="initiated → completed" />
              <MiniStat label="Reject/Cancel → Refund" value={formatHours(s?.avgHoursTillRefund ?? null)} hint="reject/cancel → completed" />
              <MiniStat label="Unrefunded Orders" value={s ? (s.totalOrders - s.refundedOrders).toLocaleString('en-IN') : '—'} />
            </div>

            {/* Day-wise breakdown */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Day-wise Breakdown</h3>
                  <p className="text-purple-300/70 text-xs mt-0.5">
                    Orders grouped by reject/cancel date · {data?.byDay.length ?? 0} days
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!data?.byDay) return;
                    downloadCSV(
                      `refund-daily-${year}.csv`,
                      ['Date', 'Rejected', 'Cancelled', 'Total Orders', 'Paid Amount', 'Refunded Amount', 'Pending Amount', 'Refunded Orders', 'Avg Refund Time (hrs)'],
                      data.byDay.map((d) => [
                        d.day, d.rejectedCount, d.cancelledCount, d.orderCount,
                        d.paidAmount, d.refundedAmount, d.pendingAmount, d.refundedOrders,
                        d.avgRefundProcessingHours != null ? d.avgRefundProcessingHours.toFixed(2) : '',
                      ]),
                    );
                  }}
                  className="px-3 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/30 text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider"
                >
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto max-h-[480px] rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                    <tr className="text-purple-200 uppercase">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Rejected</th>
                      <th className="px-3 py-2 text-right">Cancelled</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Refunded</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2 text-right">Avg Refund Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.byDay.map((d) => (
                      <tr key={d.day} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 text-white whitespace-nowrap">{formatDay(d.day)}</td>
                        <td className="px-3 py-2 text-right text-rose-300 tabular-nums">{d.rejectedCount.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-amber-300 tabular-nums">{d.cancelledCount.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-purple-100 font-semibold tabular-nums">{d.orderCount.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right text-purple-100 tabular-nums">{formatAmount(d.paidAmount)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300 tabular-nums">{formatAmount(d.refundedAmount)}</td>
                        <td className="px-3 py-2 text-right text-rose-300 tabular-nums">{formatAmount(d.pendingAmount)}</td>
                        <td className="px-3 py-2 text-right text-sky-300 tabular-nums">{formatHours(d.avgRefundProcessingHours)}</td>
                      </tr>
                    ))}
                    {!loading && !data?.byDay?.length && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-purple-300/70">No daily data for {year}.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'sellers' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Top Sellers by Refund Exposure</h2>
              <button
                onClick={() => {
                  if (!data?.topSellers) return;
                  downloadCSV(
                    `refund-top-sellers-${year}.csv`,
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
                    const pct = seller.orderCount > 0 ? (seller.refundedOrders / seller.orderCount) * 100 : 0;
                    return (
                      <tr key={seller.sellerId} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2 text-white">{seller.sellerBusinessName || '—'}</td>
                        <td className="px-4 py-2 text-purple-200">{seller.sellerPhone || '—'}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums">{seller.orderCount}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums">{formatAmount(seller.paidAmount)}</td>
                        <td className="px-4 py-2 text-right text-emerald-300 tabular-nums">{formatAmount(seller.refundedAmount)}</td>
                        <td className="px-4 py-2 text-right text-rose-300 tabular-nums">{formatAmount(seller.pendingAmount)}</td>
                        <td className="px-4 py-2 text-right text-purple-100 tabular-nums">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {!loading && !data?.topSellers?.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-purple-300/70">No data for {year}.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-white">Order Details</h2>
                <p className="text-purple-300/70 text-xs mt-0.5">
                  {data?.list.length ?? 0} orders (showing latest 2,000) · {filteredList.length} match filter
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search PO, buyer, seller…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 min-w-[220px]"
                />
                <button
                  onClick={() => {
                    downloadCSV(
                      `refund-orders-${year}.csv`,
                      ['PO Number', 'Status', 'Order Amount', 'Paid Amount', 'Refund Amount', 'Payment Option', 'Rejected/Cancelled At', 'Refund Completed At', 'Hours till Refund', 'Buyer', 'Buyer Phone', 'Seller', 'Seller Phone'],
                      filteredList.map((r) => [
                        r.poNumber, r.status, r.amount, r.orderPaidAmount, r.refundAmount ?? '', r.paymentOption ?? '',
                        r.rejectedOrCancelledTime ?? '', r.markedStatusCompletedTime ?? '',
                        r.hoursTillRefund ?? '', r.buyerBusinessName ?? '', r.buyerPhone ?? '',
                        r.sellerBusinessName ?? '', r.sellerPhone ?? '',
                      ]),
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/30 text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider"
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
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Order Amt</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Refund</th>
                    <th className="px-3 py-2 text-left">Payment</th>
                    <th className="px-3 py-2 text-left">Reject/Cancel At</th>
                    <th className="px-3 py-2 text-left">Refunded At</th>
                    <th className="px-3 py-2 text-right">Hrs→Refund</th>
                    <th className="px-3 py-2 text-left">Buyer</th>
                    <th className="px-3 py-2 text-left">Seller</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((r) => (
                    <tr key={r.purchaseOrderId} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-fuchsia-300 font-mono">{r.poNumber}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums">{formatAmount(r.amount)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums">{formatAmount(r.orderPaidAmount)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.refundAmount != null ? 'text-emerald-300' : 'text-rose-300/70'}`}>
                        {r.refundAmount != null ? formatAmount(r.refundAmount) : 'Pending'}
                      </td>
                      <td className="px-3 py-2 text-purple-200">{r.paymentOption ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.rejectedOrCancelledTime)}</td>
                      <td className="px-3 py-2 text-purple-200 whitespace-nowrap">{formatDateTime(r.markedStatusCompletedTime)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 tabular-nums">{r.hoursTillRefund != null ? r.hoursTillRefund.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-purple-200">
                        <div className="text-white">{r.buyerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{r.buyerPhone || ''}</div>
                      </td>
                      <td className="px-3 py-2 text-purple-200">
                        <div className="text-white">{r.sellerBusinessName || '—'}</div>
                        <div className="text-purple-300/70 text-[10px]">{r.sellerPhone || ''}</div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredList.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-purple-300/70">No orders match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="mt-6 text-purple-200 text-sm">Loading refund data…</div>
        )}
      </div>

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

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-purple-300/80">{label}</div>
      <div className="text-base font-bold text-white tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-purple-300/60">{hint}</div>}
    </div>
  );
}
