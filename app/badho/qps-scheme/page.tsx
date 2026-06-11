'use client';

import React, { useEffect, useState } from 'react';
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

interface BuyerOrderRow {
  po_number: string;
  marked_pending_time: string;
  status: string;
  amount: string;
  seller_name: string;
  seller_phone: string;
  awb_number: string;
  courier_name: string;
}

type Tab = 'overview' | 'alerts' | 'detail';
type SqlQuery = { sql: string; params?: unknown[] };

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_BTN_CLASS =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap bg-white/8 hover:bg-fuchsia-500/25 border border-white/10 hover:border-fuchsia-400/40 text-purple-300 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed';

const CSV_BTN_CLASS =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-400/40 text-emerald-300 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed';

// ── QueryModal ────────────────────────────────────────────────────────────────

function QueryModal({ title, queries, onClose }: { title: string; queries: SqlQuery[]; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-slate-950 border border-white/15 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-950 z-10">
          <div>
            <p className="text-purple-300 text-[11px] uppercase tracking-wider font-semibold">SQL Query</p>
            <h3 className="text-white font-bold text-lg">{title}</h3>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2">×</button>
        </div>
        <div className="p-6 space-y-5">
          {queries.length === 0 ? (
            <p className="text-purple-300 text-sm">Query unavailable — load this section first, then reopen.</p>
          ) : queries.map((q, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold">
                  {queries.length > 1 ? `Query #${i + 1}` : 'Query'}
                </p>
                <button onClick={() => navigator.clipboard?.writeText(q.sql)} className="px-3 py-1 rounded-lg text-[11px] font-semibold text-purple-200 border border-white/10 bg-white/5 hover:bg-white/10 transition-all">Copy</button>
              </div>
              <pre className="text-[11px] leading-relaxed text-emerald-200/90 font-mono whitespace-pre-wrap overflow-x-auto bg-black/40 rounded-xl p-4 border border-white/10">{q.sql}</pre>
              {q.params && q.params.length > 0 && (
                <p className="text-purple-300/70 text-[11px] mt-2 font-mono break-all">params: [{q.params.map((p) => JSON.stringify(p)).join(', ')}]</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const csv = toCsv(rows);
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

function orderStatusClass(status: string) {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'REJECTED') return 'bg-rose-500/20 text-rose-300';
  if (status === 'CANCELLED') return 'bg-red-500/15 text-red-300';
  if (status === 'DISPATCHED') return 'bg-blue-500/20 text-blue-300';
  if (status === 'IN_PROGRESS') return 'bg-sky-500/15 text-sky-300';
  if (status === 'PENDING') return 'bg-amber-500/15 text-amber-300';
  return 'bg-white/5 text-purple-300';
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

  // Query modal state
  const [sectionQueries, setSectionQueries] = useState<Record<string, SqlQuery[]>>({});
  const [queryModalState, setQueryModalState] = useState<{ title: string; queries: SqlQuery[] } | null>(null);
  const captureQuery = (key: string, json: unknown) => {
    const q = (json as { __queries?: SqlQuery[] })?.__queries;
    if (Array.isArray(q) && q.length) setSectionQueries((prev) => ({ ...prev, [key]: q }));
  };
  const queryBtn = (key: string, title: string) => {
    const queries = sectionQueries[key];
    const has = !!queries?.length;
    return (
      <button type="button" disabled={!has} title={has ? 'Show SQL' : 'Load data first'} onClick={() => has && setQueryModalState({ title, queries })} className={QUERY_BTN_CLASS}>
        🔍 SQL
      </button>
    );
  };

  // Buyer order expand state
  const [expandedBuyerId, setExpandedBuyerId] = useState<string | null>(null);
  const [buyerOrdersMap, setBuyerOrdersMap] = useState<Record<string, BuyerOrderRow[]>>({});
  const [buyerOrdersLoading, setBuyerOrdersLoading] = useState<string | null>(null);

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
        captureQuery('trend', trend);
        captureQuery('newVsOld', nvo);
        captureQuery('schemeTable', scheme);
        captureQuery('gifts', gifts);
        setTrendData(trend.data ?? []);
        setNewVsOldData(nvo.data ?? []);
        setSchemeTableData(scheme.data ?? []);
        setGiftData(gifts.data ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authChecked]);

  function loadDetail(overrideMonth?: string) {
    const month = overrideMonth ?? selectedMonth;
    setDetailLoading(true);
    setDetailError(null);
    setExpandedBuyerId(null);
    setBuyerOrdersMap({});
    const qs = new URLSearchParams({ month });
    if (date1) qs.set('date1', date1);
    if (date2) qs.set('date2', date2);
    if (phoneFilter) qs.set('phone', phoneFilter);
    fetch(`/api/qps-buyer-detail?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        captureQuery('detail', d);
        setDetailRows(d.data ?? []);
        setDetailMonthLabel(d.month_label ?? '');
        setIsMayPlus(d.is_may_plus ?? false);
      })
      .catch((e) => setDetailError(e.message))
      .finally(() => setDetailLoading(false));
  }

  function toggleBuyerOrders(buyerId: string) {
    if (expandedBuyerId === buyerId) { setExpandedBuyerId(null); return; }
    setExpandedBuyerId(buyerId);
    if (buyerOrdersMap[buyerId]) return;
    setBuyerOrdersLoading(buyerId);
    fetch(`/api/qps-buyer-orders?buyerId=${buyerId}&month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d) => setBuyerOrdersMap((prev) => ({ ...prev, [buyerId]: d.data ?? [] })))
      .finally(() => setBuyerOrdersLoading(null));
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
    { key: 'detail', label: 'Qualified Detail' },
    { key: 'alerts', label: 'Alerts' },
  ];

  return (
    <>
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
                  <div className="flex items-center gap-2 shrink-0">
                    {queryBtn('trend', 'Monthly Qualified Buyers')}
                    <button
                      disabled={!trendData.length}
                      onClick={() => downloadCsv(trendData as unknown as Record<string, unknown>[], `qps-trend-${selectedMonth}.csv`)}
                      className={CSV_BTN_CLASS}
                    >⬇ CSV</button>
                  <button
                    onClick={() => setTrendExpanded((e) => !e)}
                    className="px-4 py-2 rounded-xl bg-fuchsia-500/25 border border-fuchsia-400/50 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-500/40 hover:text-white transition-all shadow-[0_0_12px_rgba(217,70,239,0.25)]"
                  >
                    {trendExpanded ? '▲ Collapse' : '▼ Level Breakdown'}
                  </button>
                  </div>
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
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                  <div className="text-sm font-semibold text-white">New vs Returning Qualified Buyers</div>
                  <div className="text-xs text-purple-300/70 mt-0.5">New = first-ever qualifying month · year-to-date</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {queryBtn('newVsOld', 'New vs Returning Qualified Buyers')}
                    <button disabled={!newVsOldData.length} onClick={() => downloadCsv(newVsOldData as unknown as Record<string, unknown>[], 'qps-new-vs-returning.csv')} className={CSV_BTN_CLASS}>⬇ CSV</button>
                  </div>
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
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">Monthly Scheme Breakdown</div>
                  <div className="text-xs text-purple-300/70 mt-0.5">
                    L1 ≥₹3k · L2 ≥₹5k · L3 ≥₹10k · L4 ≥₹20k (May+) · L5 ≥₹30k (May+) · year-to-date
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {queryBtn('schemeTable', 'Monthly Scheme Breakdown')}
                  <button disabled={!schemeRows.length} onClick={() => downloadCsv(schemeRows as unknown as Record<string, unknown>[], 'qps-scheme-breakdown.csv')} className={CSV_BTN_CLASS}>⬇ CSV</button>
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
        {!loading && tab === 'alerts' && (() => {
          const GIFT_ORDER = [
            'Airfryer/Mixer (Worth 3000)',
            'CCTV/Iron (Worth 2000)',
            'Speaker (Worth 1000)',
            'Mini table fan (Worth 500)',
            'Vastu tortoise (Worth 300)',
          ];
          // Previous month derived from already-loaded schemeTableData (sorted ascending)
          const prevRow = schemeRows.length >= 2 ? schemeRows[schemeRows.length - 2] : null;
          const prevMayPlus = prevRow ? prevRow.month_date >= '2026-05-01' : false;
          const prevGifts = prevRow ? GIFT_ORDER.filter(n => {
            if ((n === 'Airfryer/Mixer (Worth 3000)' || n === 'CCTV/Iron (Worth 2000)') && !prevMayPlus) return false;
            return true;
          }).map(n => {
            let count = 0;
            if (n === 'Airfryer/Mixer (Worth 3000)') count = Number(prevRow.level5) || 0;
            else if (n === 'CCTV/Iron (Worth 2000)')  count = Number(prevRow.level4) || 0;
            else if (n === 'Speaker (Worth 1000)')     count = Number(prevRow.level3) || 0;
            else if (n === 'Mini table fan (Worth 500)') count = Number(prevRow.level2) || 0;
            else if (n === 'Vastu tortoise (Worth 300)') count = Number(prevRow.level1) || 0;
            return { gift_name: n, buyer_count: count };
          }) : [];

          const GiftCard = ({ g, dim }: { g: { gift_name: string; buyer_count: number }; dim?: boolean }) => (
            <div className={`rounded-2xl border p-5 flex flex-col gap-3 ${dim ? 'border-white/5 bg-white/[0.02] opacity-70' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="text-4xl">{GIFT_ICON[g.gift_name] ?? '🎁'}</div>
              <div>
                <div className="text-sm font-bold text-white leading-snug">{g.gift_name}</div>
                <div className="text-xs text-purple-300/70 mt-0.5">{GIFT_LEVEL[g.gift_name]}</div>
              </div>
              <div className="mt-auto">
                <div className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">{fmt(g.buyer_count)}</div>
                <div className="text-xs text-purple-300/70">{g.buyer_count === 1 ? 'buyer' : 'buyers'} qualified</div>
              </div>
            </div>
          );

          return (
            <div className="space-y-6">
              {/* Current month */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="mb-6 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Current Month — Gift Winners</div>
                    <div className="text-xs text-purple-300/70 mt-0.5">Buyers already qualified for a gift this month (DELIVERED / COMPLETED)</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {queryBtn('gifts', 'Current Month Gift Winners')}
                    <button disabled={!giftData.length} onClick={() => downloadCsv(giftData as unknown as Record<string, unknown>[], 'qps-gifts-current-month.csv')} className={CSV_BTN_CLASS}>⬇ CSV</button>
                  </div>
                </div>
                {giftData.length === 0 ? (
                  <div className="text-purple-300/60 text-sm text-center py-12">No data</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {giftData.map((g) => (
                      <GiftCard key={g.gift_name} g={{ gift_name: g.gift_name, buyer_count: Number(g.buyer_count) }} />
                    ))}
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

              {/* Previous month */}
              {prevRow && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
                  <div className="mb-6">
                    <div className="text-sm font-semibold text-white">Previous Month ({prevRow.month}) — Gift Winners</div>
                    <div className="text-xs text-purple-300/70 mt-0.5">Final tally for {prevRow.month}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {prevGifts.map((g) => (
                      <GiftCard key={g.gift_name} g={g} dim />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-lg">🏅</span>
                    <div className="text-purple-200/80 text-sm">
                      Total qualified in {prevRow.month}:{' '}
                      <span className="text-fuchsia-300 font-bold">
                        {fmt(prevGifts.reduce((s, g) => s + g.buyer_count, 0))}
                      </span>{' '}
                      buyers
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
                    onChange={(e) => { setSelectedMonth(e.target.value); loadDetail(e.target.value); }}
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
                  onClick={() => loadDetail()}
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
                  <span className="ml-auto flex items-center gap-3">
                    <span>
                      Scheme Details — <span className="text-fuchsia-300 font-semibold">{detailMonthLabel}</span>
                      {!isMayPlus && <span className="ml-2 text-amber-300/70">(L1–L3 only · Mar–Apr scheme)</span>}
                      {isMayPlus && <span className="ml-2 text-emerald-300/70">(L1–L5 · May onwards)</span>}
                    </span>
                    {queryBtn('detail', `Qualified Detail — ${detailMonthLabel}`)}
                    <button onClick={() => downloadCsv(detailRows as unknown as Record<string, unknown>[], `qps-detail-${selectedMonth}.csv`)} className={CSV_BTN_CLASS}>⬇ CSV</button>
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-white text-sm font-bold text-left bg-gradient-to-r from-purple-800/70 to-fuchsia-900/50 border-b-2 border-fuchsia-400/40 sticky top-0">
                        <th className="py-3 px-3 whitespace-nowrap"># Orders</th>
                        <th className="py-3 px-3 whitespace-nowrap">Name</th>
                        <th className="py-3 px-3 whitespace-nowrap">Business Name</th>
                        <th className="py-3 px-3 whitespace-nowrap">Phone</th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">Qualified ₹</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">% L1<br/><span className="font-normal text-purple-300 text-xs">₹3k</span></th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">% L2<br/><span className="font-normal text-purple-300 text-xs">₹5k</span></th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">% L3<br/><span className="font-normal text-purple-300 text-xs">₹10k</span></th>
                        {isMayPlus && (
                          <>
                            <th className="py-3 px-3 text-center whitespace-nowrap">% L4<br/><span className="font-normal text-purple-300 text-xs">₹20k</span></th>
                            <th className="py-3 px-3 text-center whitespace-nowrap">% L5<br/><span className="font-normal text-purple-300 text-xs">₹30k</span></th>
                          </>
                        )}
                        <th className="py-3 px-3 text-center whitespace-nowrap">Reward Level</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">Gift Won</th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">Placed ₹<br/><span className="font-normal text-purple-300 text-xs">{detailMonthLabel}</span></th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">Delivered ₹</th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">RTO ₹</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">% Delivered</th>
                        <th className="py-3 px-3 text-right whitespace-nowrap">Due ₹</th>
                        <th className="py-3 px-3 whitespace-nowrap text-fuchsia-200 border-l border-fuchsia-400/40">Address</th>
                        <th className="py-3 px-3 whitespace-nowrap text-fuchsia-200">Landmark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row, i) => {
                        const qualified = row.gift_won !== 'No Gift';
                        const rowBg = qualified ? '' : 'bg-red-500/[0.04]';
                        const placedNum = Number(row.placed_amount);
                        const isExpanded = expandedBuyerId === row.buyer_id;
                        const isLoadingOrders = buyerOrdersLoading === row.buyer_id;
                        const orders = buyerOrdersMap[row.buyer_id] ?? [];
                        return (
                          <React.Fragment key={row.buyer_id}>
                          <tr className={`border-b border-white/5 hover:bg-white/[0.06] transition-colors ${rowBg}`}>
                            <td className="py-2 px-2 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-purple-400/50 text-xs w-4 text-right">{i + 1}</span>
                                <button
                                  onClick={() => toggleBuyerOrders(row.buyer_id)}
                                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition-colors ${isExpanded ? 'bg-fuchsia-500/30 text-fuchsia-300' : 'bg-white/8 text-purple-400 hover:bg-white/15 hover:text-white'}`}
                                  title={isExpanded ? 'Collapse orders' : 'View orders'}
                                >
                                  {isLoadingOrders ? '…' : isExpanded ? '▼' : '▶'}
                                </button>
                              </div>
                            </td>
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
                                {GIFT_ICON[row.gift_won] ? `${GIFT_ICON[row.gift_won]} ` : ''}{row.gift_won}
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
                          {isExpanded && (
                            <tr className="bg-purple-900/30">
                              <td colSpan={99} className="px-6 py-3">
                                {isLoadingOrders || (!orders.length && !buyerOrdersMap[row.buyer_id]) ? (
                                  <div className="text-purple-300/60 text-xs py-2">Loading orders…</div>
                                ) : orders.length === 0 ? (
                                  <div className="text-purple-300/60 text-xs py-2">No orders found for this month</div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <div className="text-xs text-purple-300/60 mb-2 font-medium">Orders in {detailMonthLabel} — {orders.length} order{orders.length !== 1 ? 's' : ''}</div>
                                    <table className="w-full text-xs border-collapse">
                                      <thead>
                                        <tr className="text-purple-300/70 border-b border-white/10 text-left">
                                          <th className="py-1.5 pr-4 font-medium whitespace-nowrap">PO #</th>
                                          <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Date</th>
                                          <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Seller</th>
                                          <th className="py-1.5 pr-4 font-medium text-right whitespace-nowrap">Amount</th>
                                          <th className="py-1.5 pr-4 font-medium text-center whitespace-nowrap">Status</th>
                                          <th className="py-1.5 pr-4 font-medium whitespace-nowrap">AWB</th>
                                          <th className="py-1.5 font-medium whitespace-nowrap">Courier</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {orders.map((o) => (
                                          <tr key={o.po_number} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-1.5 pr-4 font-mono text-purple-200">{o.po_number}</td>
                                            <td className="py-1.5 pr-4 text-purple-300 whitespace-nowrap">
                                              {o.marked_pending_time ? new Date(o.marked_pending_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                            </td>
                                            <td className="py-1.5 pr-4 text-white max-w-[200px] truncate" title={o.seller_name}>{o.seller_name}</td>
                                            <td className="py-1.5 pr-4 text-right font-semibold text-white whitespace-nowrap">{fmtAmt(o.amount)}</td>
                                            <td className="py-1.5 pr-4 text-center">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${orderStatusClass(o.status)}`}>{o.status}</span>
                                            </td>
                                            <td className="py-1.5 pr-4 text-purple-300/70 font-mono">{o.awb_number || '—'}</td>
                                            <td className="py-1.5 text-purple-300/70">{o.courier_name || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
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

    {queryModalState && (
      <QueryModal
        title={queryModalState.title}
        queries={queryModalState.queries}
        onClose={() => setQueryModalState(null)}
      />
    )}
    </>
  );
}
