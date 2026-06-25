'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────
interface AuthResp { requested: number; verified: number; successPct: number; sql: string }
interface SessionsResp { total: number; unauth: number; distinctBuyers: number; distinctDevices: number; unauthDevices: number; newBuyers: number; returningBuyers: number; sql: string }
interface CommerceResp {
  cart: { carts_created: number; buyers_with_cart: number; active_carts: number; buyers_active_cart: number };
  order: { draft_carts: number; draft_buyers: number; placed_orders: number; placed_buyers: number; completed_orders: number };
  sql: { cart: string; order: string };
}
interface EventsResp {
  stages: {
    homeViews: number; homeUsers: number; atcEvents: number; atcUsers: number;
    sellerViews: number; sellerUsers: number; cartViews: number; cartUsers: number;
    movEvents: number; movUsers: number; addrViewed: number; addrSaved: number;
  };
  sql: string;
}
interface DauResp { data: { day: string; buyers: number; devices: number; orders: number }[]; sql: string }

// ─── Formatting ─────────────────────────────────────────────────────────────
const fmtInt = (n: number) => n.toLocaleString('en-IN');
const fmtCompact = (n: number) => {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};
const pctv = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const RANGES = [7, 14, 30, 45, 60, 90] as const;

// ─── Small UI primitives ──────────────────────────────────────────────────
function KPICard({ label, value, sub, tone, valueClass }: { label: string; value: string; sub: string; tone: string; valueClass?: string }) {
  const tones: Record<string, string> = {
    fuchsia: 'from-fuchsia-500/20 to-fuchsia-600/5 border-fuchsia-400/30 text-fuchsia-200',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-400/30 text-purple-200',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-400/30 text-emerald-200',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-400/30 text-amber-200',
    rose: 'from-rose-500/20 to-rose-600/5 border-rose-400/30 text-rose-200',
    sky: 'from-sky-500/20 to-sky-600/5 border-sky-400/30 text-sky-200',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 bg-gradient-to-br ${tones[tone] || tones.purple}`}>
      <div className="text-sm uppercase tracking-wide font-bold opacity-95 leading-tight">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${valueClass || 'text-white'}`}>{value}</div>
      <div className="mt-0.5 text-xs opacity-70">{sub}</div>
    </div>
  );
}

const State = ({ kind, msg }: { kind: 'loading' | 'error' | 'empty'; msg: string }) => (
  <div className={`h-40 flex items-center justify-center text-sm ${kind === 'error' ? 'text-rose-300' : kind === 'empty' ? 'text-purple-300/70' : 'text-purple-300'}`}>
    {kind === 'error' ? `Error: ${msg}` : msg}
  </div>
);

function Panel({ title, subtitle, sql, children }: { title: string; subtitle?: string; sql?: string; children: React.ReactNode }) {
  const [showSql, setShowSql] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-purple-300/70 mt-0.5">{subtitle}</p>}
        </div>
        {sql && (
          <button onClick={() => setShowSql((v) => !v)} className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10 transition-colors">
            {showSql ? 'Hide SQL' : '</> SQL'}
          </button>
        )}
      </div>
      {showSql && sql && (
        <pre className="mb-4 max-h-72 overflow-auto rounded-lg bg-black/40 border border-white/10 p-3 text-[11px] leading-relaxed text-emerald-200/90 whitespace-pre">{sql}</pre>
      )}
      {children}
    </div>
  );
}

// Generic fetch hook
function useApi<T>(url: string | null, enabled: boolean) {
  const [data, setData] = useState<(T & { sql?: unknown }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !url) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(url)
      .then(async (r) => {
        const text = await r.text();
        let j: (T & { error?: string }) | null = null;
        try { j = text ? JSON.parse(text) : null; } catch { j = null; }
        if (!r.ok) throw new Error(j?.error || (r.status === 504 || r.status === 502 ? 'Took too long — try a shorter range (or add the funnel index).' : `Request failed (${r.status})`));
        if (j == null) throw new Error('Took too long — try a shorter range (or add the funnel index).');
        return j;
      })
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, enabled]);
  return { data, loading, error };
}

// Horizontal funnel stage bar with conversion-from-previous.
function FunnelStage({ label, value, max, prev, color, unit }: { label: string; value: number; max: number; prev?: number; color: string; unit: string }) {
  const widthPct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  const conv = prev != null && prev > 0 ? (value / prev) * 100 : null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-sm text-purple-100 font-medium">{label}</div>
      <div className="flex-1 h-8 rounded-lg bg-white/5 overflow-hidden">
        <div className="h-full rounded-lg flex items-center justify-end pr-2 text-[11px] font-bold text-white/95" style={{ width: `${widthPct}%`, background: color }}>
          {fmtInt(value)}
        </div>
      </div>
      <div className="w-28 shrink-0 text-right text-xs">
        {conv == null ? <span className="text-purple-300/50">{unit}</span>
          : <span className={conv >= 50 ? 'text-emerald-300 font-semibold' : conv >= 20 ? 'text-amber-300 font-semibold' : 'text-rose-300 font-semibold'}>{fmtPct(conv)} <span className="text-purple-300/50">from prev</span></span>}
      </div>
    </div>
  );
}

function ConvRow({ name, formula, value, good }: { name: string; formula: string; value: string; good?: 'up' | 'down' }) {
  return (
    <tr className="border-t border-white/5 transition-colors hover:bg-white/[0.07]">
      <td className="px-4 py-2.5 text-center text-purple-100 font-medium">{name}{good === 'up' && <span title="should increase" className="ml-1 text-fuchsia-300">↑</span>}</td>
      <td className="px-4 py-2.5 text-center text-purple-300/70 text-xs font-mono">{formula}</td>
      <td className="px-4 py-2.5 text-center text-white font-bold tabular-nums">{value}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function DropFunnelDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Default to 30D: the funnel auto-loads and is reliable at this range. 90D
  // works too but a cold load can be slow until events.event is vacuumed.
  const [days, setDays] = useState<number>(30);
  // The events.event funnel is heavy at long ranges (cold 90D can take ~45-120s).
  // Auto-load it up to 30D; beyond that require an explicit click so the page
  // never hangs on first paint. Reset the gate whenever the range changes.
  const HEAVY_AUTO_MAX = 30;
  const [loadHeavy, setLoadHeavy] = useState(false);
  useEffect(() => { setLoadHeavy(false); }, [days]);
  const eventsEnabled = authChecked && (days <= HEAVY_AUTO_MAX || loadHeavy);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const auth = useApi<AuthResp>(`/api/drop-funnel/auth?days=${days}`, authChecked);
  const sess = useApi<SessionsResp>(`/api/drop-funnel/sessions?days=${days}`, authChecked);
  const comm = useApi<CommerceResp>(`/api/drop-funnel/commerce?days=${days}`, authChecked);
  const dau = useApi<DauResp>(`/api/drop-funnel/dau?days=${Math.min(days, 60)}`, authChecked);
  // Fire the HEAVY events.event query only AFTER the light panels have loaded,
  // so its long scan doesn't contend with (and time out) the others on first paint.
  const lightReady = !auth.loading && !sess.loading && !comm.loading && !dau.loading;
  const ev = useApi<EventsResp>(`/api/drop-funnel/events?days=${days}`, eventsEnabled && lightReady);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    ['authToken', 'employeeId', 'employeeName', 'employeeEmail'].forEach((k) => localStorage.removeItem(k));
    router.replace('/login');
  };

  // Reassemble the three split responses into the shape the JSX below expects.
  const ovLoading = auth.loading || sess.loading || comm.loading;
  const ovError = auth.error || sess.error || comm.error;
  const o = (auth.data && sess.data && comm.data) ? {
    otp: auth.data,
    sessions: sess.data,
    cart: comm.data.cart,
    order: comm.data.order,
    sql: { otp: auth.data.sql, sessions: sess.data.sql, cart: comm.data.sql.cart, order: comm.data.sql.order },
  } : null;
  const st = ev.data?.stages;

  const dauStats = useMemo(() => {
    const rows = dau.data?.data || [];
    if (!rows.length) return null;
    // Use full days only (exclude the partial current day) for the average.
    const full = rows.length > 1 ? rows.slice(0, -1) : rows;
    const avgB = Math.round(full.reduce((a, b) => a + b.buyers, 0) / full.length);
    const avgO = Math.round(full.reduce((a, b) => a + b.orders, 0) / full.length);
    return { avgBuyers: avgB, avgOrders: avgO, dauToOrder: pctv(avgO, avgB) };
  }, [dau.data]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const funnelMax = st?.homeViews || 1;

  // Shown in the event-driven panels when the range is large enough that we
  // don't auto-fire the heavy events.event query.
  const heavyGate = (
    <div className="h-40 flex flex-col items-center justify-center gap-3 text-center">
      <div className="text-sm text-purple-300/70">The {days}-day funnel reads the large events table and can take ~45s on a cold load.</div>
      <button onClick={() => setLoadHeavy(true)} className="px-4 py-2 rounded-lg bg-fuchsia-500/25 border border-fuchsia-400/40 text-white text-sm font-semibold hover:bg-fuchsia-500/35 transition-colors">Load {days}D funnel →</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/badho" className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">← All dashboards</Link>
          <div className="flex items-center gap-3">
            {employeeName && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{employeeName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</div>
                <span className="text-purple-100 font-medium">{employeeName}</span>
              </div>
            )}
            <button onClick={handleLogout} disabled={isLoggingOut} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50 transition-colors">{isLoggingOut ? 'Signing out…' : 'Logout'}</button>
          </div>
        </div>

        {/* Header + range */}
        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">Buyer Funnel 🪜</h1>
            <p className="text-purple-200 text-sm mt-1">Buyer-app acquisition → engagement → order funnel · last {days} days</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${days === r ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/40' : 'text-purple-200 hover:bg-white/10'}`}>{r}D</button>
            ))}
          </div>
        </div>

        {ovError && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Overview failed: {ovError}</div>}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <KPICard label="Sessions" tone="purple" value={o ? fmtCompact(o.sessions.total) : '—'} sub={o ? `${fmtInt(o.sessions.unauth)} not logged-in` : ''} />
          <KPICard label="Distinct Buyers" tone="sky" value={o ? fmtCompact(o.sessions.distinctBuyers) : '—'} sub={o ? `${fmtCompact(o.sessions.distinctDevices)} devices` : ''} />
          <KPICard label="OTP Success" tone={o && o.otp.successPct < 60 ? 'rose' : 'emerald'} value={o ? fmtPct(o.otp.successPct) : '—'} sub={o ? `${fmtCompact(o.otp.verified)} / ${fmtCompact(o.otp.requested)}` : ''} />
          <KPICard label="New Buyers" tone="fuchsia" value={o ? fmtPct(pctv(o.sessions.newBuyers, o.sessions.distinctBuyers)) : '—'} sub={o ? `${fmtCompact(o.sessions.newBuyers)} new · ${fmtCompact(o.sessions.returningBuyers)} returning` : ''} />
          <KPICard label="Buyers w/ Cart" tone="amber" value={o ? fmtCompact(o.cart.buyers_active_cart) : '—'} sub={o ? `${fmtPct(pctv(o.cart.buyers_active_cart, o.sessions.distinctBuyers))} of buyers` : ''} />
          <KPICard label="Orders Placed" tone="emerald" value={o ? fmtCompact(o.order.placed_orders) : '—'} sub={o ? `${fmtCompact(o.order.completed_orders)} completed` : ''} />
        </div>

        {/* Main funnel */}
        <div className="mb-6">
          <Panel title="Engagement Funnel" subtitle="Event volume per stage (bar) with conversion from the previous stage. Home → ATC is the key lift target." sql={ev.data?.sql}>
            {!eventsEnabled ? heavyGate : ev.loading ? <State kind="loading" msg="Loading funnel…" /> : ev.error ? <State kind="error" msg={ev.error} /> : st ? (
              <div className="space-y-2.5">
                <FunnelStage label="Home page views" value={st.homeViews} max={funnelMax} color="#a78bfa" unit="top" />
                <FunnelStage label="Add to Cart" value={st.atcEvents} max={funnelMax} prev={st.homeViews} color="#d946ef" unit="" />
                <FunnelStage label="Cart viewed" value={st.cartViews} max={funnelMax} prev={st.atcEvents} color="#ec4899" unit="" />
                <FunnelStage label="Cart → Payment (MOV)" value={st.movEvents} max={funnelMax} prev={st.cartViews} color="#f472b6" unit="" />
                <FunnelStage label="Address saved" value={st.addrSaved} max={funnelMax} prev={st.movEvents} color="#fb923c" unit="" />
                <FunnelStage label="Orders placed" value={o?.order.placed_orders || 0} max={funnelMax} prev={st.addrSaved} color="#34d399" unit="" />
                <div className="pt-2 mt-1 border-t border-white/10 text-xs text-purple-300/70">
                  Seller page views: <span className="text-white font-semibold">{fmtInt(st.sellerViews)}</span> across <span className="text-white font-semibold">{fmtInt(st.sellerUsers)}</span> unique users · counts are events; conversions are stage/stage.
                </div>
              </div>
            ) : <State kind="empty" msg="No data" />}
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Auth funnel */}
          <Panel title="Authentication" subtitle="Not authenticated → Authenticated (OTP)" sql={o?.sql.otp}>
            {ovLoading ? <State kind="loading" msg="Loading…" /> : o ? (
              <div className="space-y-2.5">
                <FunnelStage label="OTP requested" value={o.otp.requested} max={o.otp.requested || 1} color="#60a5fa" unit="start" />
                <FunnelStage label="OTP verified" value={o.otp.verified} max={o.otp.requested || 1} prev={o.otp.requested} color="#34d399" unit="" />
                <div className="pt-2 mt-1 border-t border-white/10 text-sm">
                  <span className="text-purple-300/70">OTP success rate: </span>
                  <span className={`font-bold ${o.otp.successPct < 60 ? 'text-rose-300' : 'text-emerald-300'}`}>{fmtPct(o.otp.successPct)}</span>
                  {o.otp.successPct < 60 && <span className="text-rose-300/80 text-xs ml-2">↓ biggest top-of-funnel leak</span>}
                </div>
              </div>
            ) : <State kind="empty" msg="No data" />}
          </Panel>

          {/* Conversions table */}
          <Panel title="Conversion Rates" subtitle={`Last ${days} days`} sql={ev.data?.sql}>
            {!eventsEnabled ? heavyGate : (ovLoading || ev.loading) ? <State kind="loading" msg="Loading…" /> : ev.error ? <State kind="error" msg={ev.error} /> : (o && st) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-violet-300/25 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 text-[13px] font-bold uppercase tracking-wider text-white">
                      <th className="px-4 py-3 text-center">Metric</th>
                      <th className="px-4 py-3 text-center">Formula</th>
                      <th className="px-4 py-3 text-center">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ConvRow name="Home → ATC" good="up" formula="ATC / home views" value={fmtPct(pctv(st.atcEvents, st.homeViews))} />
                    <ConvRow name="ATC Multiplier" formula="ATC events / ATC users" value={`${(st.atcUsers ? st.atcEvents / st.atcUsers : 0).toFixed(1)}×`} />
                    <ConvRow name="MOV Conversion" formula="cart→pay / cart views" value={fmtPct(pctv(st.movEvents, st.cartViews))} />
                    <ConvRow name="Address Conversion" formula="saved / viewed" value={fmtPct(pctv(st.addrSaved, st.addrViewed))} />
                    <ConvRow name="Cart Conversion" formula="placed / draft carts" value={fmtPct(pctv(o.order.placed_orders, o.order.draft_carts))} />
                    <ConvRow name="DAU → Orders" formula="avg orders/day ÷ avg DAU" value={dauStats ? fmtPct(dauStats.dauToOrder) : '—'} />
                  </tbody>
                </table>
              </div>
            ) : <State kind="empty" msg="No data" />}
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* New vs returning + carts/orders */}
          <Panel title="Users & Carts" subtitle={`Buyer app · last ${days} days`} sql={o ? o.sql.cart + '\n\n-- orders --\n' + o.sql.order : undefined}>
            {ovLoading ? <State kind="loading" msg="Loading…" /> : o ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-violet-300/25 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 text-[13px] font-bold uppercase tracking-wider text-white">
                      <th className="px-4 py-3 text-center">Metric</th>
                      <th className="px-4 py-3 text-center">Count</th>
                      <th className="px-4 py-3 text-center">Share</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[
                      { n: 'New buyers', c: o.sessions.newBuyers, d: o.sessions.distinctBuyers },
                      { n: 'Returning buyers', c: o.sessions.returningBuyers, d: o.sessions.distinctBuyers },
                      { n: 'Buyers with active cart', c: o.cart.buyers_active_cart, d: o.sessions.distinctBuyers },
                      { n: 'Carts created', c: o.cart.carts_created, d: 0 },
                      { n: 'Draft carts (PO)', c: o.order.draft_carts, d: 0 },
                      { n: 'Orders placed', c: o.order.placed_orders, d: o.order.draft_carts },
                      { n: 'Orders completed', c: o.order.completed_orders, d: o.order.draft_carts },
                    ].map((r, i) => (
                      <tr key={r.n} className={`border-t border-white/5 transition-colors hover:bg-white/[0.07] ${i % 2 === 1 ? 'bg-white/[0.025]' : ''}`}>
                        <td className="px-4 py-2.5 text-center text-purple-100">{r.n}</td>
                        <td className="px-4 py-2.5 text-center text-white font-semibold">{fmtInt(r.c)}</td>
                        <td className="px-4 py-2.5 text-center text-purple-300/70">{r.d > 0 ? fmtPct(pctv(r.c, r.d)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <State kind="empty" msg="No data" />}
          </Panel>

          {/* DAU chart */}
          <Panel title="DAU → Orders" subtitle={dauStats ? `Avg ${fmtInt(dauStats.avgBuyers)} buyers/day · ${fmtInt(dauStats.avgOrders)} orders/day · ${fmtPct(dauStats.dauToOrder)} convert` : 'Daily active buyers vs orders'} sql={dau.data?.sql}>
            {dau.loading ? <State kind="loading" msg="Loading…" /> : dau.error ? <State kind="error" msg={dau.error} /> : (dau.data?.data?.length) ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dau.data.data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="day" tick={{ fill: '#c4b5fd', fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={20} />
                  <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 10 }} tickFormatter={fmtCompact} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: '#86efac', fontSize: 10 }} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={{ background: '#1e1b4b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 12 }} formatter={(v) => fmtInt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="buyers" name="DAU (buyers)" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="orders" name="Orders" stroke="#34d399" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <State kind="empty" msg="No data" />}
          </Panel>
        </div>

        <div className="text-center text-purple-300/40 text-[11px] mb-4">
          Buyer app · appId 2391550b · test traffic excluded · numbers cached 30 min. Heavy event metrics use a covering index on events.event — see /api/drop-funnel/events for the DDL.
        </div>
      </div>

      <style jsx>{`.animation-delay-2000 { animation-delay: 2s; }`}</style>
    </div>
  );
}
