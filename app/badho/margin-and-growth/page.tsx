'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';

interface DauPoint {
  day: string;
  buyers: number;
}

interface Summary {
  avg: number;
  peak: number;
  peakDay: string | null;
  latest: number;
  first: number;
  changePct: number;
  windowDays: number | null;
}

type Granularity = 'day' | 'week' | 'month';

interface OrderTrendPoint {
  bucket: string;
  orders: number;
  buyers: number;
}

interface OrderSummary {
  totalOrders: number;
  avg: number;
  peak: number;
  peakBucket: string | null;
  latest: number;
  first: number;
  changePct: number;
  granularity: Granularity;
  windowDays: number;
}

const fmtCompact = (n: number) => {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

const fmtInt = (n: number) => n.toLocaleString('en-IN');

const fmtBucket = (s: string, gran: Granularity) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const dt = new Date(y, m - 1, d);
  if (gran === 'month') return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  if (gran === 'week') return `W/o ${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// Trailing-day count from Jan 1 of the current year through today (inclusive),
// so the shared `days` window can express a year-to-date range.
const computeYtdDays = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.max(1, Math.round((now.getTime() - start.getTime()) / 86_400_000));
};

const RANGES = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
] as const;

const GRANULARITIES = [
  { label: 'Day', value: 'day' as const },
  { label: 'Week', value: 'week' as const },
  { label: 'Month', value: 'month' as const },
] as const;

function KPICard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const tones: Record<string, string> = {
    fuchsia: 'from-fuchsia-500/20 to-fuchsia-600/5 border-fuchsia-400/30 text-fuchsia-200',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-400/30 text-purple-200',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-400/30 text-emerald-200',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-400/30 text-amber-200',
    sky: 'from-sky-500/20 to-sky-600/5 border-sky-400/30 text-sky-200',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${tones[tone] || tones.purple}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-70">{sub}</div>
    </div>
  );
}

export default function MarginAndGrowthDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const ytdDays = useMemo(() => computeYtdDays(), []);
  const [days, setDays] = useState<number>(() => computeYtdDays());
  const isYtd = days === ytdDays;
  const windowSub = isYtd ? 'year to date' : `over last ${days} days`;
  const [data, setData] = useState<DauPoint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Order creation trend (with day/week/month granularity toggle)
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [orderData, setOrderData] = useState<OrderTrendPoint[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/margin-and-growth/dau?days=${days}&granularity=${granularity}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load');
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json.data || []);
        setSummary(json.summary || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, days, granularity]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    setOrderLoading(true);
    setOrderError(null);
    fetch(`/api/margin-and-growth/order-trend?days=${days}&granularity=${granularity}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load');
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setOrderData(json.data || []);
        setOrderSummary(json.summary || null);
      })
      .catch((e) => {
        if (!cancelled) setOrderError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setOrderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, days, granularity]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  // Merge DAU (active buyers) and order-trend (orders + ordering buyers) into a
  // single series keyed by the shared date bucket, so both render in one chart.
  const mergedData = useMemo(() => {
    const map = new Map<
      string,
      { bucket: string; activeBuyers: number | null; orders: number | null; orderBuyers: number | null }
    >();
    for (const p of data) {
      map.set(p.day, { bucket: p.day, activeBuyers: p.buyers, orders: null, orderBuyers: null });
    }
    for (const p of orderData) {
      const ex = map.get(p.bucket) || { bucket: p.bucket, activeBuyers: null, orders: null, orderBuyers: null };
      ex.orders = p.orders;
      ex.orderBuyers = p.buyers;
      map.set(p.bucket, ex);
    }
    return [...map.values()]
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((r) => ({ ...r, label: fmtBucket(r.bucket, granularity) }));
  }, [data, orderData, granularity]);

  const mergedLoading = loading || orderLoading;
  const mergedError = error || orderError;

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-7xl mx-auto relative z-10">
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

        {/* Header */}
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
              🚀 Daily Wise Trend
            </h1>
            <p className="text-purple-200 text-sm mt-1">
              Active buyers, order creation, and ordering buyers — bucketed by day, week, or month.
            </p>
          </div>
          {/* Range toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  days === r.days
                    ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]'
                    : 'text-purple-200 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setDays(ytdDays)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                isYtd
                  ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]'
                  : 'text-purple-200 hover:bg-white/10'
              }`}
            >
              YTD
            </button>
          </div>
        </div>

        {/* KPIs */}
        {summary && orderSummary && !mergedLoading && !mergedError && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KPICard label="Avg Active Buyers" value={fmtInt(summary.avg)} sub={windowSub} tone="fuchsia" />
            <KPICard label="Total Orders" value={fmtInt(orderSummary.totalOrders)} sub={windowSub} tone="sky" />
            <KPICard label={`Avg Orders / ${granularity}`} value={fmtInt(orderSummary.avg)} sub={`per ${granularity}`} tone="purple" />
            <KPICard
              label="Peak Orders"
              value={fmtInt(orderSummary.peak)}
              sub={orderSummary.peakBucket ? fmtBucket(orderSummary.peakBucket, granularity) : '—'}
              tone="emerald"
            />
          </div>
        )}

        {/* Merged trend: active buyers + orders + ordering buyers */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">Active Buyers &amp; Order Creation Trend</h2>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Distinct active buyers, D2R intercity orders, and ordering buyers per {granularity}.
              </p>
            </div>
            {/* Granularity toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
              {GRANULARITIES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    granularity === g.value
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.45)]'
                      : 'text-purple-200 hover:bg-white/10'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {mergedLoading ? (
            <div className="h-96 flex items-center justify-center text-purple-300 text-sm">Loading trend…</div>
          ) : mergedError ? (
            <div className="h-96 flex items-center justify-center text-rose-300 text-sm">Error: {mergedError}</div>
          ) : mergedData.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mergedData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ordersBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                    labelStyle={{ color: '#e9d5ff', fontWeight: 600, marginBottom: 2 }}
                    formatter={(v, name) => [v == null ? '—' : fmtInt(Number(v)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                  <Bar
                    dataKey="orders"
                    name="Orders"
                    fill="url(#ordersBar)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="activeBuyers"
                    name="Active Buyers"
                    stroke="#d946ef"
                    strokeWidth={2}
                    connectNulls
                    dot={mergedData.length > 70 ? false : { r: 2.5, fill: '#d946ef', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: '#d946ef', stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="orderBuyers"
                    name="Ordering Buyers"
                    stroke="#f472b6"
                    strokeWidth={2}
                    connectNulls
                    dot={mergedData.length > 70 ? false : { r: 2.5, fill: '#f472b6', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: '#f472b6', stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  {summary?.peakDay && (
                    <ReferenceDot
                      x={fmtBucket(summary.peakDay, granularity)}
                      y={summary.peak}
                      r={6}
                      fill="#34d399"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{
                        value: `Peak ${fmtInt(summary.peak)}`,
                        position: 'top',
                        fill: '#34d399',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
