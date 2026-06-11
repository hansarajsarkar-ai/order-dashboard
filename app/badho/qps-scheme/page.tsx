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
  LabelList,
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
  level4: string;
  level5: string;
}

interface GiftRow {
  gift_name: string;
  buyer_count: string;
}

interface DetailRow {
  buyer_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_business_name: string;
  buyer_address_line1: string;
  buyer_address_line2: string;
  buyer_landmark: string;
  monthly: string;
  qualified_amount: string;
  pct_level1: string;
  pct_level2: string;
  pct_level3: string;
  pct_level4: string;
  pct_level5: string;
  reward_level: string;
  gift_won: string;
  placed_amount: string;
  delivered_amount: string;
  rto_amount: string;
  pct_delivered: string;
  due_amount: string;
}

type Tab = 'overview' | 'alerts' | 'detail';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string) => Number(n).toLocaleString('en-IN');
const fmtAmt = (n: number | string) => {
  const v = Number(n);
  if (!v) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

function getAvailableMonths(): { value: string; label: string }[] {
  const start = new Date(2026, 2, 1); // March 2026 — scheme start
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const months: { value: string; label: string }[] = [];
  let d = new Date(start);
  while (d <= end) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    months.push({ value: iso, label });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return months.reverse(); // newest first in dropdown
}

const AVAILABLE_MONTHS = getAvailableMonths();

const GIFT_ICON: Record<string, string> = {
  'Airfryer/Mixer (Worth 3000)': '🍳',
  'CCTV/Iron (Worth 2000)': '📷',
  'Speaker (Worth 1000)': '🔊',
  'Mini table fan (Worth 500)': '🌀',
  'Vastu tortoise (Worth 300)': '🐢',
};

const GIFT_LEVEL: Record<string, string> = {
  'Airfryer/Mixer (Worth 3000)': 'Level 5  ≥ ₹30,000',
  'CCTV/Iron (Worth 2000)':      'Level 4  ₹20,000–₹29,999',
  'Speaker (Worth 1000)':        'Level 3  ₹10,000–₹19,999',
  'Mini table fan (Worth 500)':  'Level 2  ₹5,000–₹9,999',
  'Vastu tortoise (Worth 300)':  'Level 1  ₹3,000–₹4,999',
};

function giftCellClass(gift: string) {
  if (gift === 'No Gift') return 'bg-red-500/15 text-red-300';
  if (gift.includes('Vastu')) return 'bg-amber-500/20 text-amber-200';
  if (gift.includes('fan')) return 'bg-sky-500/20 text-sky-200';
  if (gift.includes('Speaker')) return 'bg-fuchsia-500/20 text-fuchsia-200';
  if (gift.includes('CCTV')) return 'bg-rose-500/20 text-rose-200';
  if (gift.includes('Airfryer')) return 'bg-orange-500/20 text-orange-200';
  return 'bg-white/5 text-purple-200';
}

function rewardLevelClass(level: string) {
  if (level === 'Not Qualified') return 'text-red-300/80';
  if (level === 'Level 1') return 'text-amber-300 font-semibold';
  if (level === 'Level 2') return 'text-sky-300 font-semibold';
  if (level === 'Level 3') return 'text-fuchsia-300 font-semibold';
  if (level === 'Level 4') return 'text-rose-300 font-semibold';
  if (level === 'Level 5') return 'text-orange-300 font-semibold';
  return 'text-purple-200';
}

function pctBarClass(pct: string) {
  const n = parseFloat(pct);
  if (n >= 100) return 'bg-emerald-500/20 text-emerald-200';
  if (n >= 80) return 'bg-yellow-500/15 text-yellow-200';
  if (n >= 50) return 'bg-amber-500/10 text-amber-300/80';
  return 'text-purple-300/60';
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
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
      {payload.length > 1 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center gap-2">
          <span className="text-purple-300">Total:</span>
          <span className="text-white font-bold">{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QpsSchemePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // Overview / Alerts data
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [newVsOldData, setNewVsOldData] = useState<NewVsOldRow[]>([]);
  const [schemeTableData, setSchemeTableData] = useState<SchemeTableRow[]>([]);
  const [giftData, setGiftData] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendExpanded, setTrendExpanded] = useState(false);

  // Detail tab state
  const defaultMonth = AVAILABLE_MONTHS[0]?.value ?? '2026-06-01';
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [date1, setDate1] = useState('');
  const [date2, setDate2] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailMonthLabel, setDetailMonthLabel] = useState('');
  const [isMayPlus, setIsMayPlus] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
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

  function loadDetail() {
    setDetailLoading(true);
    setDetailError(null);
    const qs = new URLSearchParams({ month: selectedMonth });
    if (date1) qs.set('date1', date1);
    if (date2) qs.set('date2', date2);
    if (phoneFilter) qs.set('phone', phoneFilter);
    fetch(`/api/qps-buyer-detail?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDetailRows(d.data ?? []);
        setDetailMonthLabel(d.month_label ?? '');
        setIsMayPlus(d.is_may_plus ?? false);
      })
      .catch((e) => setDetailError(e.message))
      .finally(() => setDetailLoading(false));
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const trendChart = [...trendData]
    .sort((a, b) => new Date(a.month_date).getTime() - new Date(b.month_date).getTime())
    .map((r) => ({ month: r.month, 'Qualified Buyers': Number(r.qualified_buyers) }));

  const newVsOldChart = [...newVsOldData]
    .sort((a, b) => new Date(a.month_date).getTime() - new Date(b.month_date).getTime())
    .map((r) => ({
      month: r.month,
      'New Buyers': Number(r.new_qualified),
      'Returning Buyers': Number(r.old_qualified),
    }));

  const schemeRows = [...schemeTableData].sort(
    (a, b) => new Date(a.month_date).getTime() - new Date(b.month_date).getTime()
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'detail', label: 'Qualified Detail' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <Link href="/badho" className="text-purple-300 hover:text-white text-sm transition-colors">
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
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-fuchsia-600 text-white shadow-[0_0_20px_rgba(217,70,239,0.4)]'
                  : 'text-purple-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading && tab !== 'detail' && (
          <div className="flex items-center justify-center py-24">
            <div className="text-purple-300 text-sm animate-pulse">Loading QPS data…</div>
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {!loading && tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Monthly Qualified Buyers</div>
                    <div className="text-xs text-purple-300/70 mt-0.5">Buyers who spent ≥ ₹3,000 in the month · year-to-date</div>
                  </div>
                  <button
                    onClick={() => setTrendExpanded((e) => !e)}
                    className="shrink-0 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-purple-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {trendExpanded ? '▲ Collapse' : '▼ Level Breakdown'}
                  </button>
                </div>
                {trendChart.length === 0 ? (
                  <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendChart} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="Qualified Buyers" stroke="#e879f9" strokeWidth={2.5}
                        dot={{ fill: '#e879f9', r: 4 }} activeDot={{ r: 6 }}>
                        <LabelList dataKey="Qualified Buyers" content={(props: any) => {
                          const v = Number(props.value);
                          if (!v) return <g />;
                          return (
                            <text x={Number(props.x)} y={Number(props.y) - 10}
                              textAnchor="middle" fill="#f0abfc" fontSize={11} fontWeight="bold">{v}</text>
                          );
                        }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* Level breakdown table */}
                {trendExpanded && schemeTableData.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-purple-300/60 border-b border-white/10 text-right">
                          <th className="py-1.5 pr-3 text-left font-medium">Month</th>
                          <th className="py-1.5 pr-3 font-medium">Total</th>
                          <th className="py-1.5 pr-3 font-medium text-amber-300/80">🐢 L1</th>
                          <th className="py-1.5 pr-3 font-medium text-sky-300/80">🌀 L2</th>
                          <th className="py-1.5 pr-3 font-medium text-fuchsia-300/80">🔊 L3</th>
                          <th className="py-1.5 pr-3 font-medium text-rose-300/80">📷 L4</th>
                          <th className="py-1.5 font-medium text-orange-300/80">🍳 L5</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...schemeTableData]
                          .sort((a, b) => new Date(a.month_date).getTime() - new Date(b.month_date).getTime())
                          .map((row) => {
                            const mayPlus = row.month_date >= '2026-05-01';
                            const l1 = Number(row.level1), l2 = Number(row.level2), l3 = Number(row.level3);
                            const l4 = Number(row.level4), l5 = Number(row.level5);
                            return (
                              <tr key={row.month_date} className="border-b border-white/5 hover:bg-white/5 text-right">
                                <td className="py-1.5 pr-3 text-left text-white font-medium">{row.month}</td>
                                <td className="py-1.5 pr-3 text-fuchsia-300 font-bold">{fmt(row.qualified_buyers)}</td>
                                <td className="py-1.5 pr-3 text-amber-200">{l1 > 0 ? fmt(l1) : <span className="text-white/20">—</span>}</td>
                                <td className="py-1.5 pr-3 text-sky-200">{l2 > 0 ? fmt(l2) : <span className="text-white/20">—</span>}</td>
                                <td className="py-1.5 pr-3 text-fuchsia-200">{l3 > 0 ? fmt(l3) : <span className="text-white/20">—</span>}</td>
                                <td className="py-1.5 pr-3">
                                  {!mayPlus ? <span className="text-white/15">N/A</span>
                                    : l4 > 0 ? <span className="text-rose-200">{fmt(l4)}</span>
                                    : <span className="text-white/20">—</span>}
                                </td>
                                <td className="py-1.5">
                                  {!mayPlus ? <span className="text-white/15">N/A</span>
                                    : l5 > 0 ? <span className="text-orange-200">{fmt(l5)}</span>
                                    : <span className="text-white/20">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* New vs Old */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-white">New vs Returning Qualified Buyers</div>
                  <div className="text-xs text-purple-300/70 mt-0.5">New = first-ever qualifying month · year-to-date</div>
                </div>
                {newVsOldChart.length === 0 ? (
                  <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={newVsOldChart} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#c4b5fd' }} />
                      <Bar dataKey="New Buyers" stackId="a" fill="#a855f7" radius={[0, 0, 4, 4]}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <LabelList dataKey="New Buyers" content={(props: any) => {
                          const x = Number(props.x), y = Number(props.y);
                          const w = Number(props.width), h = Number(props.height);
                          const v = Number(props.value);
                          if (!v || h < 14) return <g />;
                          return <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">{v}</text>;
                        }} />
                      </Bar>
                      <Bar dataKey="Returning Buyers" stackId="a" fill="#22d3ee" radius={[4, 4, 0, 0]}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <LabelList dataKey="Returning Buyers" content={(props: any) => {
                          const x = Number(props.x), y = Number(props.y);
                          const w = Number(props.width), h = Number(props.height);
                          const v = Number(props.value);
                          if (!v || h < 14) return <g />;
                          return <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">{v}</text>;
                        }} />
                        {/* total above the full bar */}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <LabelList dataKey="Returning Buyers" content={(props: any) => {
                          const x = Number(props.x), y = Number(props.y), w = Number(props.width);
                          const entry = newVsOldChart[props.index];
                          const total = entry ? (entry['New Buyers'] || 0) + (entry['Returning Buyers'] || 0) : 0;
                          if (!total) return <g />;
                          return <text x={x + w / 2} y={y - 5} textAnchor="middle" fill="#f0abfc" fontSize={11} fontWeight="bold">{total}</text>;
                        }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Scheme table */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 overflow-x-auto">
              <div className="mb-4">
                <div className="text-sm font-semibold text-white">Monthly Scheme Breakdown</div>
                <div className="text-xs text-purple-300/70 mt-0.5">
                  L1 ≥₹3k · L2 ≥₹5k · L3 ≥₹10k · L4 ≥₹20k (May+) · L5 ≥₹30k (May+) · year-to-date
                </div>
              </div>
              {schemeRows.length === 0 ? (
                <div className="text-purple-300/60 text-sm text-center py-8">No data</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-purple-300 text-xs border-b border-white/10">
                      <th className="py-2 pr-4 font-medium whitespace-nowrap">Month</th>
                      <th className="py-2 pr-4 font-medium text-right whitespace-nowrap">Delivered</th>
                      <th className="py-2 pr-4 font-medium text-right whitespace-nowrap">Qualified</th>
                      <th className="py-2 pr-3 font-medium text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />L1 🐢</span></th>
                      <th className="py-2 pr-3 font-medium text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />L2 🌀</span></th>
                      <th className="py-2 pr-3 font-medium text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fuchsia-400 inline-block" />L3 🔊</span></th>
                      <th className="py-2 pr-3 font-medium text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />L4 📷</span></th>
                      <th className="py-2 font-medium text-right whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />L5 🍳</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {schemeRows.map((row, i) => {
                      const prev = i > 0 ? schemeRows[i - 1] : null;
                      const total = Number(row.qualified_buyers) || 0;
                      const l1 = Number(row.level1) || 0;
                      const l2 = Number(row.level2) || 0;
                      const l3 = Number(row.level3) || 0;
                      const l4 = Number(row.level4) || 0;
                      const l5 = Number(row.level5) || 0;
                      const dTotal = prev ? total - (Number(prev.qualified_buyers) || 0) : null;
                      const dL1    = prev ? l1 - (Number(prev.level1) || 0) : null;
                      const dL2    = prev ? l2 - (Number(prev.level2) || 0) : null;
                      const dL3    = prev ? l3 - (Number(prev.level3) || 0) : null;
                      const dL4    = prev ? l4 - (Number(prev.level4) || 0) : null;
                      const dL5    = prev ? l5 - (Number(prev.level5) || 0) : null;
                      const convPct = Number(row.delivered_buyers)
                        ? ((total / Number(row.delivered_buyers)) * 100).toFixed(1) : '—';
                      const mayPlus = row.month_date >= '2026-05-01';

                      const D = (d: number | null) => {
                        if (d === null || d === 0) return null;
                        return (
                          <span className={`text-[10px] font-semibold ml-1 ${d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {d > 0 ? `↑${d}` : `↓${Math.abs(d)}`}
                          </span>
                        );
                      };

                      return (
                        <tr key={row.month_date} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 pr-4 text-white font-medium whitespace-nowrap">{row.month}</td>
                          <td className="py-2.5 pr-4 text-right text-purple-200">{fmt(row.delivered_buyers)}</td>
                          <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                            <span className="text-white font-semibold">{fmt(total)}</span>
                            <span className="text-purple-400 text-xs ml-1">({convPct}%)</span>
                            {D(dTotal)}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            {l1 > 0 ? <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 text-xs font-semibold">{fmt(l1)}</span> : <span className="text-purple-400/40">—</span>}
                            {D(dL1)}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            {l2 > 0 ? <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-200 text-xs font-semibold">{fmt(l2)}</span> : <span className="text-purple-400/40">—</span>}
                            {D(dL2)}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            {l3 > 0 ? <span className="px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-200 text-xs font-semibold">{fmt(l3)}</span> : <span className="text-purple-400/40">—</span>}
                            {D(dL3)}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                            {!mayPlus ? <span className="text-purple-400/20 text-xs">N/A</span>
                              : l4 > 0 ? <><span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 text-xs font-semibold">{fmt(l4)}</span>{D(dL4)}</>
                              : <span className="text-purple-400/40">—</span>}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {!mayPlus ? <span className="text-purple-400/20 text-xs">N/A</span>
                              : l5 > 0 ? <><span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-200 text-xs font-semibold">{fmt(l5)}</span>{D(dL5)}</>
                              : <span className="text-purple-400/40">—</span>}
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

        {/* ── ALERTS ───────────────────────────────────────────────────────── */}
        {!loading && tab === 'alerts' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="mb-6">
                <div className="text-sm font-semibold text-white">Current Month — Gift Winners</div>
                <div className="text-xs text-purple-300/70 mt-0.5">Buyers already qualified for a gift this month (DELIVERED / COMPLETED)</div>
              </div>
              {giftData.length === 0 ? (
                <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {giftData.map((g) => {
                    const count = Number(g.buyer_count);
                    return (
                      <div key={g.gift_name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 flex flex-col gap-3">
                        <div className="text-4xl">{GIFT_ICON[g.gift_name] ?? '🎁'}</div>
                        <div>
                          <div className="text-sm font-bold text-white leading-snug">{g.gift_name}</div>
                          <div className="text-xs text-purple-300/70 mt-0.5">{GIFT_LEVEL[g.gift_name]}</div>
                        </div>
                        <div className="mt-auto">
                          <div className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">{fmt(count)}</div>
                          <div className="text-xs text-purple-300/70">{count === 1 ? 'buyer' : 'buyers'} qualified</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                  <div className="text-xs text-purple-300/70 mt-0.5">Each buyer counted once in their highest qualifying tier</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DETAIL TAB ───────────────────────────────────────────────────── */}
        {tab === 'detail' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <div className="flex items-end gap-3 flex-wrap">
                {/* Month */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-purple-300/70 font-medium">Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-fuchsia-400/50 min-w-[130px]"
                  >
                    {AVAILABLE_MONTHS.map((m) => (
                      <option key={m.value} value={m.value} className="bg-slate-900">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date range */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-purple-300/70 font-medium">From Date</label>
                  <input
                    type="date"
                    value={date1}
                    onChange={(e) => setDate1(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-fuchsia-400/50 [color-scheme:dark]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-purple-300/70 font-medium">To Date</label>
                  <input
                    type="date"
                    value={date2}
                    onChange={(e) => setDate2(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-fuchsia-400/50 [color-scheme:dark]"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-purple-300/70 font-medium">Buyer Phone</label>
                  <input
                    type="text"
                    value={phoneFilter}
                    onChange={(e) => setPhoneFilter(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white placeholder-purple-300/40 focus:outline-none focus:border-fuchsia-400/50 w-[160px]"
                  />
                </div>

                {/* Load button */}
                <button
                  onClick={loadDetail}
                  disabled={detailLoading}
                  className="px-5 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-[0_0_20px_rgba(217,70,239,0.3)]"
                >
                  {detailLoading ? 'Loading…' : 'Load Data'}
                </button>

                {detailRows.length > 0 && (
                  <div className="text-xs text-purple-300/60 ml-auto self-end pb-2">
                    <span className="text-white font-semibold">{detailRows.length}</span> buyers · {detailMonthLabel}
                  </div>
                )}
              </div>
            </div>

            {detailError && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {detailError}
              </div>
            )}

            {detailLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="text-purple-300 text-sm animate-pulse">Fetching buyer detail…</div>
              </div>
            )}

            {!detailLoading && detailRows.length === 0 && !detailError && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-purple-300/60 text-sm">
                Select a month and click <span className="text-fuchsia-300 font-semibold">Load Data</span> to view buyer-level details.
              </div>
            )}

            {!detailLoading && detailRows.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
                {/* Summary strip */}
                <div className="px-5 py-3 border-b border-white/10 flex items-center gap-6 flex-wrap text-xs text-purple-300/80">
                  <span>
                    <span className="text-white font-semibold">{detailRows.filter(r => r.gift_won !== 'No Gift').length}</span> qualified (gift won)
                  </span>
                  <span>
                    <span className="text-white font-semibold">{detailRows.filter(r => r.gift_won === 'No Gift').length}</span> not qualified
                  </span>
                  <span className="ml-auto">
                    Scheme Details — <span className="text-fuchsia-300 font-semibold">{detailMonthLabel}</span>
                    {!isMayPlus && <span className="ml-2 text-amber-300/70">(L1–L3 only · Mar–Apr scheme)</span>}
                    {isMayPlus && <span className="ml-2 text-emerald-300/70">(L1–L5 · May onwards)</span>}
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-purple-300/80 bg-white/[0.03] text-left border-b border-white/10">
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">#</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Name</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Business Name</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Phone</th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Qualified ₹</th>
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% L1<br/><span className="font-normal opacity-60">₹3k</span></th>
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% L2<br/><span className="font-normal opacity-60">₹5k</span></th>
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% L3<br/><span className="font-normal opacity-60">₹10k</span></th>
                        {isMayPlus && (
                          <>
                            <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% L4<br/><span className="font-normal opacity-60">₹20k</span></th>
                            <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% L5<br/><span className="font-normal opacity-60">₹30k</span></th>
                          </>
                        )}
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">Reward Level</th>
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">Gift Won</th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Placed ₹<br/><span className="font-normal opacity-60">{detailMonthLabel}</span></th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Delivered ₹</th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">RTO ₹</th>
                        <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">% Delivered</th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Due ₹</th>
                        <th className="py-2.5 px-3 text-sm font-bold whitespace-nowrap bg-fuchsia-500/20 text-fuchsia-200 border-l border-fuchsia-400/30">Address</th>
                        <th className="py-2.5 px-3 text-sm font-bold whitespace-nowrap bg-fuchsia-500/20 text-fuchsia-200">Landmark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row, i) => {
                        const qualified = row.gift_won !== 'No Gift';
                        const rowBg = qualified ? '' : 'bg-red-500/[0.04]';
                        const placedNum = Number(row.placed_amount);
                        return (
                          <tr key={row.buyer_id} className={`border-b border-white/5 hover:bg-white/[0.06] transition-colors ${rowBg}`}>
                            <td className="py-2 px-3 text-purple-400/60">{i + 1}</td>
                            <td className="py-2 px-3 text-white max-w-[160px] truncate" title={row.buyer_name}>
                              {row.buyer_name || '—'}
                            </td>
                            <td className="py-2 px-3 text-white max-w-[200px] truncate" title={row.buyer_business_name}>
                              {row.buyer_business_name}
                            </td>
                            <td className="py-2 px-3 text-purple-100 font-mono whitespace-nowrap">{row.buyer_phone}</td>
                            <td className="py-2 px-3 text-right font-semibold text-white whitespace-nowrap">
                              {fmtAmt(row.qualified_amount)}
                            </td>
                            <td className={`py-2 px-3 text-center rounded-sm whitespace-nowrap ${pctBarClass(row.pct_level1)}`}>
                              {row.pct_level1}
                            </td>
                            <td className={`py-2 px-3 text-center rounded-sm whitespace-nowrap ${pctBarClass(row.pct_level2)}`}>
                              {row.pct_level2}
                            </td>
                            <td className={`py-2 px-3 text-center rounded-sm whitespace-nowrap ${pctBarClass(row.pct_level3)}`}>
                              {row.pct_level3}
                            </td>
                            {isMayPlus && (
                              <>
                                <td className={`py-2 px-3 text-center rounded-sm whitespace-nowrap ${row.pct_level4 === '-' ? 'text-purple-400/30' : pctBarClass(row.pct_level4)}`}>
                                  {row.pct_level4 === '-' ? '—' : row.pct_level4}
                                </td>
                                <td className={`py-2 px-3 text-center rounded-sm whitespace-nowrap ${row.pct_level5 === '-' ? 'text-purple-400/30' : pctBarClass(row.pct_level5)}`}>
                                  {row.pct_level5 === '-' ? '—' : row.pct_level5}
                                </td>
                              </>
                            )}
                            <td className={`py-2 px-3 text-center whitespace-nowrap ${rewardLevelClass(row.reward_level)}`}>
                              {row.reward_level}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${giftCellClass(row.gift_won)}`}>
                                {row.gift_won}
                              </span>
                            </td>
                            <td className={`py-2 px-3 text-right whitespace-nowrap ${placedNum > 0 ? 'text-cyan-300 font-semibold' : 'text-purple-400/40'}`}>
                              {fmtAmt(row.placed_amount)}
                            </td>
                            <td className="py-2 px-3 text-right text-purple-200 whitespace-nowrap">
                              {fmtAmt(row.delivered_amount)}
                            </td>
                            <td className={`py-2 px-3 text-right whitespace-nowrap ${Number(row.rto_amount) > 0 ? 'text-rose-300' : 'text-purple-400/40'}`}>
                              {fmtAmt(row.rto_amount)}
                            </td>
                            <td className="py-2 px-3 text-center text-purple-200 whitespace-nowrap">
                              {row.pct_delivered}
                            </td>
                            <td className={`py-2 px-3 text-right whitespace-nowrap ${Number(row.due_amount) > 0 ? 'text-amber-300' : 'text-purple-400/40'}`}>
                              {fmtAmt(row.due_amount)}
                            </td>
                            <td className="py-2 px-3 text-purple-200/80 min-w-[200px] border-l border-fuchsia-400/20">
                              {[row.buyer_address_line1, row.buyer_address_line2].filter(Boolean).join(', ') || '—'}
                            </td>
                            <td className="py-2 px-3 text-purple-200/80 min-w-[150px]">
                              {row.buyer_landmark || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
