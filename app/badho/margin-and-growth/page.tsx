'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot, LabelList,
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

interface FunnelRow {
  bucket: string;
  dau: number;
  cartBuyers: number;
  orderBuyers: number;
  orders: number;
}

interface FunnelTotals {
  dau: number;
  cartBuyers: number;
  orderBuyers: number;
  orders: number;
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

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmtPct = (n: number, d: number) => `${pct(n, d).toFixed(1)}%`;

// Tailwind text colour for a conversion rate against rough engagement benchmarks.
const pctTone = (value: number, good: number, ok: number) =>
  value >= good ? 'text-emerald-300' : value >= ok ? 'text-amber-300' : 'text-rose-300';

const currentMonthStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
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

  // DAU → Cart → Order conversion table (own day/week/month toggle + month picker)
  const [tableGran, setTableGran] = useState<Granularity>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentMonthStr());
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [funnelTotals, setFunnelTotals] = useState<FunnelTotals | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelError, setFunnelError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    setFunnelLoading(true);
    setFunnelError(null);
    const monthQ = tableGran === 'day' ? `&month=${selectedMonth}` : '';
    fetch(`/api/margin-and-growth/funnel?granularity=${tableGran}${monthQ}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load');
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setFunnel(json.data || []);
        setFunnelTotals(json.totals || null);
      })
      .catch((e) => {
        if (!cancelled) setFunnelError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setFunnelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, tableGran, selectedMonth]);

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

  // Months from Jan of the current year through the current month (latest first),
  // for the day-view month picker.
  const monthOptions = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const opts: { value: string; label: string }[] = [];
    for (let m = now.getMonth(); m >= 0; m--) {
      const value = `${year}-${String(m + 1).padStart(2, '0')}`;
      const label = new Date(year, m, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);
  // Inline value labels stay readable only up to a point; past that they
  // overlap and add noise, so hide labels (and then dots) on dense windows.
  const showLabels = mergedData.length <= 31;
  const showDots = mergedData.length <= 70;

  // Renders the value above/below each line point (and the point marker),
  // so users can read every value without hovering.
  const lineDot = (key: 'activeBuyers' | 'orderBuyers', color: string, dy: number) =>
    (props: any) => {
      const { cx, cy, index, payload } = props;
      if (cx == null || cy == null) return <g key={index} />;
      const val = payload?.[key];
      // The active-buyers peak already has its own green callout — skip the
      // duplicate point label there to avoid overlap.
      const isPeak = key === 'activeBuyers' && summary?.peak != null && val === summary.peak;
      return (
        <g key={index}>
          {showLabels && val != null && !isPeak && (
            <text x={cx} y={cy + dy} textAnchor="middle" fill={color} fontSize={9} fontWeight={600}>
              {fmtCompact(val)}
            </text>
          )}
          {showDots && <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="#fff" strokeWidth={1} />}
        </g>
      );
    };

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
                  >
                    {showLabels && (
                      <LabelList
                        dataKey="orders"
                        position="top"
                        offset={6}
                        fill="#bae6fd"
                        fontSize={9}
                        fontWeight={600}
                        formatter={(v: any) => (v == null ? '' : fmtCompact(Number(v)))}
                      />
                    )}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="activeBuyers"
                    name="Active Buyers"
                    stroke="#d946ef"
                    strokeWidth={2}
                    connectNulls
                    dot={lineDot('activeBuyers', '#f0abfc', -9)}
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
                    dot={lineDot('orderBuyers', '#fbcfe8', 16)}
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

        {/* DAU → Cart → Order conversion table */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">DAU → Cart → Order Funnel</h2>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Active buyers, how many created a cart, how many placed an order, and the conversion at each step
                {tableGran === 'day' ? ', day-wise for the selected month.' : `, per ${tableGran}.`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Month picker (day view only) */}
              {tableGran === 'day' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 text-purple-100 focus:outline-none focus:border-fuchsia-400/50"
                >
                  {monthOptions.map((m) => (
                    <option key={m.value} value={m.value} className="bg-slate-900">
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
              {/* Granularity toggle */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                {GRANULARITIES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setTableGran(g.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      tableGran === g.value
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.45)]'
                        : 'text-purple-200 hover:bg-white/10'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {funnelLoading ? (
            <div className="h-60 flex items-center justify-center text-purple-300 text-sm">Loading funnel…</div>
          ) : funnelError ? (
            <div className="h-60 flex items-center justify-center text-rose-300 text-sm">Error: {funnelError}</div>
          ) : funnel.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur text-purple-200">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">{tableGran === 'day' ? 'Date' : tableGran === 'week' ? 'Week of' : 'Month'}</th>
                    <th className="px-4 py-3 font-semibold text-right">DAU</th>
                    <th className="px-4 py-3 font-semibold text-right">Carts Created</th>
                    <th className="px-4 py-3 font-semibold text-right">Cart % of DAU</th>
                    <th className="px-4 py-3 font-semibold text-right">Orders Placed</th>
                    <th className="px-4 py-3 font-semibold text-right">Cart → Order %</th>
                    <th className="px-4 py-3 font-semibold text-right">Order % of DAU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {funnel.map((r) => {
                    const cartRate = pct(r.cartBuyers, r.dau);
                    const cartToOrder = pct(r.orderBuyers, r.cartBuyers);
                    const orderRate = pct(r.orderBuyers, r.dau);
                    return (
                      <tr key={r.bucket} className="text-purple-100 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{fmtBucket(r.bucket, tableGran)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.dau)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.cartBuyers)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pctTone(cartRate, 20, 12)}`}>{cartRate.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.orderBuyers)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pctTone(cartToOrder, 60, 40)}`}>{cartToOrder.toFixed(1)}%</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pctTone(orderRate, 12, 7)}`}>{orderRate.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                {funnelTotals && (
                  <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtInt(funnelTotals.dau)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtInt(funnelTotals.cartBuyers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(funnelTotals.cartBuyers, funnelTotals.dau)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtInt(funnelTotals.orderBuyers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(funnelTotals.orderBuyers, funnelTotals.cartBuyers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(funnelTotals.orderBuyers, funnelTotals.dau)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p className="text-[11px] text-purple-300/50 mt-3">
            DAU = distinct buyer-app active buyers. A “cart” is any purchase order created; “order placed” excludes
            DRAFT carts. Carts/orders are platform-wide with test buyers excluded. Totals sum each bucket (a buyer
            active on multiple days is counted per day).
          </p>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
