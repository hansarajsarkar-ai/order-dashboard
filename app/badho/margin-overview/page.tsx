'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  MARGIN OVERVIEW DASHBOARD
 * ─────────────────────────────────────────────────────────────────────
 *  Daily P&L for D2R brand sellers on third-party INTERCITY orders.
 *    margin  = po.amount * (seller badhoFees %)
 *    opCost  = payment-pref discount + offer discount + delivery (seller-borne) + rewards
 *    P&L     = margin − opCost
 *  Backed by /api/margin-overview (see route.ts for the full SQL).
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine,
} from 'recharts';

interface DayRow {
  date: string;
  totalOrders: number;
  totalPoAmount: number;
  totalMargin: number;
  totalOperationalCost: number;
  profitAndLossRs: number;
  status: string;
  pnlPercentOfGtv: number | null;
}

interface ApiResp {
  days: number;
  data: DayRow[];
  totals: {
    totalOrders: number;
    totalPoAmount: number;
    totalMargin: number;
    totalOperationalCost: number;
    profitAndLossRs: number;
    pnlPercentOfGtv: number | null;
    profitDays: number;
    lossDays: number;
  };
  timestamp: string;
  error?: string;
}

const DAY_OPTIONS = [7, 14, 30, 60, 90];

function fmtINR(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function MarginOverviewDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [tab, setTab] = useState<'overview' | 'daily'>('overview');
  const [days, setDays] = useState(30);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/margin-overview?days=${days}`, { cache: 'no-store' });
      const json: ApiResp = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setResp(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setResp(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (authChecked) fetchData();
  }, [authChecked, fetchData]);

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

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const totals = resp?.totals;
  // Chart wants oldest → newest (API returns newest first).
  const chartData = resp ? [...resp.data].reverse().map((d) => ({ ...d, label: fmtDay(d.date) })) : [];

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
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Margin Overview
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            Daily P&amp;L — D2R brand sellers · third-party INTERCITY orders · margin vs operational cost
          </p>
        </div>

        {/* Controls: tabs + range */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl">
            {(['overview', 'daily'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150 ${
                  tab === t
                    ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.5)]'
                    : 'text-purple-200 hover:bg-fuchsia-500 hover:text-white hover:shadow-[0_0_14px_rgba(217,70,239,0.5)]'
                }`}
              >
                {t === 'overview' ? 'Overview' : 'Daily Breakdown'}
              </button>
            ))}
          </div>

          <div className="inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  days === d
                    ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/40'
                    : 'text-purple-200 hover:bg-white/10'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">
            Failed to load data: {error}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-12 text-center text-purple-200 text-sm">
            Loading margin data…
          </div>
        )}

        {!loading && resp && totals && (
          <>
            {/* KPI cards (always visible) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <KpiCard label="Total Orders" value={totals.totalOrders.toLocaleString('en-IN')} accent="purple" />
              <KpiCard label="Total GTV" value={fmtINR(totals.totalPoAmount)} sub={fmtFull(totals.totalPoAmount)} accent="indigo" />
              <KpiCard label="Total Margin" value={fmtINR(totals.totalMargin)} sub={fmtFull(totals.totalMargin)} accent="emerald" />
              <KpiCard label="Operational Cost" value={fmtINR(totals.totalOperationalCost)} sub={fmtFull(totals.totalOperationalCost)} accent="amber" />
              <KpiCard
                label="Net P&L"
                value={fmtINR(totals.profitAndLossRs)}
                sub={totals.profitAndLossRs >= 0 ? 'Profit' : 'Loss'}
                accent={totals.profitAndLossRs >= 0 ? 'emerald' : 'rose'}
              />
              <KpiCard
                label="P&L % of GTV"
                value={totals.pnlPercentOfGtv === null ? '—' : `${totals.pnlPercentOfGtv}%`}
                sub={`${totals.profitDays} profit · ${totals.lossDays} loss days`}
                accent={(totals.pnlPercentOfGtv ?? 0) >= 0 ? 'emerald' : 'rose'}
              />
            </div>

            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Margin vs OpCost vs P&L chart */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                  <div className="mb-3">
                    <div className="text-base font-semibold text-white">Margin vs Operational Cost &amp; Net P&amp;L</div>
                    <div className="text-xs text-purple-200/70 mt-0.5">Bars: daily margin &amp; op-cost (₹) · Line: net P&amp;L (₹)</div>
                  </div>
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => fmtINR(v)} width={60} />
                      <Tooltip
                        contentStyle={{ background: '#1e1b4b', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 12, color: '#fff' }}
                        formatter={(v: number, name: string) => [fmtFull(v), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#c4b5fd' }} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                      <Bar dataKey="totalMargin" name="Margin" fill="#34d399" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="totalOperationalCost" name="Op Cost" fill="#fbbf24" radius={[3, 3, 0, 0]} barSize={14} />
                      <Line type="monotone" dataKey="profitAndLossRs" name="Net P&L" stroke="#f0abfc" strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily P&L bars (green/red) */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                  <div className="mb-3">
                    <div className="text-base font-semibold text-white">Daily Net P&amp;L</div>
                    <div className="text-xs text-purple-200/70 mt-0.5">Green = profit day · Red = loss day</div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => fmtINR(v)} width={60} />
                      <Tooltip
                        contentStyle={{ background: '#1e1b4b', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 12, color: '#fff' }}
                        formatter={(v: number) => [fmtFull(v), 'Net P&L']}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                      <Bar dataKey="profitAndLossRs" name="Net P&L" radius={[3, 3, 0, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.profitAndLossRs >= 0 ? '#34d399' : '#fb7185'} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {tab === 'daily' && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 text-purple-200 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 text-left font-semibold">Date</th>
                        <th className="px-4 py-3 text-right font-semibold">Orders</th>
                        <th className="px-4 py-3 text-right font-semibold">GTV</th>
                        <th className="px-4 py-3 text-right font-semibold">Margin</th>
                        <th className="px-4 py-3 text-right font-semibold">Op Cost</th>
                        <th className="px-4 py-3 text-right font-semibold">Net P&amp;L</th>
                        <th className="px-4 py-3 text-right font-semibold">P&amp;L % GTV</th>
                        <th className="px-4 py-3 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resp.data.map((d) => (
                        <tr key={d.date} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2.5 text-purple-100 font-medium whitespace-nowrap">{fmtDay(d.date)}</td>
                          <td className="px-4 py-2.5 text-right text-purple-100 tabular-nums">{d.totalOrders.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right text-purple-100 tabular-nums">{fmtFull(d.totalPoAmount)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums">{fmtFull(d.totalMargin)}</td>
                          <td className="px-4 py-2.5 text-right text-amber-300 tabular-nums">{fmtFull(d.totalOperationalCost)}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${d.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {fmtFull(d.profitAndLossRs)}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${(d.pnlPercentOfGtv ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {d.pnlPercentOfGtv === null ? '—' : `${d.pnlPercentOfGtv}%`}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                d.status === 'Profit'
                                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                  : d.status === 'Loss'
                                  ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                                  : 'bg-slate-500/20 text-slate-200 border border-slate-400/30'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {resp.data.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-purple-300/70">No orders in this window.</td>
                        </tr>
                      )}
                    </tbody>
                    {resp.data.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-fuchsia-400/30 bg-white/5 font-semibold">
                          <td className="px-4 py-3 text-purple-100">Total</td>
                          <td className="px-4 py-3 text-right text-purple-100 tabular-nums">{totals.totalOrders.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right text-purple-100 tabular-nums">{fmtFull(totals.totalPoAmount)}</td>
                          <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{fmtFull(totals.totalMargin)}</td>
                          <td className="px-4 py-3 text-right text-amber-300 tabular-nums">{fmtFull(totals.totalOperationalCost)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${totals.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {fmtFull(totals.profitAndLossRs)}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums ${(totals.pnlPercentOfGtv ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {totals.pnlPercentOfGtv === null ? '—' : `${totals.pnlPercentOfGtv}%`}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 text-right text-purple-300/40 text-[11px]">
              Updated {new Date(resp.timestamp).toLocaleString('en-IN')} · lookback {resp.days}d
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: 'purple' | 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const ring: Record<string, string> = {
    purple: 'from-purple-500/20 to-fuchsia-500/10 border-purple-400/20',
    indigo: 'from-indigo-500/20 to-blue-500/10 border-indigo-400/20',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-400/20',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-400/20',
    rose: 'from-rose-500/20 to-red-500/10 border-rose-400/20',
  };
  return (
    <div className={`bg-gradient-to-br ${ring[accent]} backdrop-blur-xl border rounded-2xl p-4`}>
      <div className="text-[11px] uppercase tracking-wide text-purple-200/70 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-purple-200/60 mt-0.5">{sub}</div>}
    </div>
  );
}
