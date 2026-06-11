'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface TrendRow {
  month: string;
  month_date: string;
  qualified_buyers: string;
}

interface NewVsOldRow {
  month: string;
  month_date: string;
  new_qualified: string;
  old_qualified: string;
}

interface SchemeTableRow {
  month: string;
  month_date: string;
  delivered_buyers: string;
  qualified_buyers: string;
  level1: string;
  level2: string;
  level3: string;
}

interface GiftRow {
  gift_name: string;
  buyer_count: string;
}

type Tab = 'overview' | 'alerts';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string) => Number(n).toLocaleString('en-IN');

const GIFT_ICON: Record<string, string> = {
  'Speaker (Worth 1000)': '🔊',
  'Mini table fan (Worth 500)': '🌀',
  'Vastu tortoise (Worth 300)': '🐢',
};

const GIFT_LEVEL: Record<string, string> = {
  'Speaker (Worth 1000)': 'Level 3  ≥ ₹10,000',
  'Mini table fan (Worth 500)': 'Level 2  ₹5,000–₹9,999',
  'Vastu tortoise (Worth 300)': 'Level 1  ₹3,000–₹4,999',
};

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-xl text-xs">
      <div className="font-semibold text-purple-200 mb-2">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-purple-300">{p.name}:</span>
          <span className="text-white font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QpsSchemePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [newVsOldData, setNewVsOldData] = useState<NewVsOldRow[]>([]);
  const [schemeTableData, setSchemeTableData] = useState<SchemeTableRow[]>([]);
  const [giftData, setGiftData] = useState<GiftRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/qps-trend').then((r) => r.json()),
      fetch('/api/qps-new-vs-old').then((r) => r.json()),
      fetch('/api/qps-scheme-table').then((r) => r.json()),
      fetch('/api/qps-gifts').then((r) => r.json()),
    ])
      .then(([trend, nvo, scheme, gifts]) => {
        if (trend.error) throw new Error(trend.error);
        setTrendData(trend.data ?? []);
        setNewVsOldData(nvo.data ?? []);
        setSchemeTableData(scheme.data ?? []);
        setGiftData(gifts.data ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const trendChart = trendData.map((r) => ({
    month: r.month,
    'Qualified Buyers': Number(r.qualified_buyers),
  }));

  const newVsOldChart = [...newVsOldData]
    .sort((a, b) => a.month_date.localeCompare(b.month_date))
    .map((r) => ({
      month: r.month,
      'New Buyers': Number(r.new_qualified),
      'Returning Buyers': Number(r.old_qualified),
    }));

  const schemeRows = [...schemeTableData].sort((a, b) =>
    b.month_date.localeCompare(a.month_date)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/badho"
            className="text-purple-300 hover:text-white text-sm transition-colors"
          >
            ← Dashboards
          </Link>
          <span className="text-white/20">/</span>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            QPS Dashboard
          </h1>
          <span className="ml-auto text-xs text-purple-300/60">Quantity Purchase Scheme · D2R Brand Sellers</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          {(['overview', 'alerts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${
                tab === t
                  ? 'bg-fuchsia-600 text-white shadow-[0_0_20px_rgba(217,70,239,0.4)]'
                  : 'text-purple-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-purple-300 text-sm animate-pulse">Loading QPS data…</div>
          </div>
        )}

        {/* ── OVERVIEW TAB ───────────────────────────────────────────────── */}
        {!loading && tab === 'overview' && (
          <div className="space-y-6">
            {/* Row 1: two charts side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend chart */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-white">Monthly Qualified Buyers</div>
                  <div className="text-xs text-purple-300/70 mt-0.5">Buyers who spent ≥ ₹3,000 in the month · year-to-date</div>
                </div>
                {trendChart.length === 0 ? (
                  <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendChart} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="Qualified Buyers"
                        stroke="#e879f9"
                        strokeWidth={2.5}
                        dot={{ fill: '#e879f9', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* New vs Old stacked bar */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-white">New vs Returning Qualified Buyers</div>
                  <div className="text-xs text-purple-300/70 mt-0.5">New = first-ever qualifying month · year-to-date</div>
                </div>
                {newVsOldChart.length === 0 ? (
                  <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={newVsOldChart} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#c4b5fd' }} />
                      <Bar dataKey="New Buyers" stackId="a" fill="#a855f7" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="Returning Buyers" stackId="a" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Row 2: Scheme table */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 overflow-x-auto">
              <div className="mb-4">
                <div className="text-sm font-semibold text-white">Monthly Scheme Breakdown</div>
                <div className="text-xs text-purple-300/70 mt-0.5">
                  Level 1 ≥ ₹3k · Level 2 ≥ ₹5k · Level 3 ≥ ₹10k · year-to-date
                </div>
              </div>
              {schemeRows.length === 0 ? (
                <div className="text-purple-300/60 text-sm text-center py-8">No data</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-purple-300 text-xs border-b border-white/10">
                      <th className="py-2 pr-4 font-medium">Month</th>
                      <th className="py-2 pr-4 font-medium text-right">Delivered Buyers</th>
                      <th className="py-2 pr-4 font-medium text-right">Qualified (≥₹3k)</th>
                      <th className="py-2 pr-4 font-medium text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                          L1 Tortoise
                        </span>
                      </th>
                      <th className="py-2 pr-4 font-medium text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                          L2 Fan
                        </span>
                      </th>
                      <th className="py-2 font-medium text-right">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-fuchsia-400 inline-block" />
                          L3 Speaker
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemeRows.map((row, i) => {
                      const total = Number(row.qualified_buyers) || 0;
                      const l1 = Number(row.level1) || 0;
                      const l2 = Number(row.level2) || 0;
                      const l3 = Number(row.level3) || 0;
                      const convPct = Number(row.delivered_buyers)
                        ? ((total / Number(row.delivered_buyers)) * 100).toFixed(1)
                        : '—';
                      return (
                        <tr
                          key={row.month_date}
                          className={`border-b border-white/5 transition-colors hover:bg-white/5 ${i === 0 ? 'bg-fuchsia-500/5' : ''}`}
                        >
                          <td className="py-2.5 pr-4 text-white font-medium">{row.month}</td>
                          <td className="py-2.5 pr-4 text-right text-purple-200">{fmt(row.delivered_buyers)}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <span className="text-white font-semibold">{fmt(total)}</span>
                            <span className="text-purple-400 text-xs ml-1">({convPct}%)</span>
                          </td>
                          <td className="py-2.5 pr-4 text-right">
                            {l1 > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 text-xs font-semibold">
                                {fmt(l1)}
                              </span>
                            ) : (
                              <span className="text-purple-400/50">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-right">
                            {l2 > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-200 text-xs font-semibold">
                                {fmt(l2)}
                              </span>
                            ) : (
                              <span className="text-purple-400/50">—</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {l3 > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-200 text-xs font-semibold">
                                {fmt(l3)}
                              </span>
                            ) : (
                              <span className="text-purple-400/50">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── ALERTS TAB ──────────────────────────────────────────────────── */}
        {!loading && tab === 'alerts' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="mb-6">
                <div className="text-sm font-semibold text-white">Current Month — Gift Winners</div>
                <div className="text-xs text-purple-300/70 mt-0.5">
                  Buyers who have already qualified for a gift this month based on DELIVERED / COMPLETED orders
                </div>
              </div>
              {giftData.length === 0 ? (
                <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {giftData.map((g) => {
                    const count = Number(g.buyer_count);
                    return (
                      <div
                        key={g.gift_name}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 flex flex-col gap-3"
                      >
                        <div className="text-4xl">{GIFT_ICON[g.gift_name] ?? '🎁'}</div>
                        <div>
                          <div className="text-base font-bold text-white">{g.gift_name}</div>
                          <div className="text-xs text-purple-300/70 mt-0.5">{GIFT_LEVEL[g.gift_name]}</div>
                        </div>
                        <div className="mt-auto">
                          <div className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                            {fmt(count)}
                          </div>
                          <div className="text-xs text-purple-300/70">
                            {count === 1 ? 'buyer' : 'buyers'} qualified
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Summary row */}
            {giftData.length > 0 && (
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-4 flex items-center gap-4 flex-wrap">
                <span className="text-2xl">🏆</span>
                <div>
                  <div className="text-white font-semibold text-sm">
                    Total qualified this month:{' '}
                    <span className="text-fuchsia-300 text-lg font-bold">
                      {fmt(giftData.reduce((s, g) => s + Number(g.buyer_count), 0))}
                    </span>{' '}
                    buyers
                  </div>
                  <div className="text-xs text-purple-300/70 mt-0.5">
                    Each buyer counted once in their highest qualifying tier
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
