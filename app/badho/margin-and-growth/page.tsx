'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';

interface DauPoint {
  day: string;
  buyers: number;
  ma7: number;
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

const fmtDay = (s: string) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

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
    fetch(`/api/margin-and-growth/dau?days=${days}`)
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
  }, [authChecked, days]);

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

  const chartData = useMemo(
    () => data.map((p) => ({ ...p, dayLabel: fmtDay(p.day) })),
    [data]
  );

  const orderChartData = useMemo(
    () => orderData.map((p) => ({ ...p, bucketLabel: fmtBucket(p.bucket, granularity) })),
    [orderData, granularity]
  );

  const up = (summary?.changePct ?? 0) >= 0;
  const ordersUp = (orderSummary?.changePct ?? 0) >= 0;

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
              Daily Active Buyers — distinct buyers who opened a buyer-app session each day.
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
        {summary && !loading && !error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KPICard label="Avg Daily Buyers" value={fmtInt(summary.avg)} sub={windowSub} tone="fuchsia" />
            <KPICard
              label="Peak Day"
              value={fmtInt(summary.peak)}
              sub={summary.peakDay ? fmtDay(summary.peakDay) : '—'}
              tone="emerald"
            />
            <KPICard label="Latest Day" value={fmtInt(summary.latest)} sub={data.length ? fmtDay(data[data.length - 1].day) : '—'} tone="purple" />
            <KPICard
              label="Change vs Start"
              value={`${up ? '▲' : '▼'} ${Math.abs(summary.changePct).toFixed(1)}%`}
              sub={`${fmtInt(summary.first)} → ${fmtInt(summary.latest)}`}
              tone={up ? 'emerald' : 'amber'}
            />
          </div>
        )}

        {/* Chart */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">DAU — Daily Active Buyers Trend</h2>
            <p className="text-xs text-purple-300/70 mt-0.5">Distinct active buyers per day.</p>
          </div>

          {loading ? (
            <div className="h-80 flex items-center justify-center text-purple-300 text-sm">Loading trend…</div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center text-rose-300 text-sm">Error: {error}</div>
          ) : data.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d946ef" stopOpacity={0.65} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                  <Tooltip
                    cursor={{ stroke: '#ffffff', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.7 }}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                    labelStyle={{ color: '#e9d5ff', fontWeight: 600, marginBottom: 2 }}
                    formatter={(v, name) => [fmtInt(Number(v)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                  <Area
                    type="monotone"
                    dataKey="buyers"
                    name="Active Buyers"
                    stroke="#d946ef"
                    strokeWidth={2}
                    fill="url(#dauFill)"
                    dot={(props: any) => {
                      const { cx, cy, index, payload } = props;
                      if (cx == null || cy == null) return <g key={index} />;
                      const isPeak = summary?.peak != null && payload.buyers === summary.peak;
                      // Per-point value labels only stay legible for short windows;
                      // hide them once the series gets dense (e.g. YTD).
                      const showLabel = !isPeak && chartData.length <= 45;
                      const r = chartData.length > 70 ? 2 : 3;
                      return (
                        <g key={index}>
                          {showLabel && (
                            <text x={cx} y={cy - 10} textAnchor="middle" fill="#f5d0fe" fontSize={10} fontWeight={600}>
                              {fmtCompact(payload.buyers)}
                            </text>
                          )}
                          <circle cx={cx} cy={cy} r={r} fill="#d946ef" stroke="#fff" strokeWidth={1} />
                        </g>
                      );
                    }}
                    activeDot={{ r: 5, fill: '#d946ef', stroke: '#fff', strokeWidth: 2 }}
                  />
                  {summary?.peakDay && (
                    <ReferenceDot
                      x={fmtDay(summary.peakDay)}
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

        {/* Order Creation Trend */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">Order Creation Trend</h2>
              <p className="text-xs text-purple-300/70 mt-0.5">
                D2R intercity (third-party) orders created per {granularity}, and the distinct buyers placing them.
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

          {orderSummary && !orderLoading && !orderError && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KPICard label="Total Orders" value={fmtInt(orderSummary.totalOrders)} sub={windowSub} tone="sky" />
              <KPICard label={`Avg / ${granularity}`} value={fmtInt(orderSummary.avg)} sub={`per ${granularity}`} tone="purple" />
              <KPICard
                label={`Peak ${granularity}`}
                value={fmtInt(orderSummary.peak)}
                sub={orderSummary.peakBucket ? fmtBucket(orderSummary.peakBucket, granularity) : '—'}
                tone="emerald"
              />
              <KPICard
                label="Change vs Start"
                value={`${ordersUp ? '▲' : '▼'} ${Math.abs(orderSummary.changePct).toFixed(1)}%`}
                sub={`${fmtInt(orderSummary.first)} → ${fmtInt(orderSummary.latest)}`}
                tone={ordersUp ? 'emerald' : 'amber'}
              />
            </div>
          )}

          {orderLoading ? (
            <div className="h-80 flex items-center justify-center text-purple-300 text-sm">Loading trend…</div>
          ) : orderError ? (
            <div className="h-80 flex items-center justify-center text-rose-300 text-sm">Error: {orderError}</div>
          ) : orderData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={orderChartData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ordersBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="bucketLabel" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                    labelStyle={{ color: '#c7d2fe', fontWeight: 600, marginBottom: 2 }}
                    formatter={(v, name) => [fmtInt(Number(v)), String(name)]}
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
                    dataKey="buyers"
                    name="Distinct Buyers"
                    stroke="#f472b6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#f472b6', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5, fill: '#f472b6', stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
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
