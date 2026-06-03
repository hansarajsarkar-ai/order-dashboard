'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PoRow {
  poNumber: string | null;
  orderTs: string;
  orderDateTime: string | null;
  prevAmount: number;
  newAmount: number;
  valueLost: number;
  poStatus: string | null;
  brandName: string | null;
  buyerBusiness: string | null;
  buyerPhone: string | null;
  paymentMode: string | null;
  remarks: string | null;
}
interface Kpis {
  modifiedPos: number;
  itemRemovedPos: number;
  qtyDecreasedPos: number;
  prevAmountSum: number;
  newAmountSum: number;
  valueLost: number;
}
interface ApiResp {
  data: PoRow[];
  kpis: Kpis;
  timestamp: string;
}

type RangeKey = '7d' | '30d' | '90d' | 'ytd' | 'custom';

function fmtAmount(n: number): string {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}
function fmtFull(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmtCount(n: number): string {
  return n.toLocaleString('en-IN');
}

export default function PoModifiedDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [resp, setResp] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');

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

  const resolveRange = useCallback((): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'custom') return { startDate: customFrom || null, endDate: customTo || null };
    if (range === 'ytd') return { startDate: `${today.getFullYear()}-01-01`, endDate: fmt(today) };
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    return { startDate: fmt(start), endDate: fmt(today) };
  }, [range, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = resolveRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await fetch(`/api/po-modified${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setResp(json as ApiResp);
    } catch (err) {
      console.error('po-modified fetch failed:', err);
      setResp(null);
    } finally {
      setLoading(false);
    }
  }, [resolveRange]);

  useEffect(() => {
    if (!authChecked) return;
    if (range === 'custom' && (!customFrom || !customTo)) return;
    fetchData();
  }, [authChecked, range, customFrom, customTo, fetchData]);

  const rows = useMemo(() => {
    if (!resp) return [];
    const q = search.trim().toLowerCase();
    if (!q) return resp.data;
    return resp.data.filter((r) =>
      [r.poNumber, r.brandName, r.buyerBusiness, r.buyerPhone, r.poStatus, r.remarks]
        .some((v) => (v ?? '').toString().toLowerCase().includes(q))
    );
  }, [resp, search]);

  const exportCsv = () => {
    if (!resp) return;
    const headers = ['PO Number', 'Order Date & Time', 'Remarks', 'Previous PO Amount', 'New PO Amount', 'Value Lost', 'PO Status', 'Brand', 'Buyer Business', 'Buyer Phone', 'Payment Mode'];
    const esc = (v: string | number | null) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(',')];
    for (const r of rows) {
      lines.push([r.poNumber, r.orderDateTime, r.remarks, r.prevAmount, r.newAmount, r.valueLost, r.poStatus, r.brandName, r.buyerBusiness, r.buyerPhone, r.paymentMode].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `po-modified-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const k = resp?.kpis;
  const RANGES: { key: RangeKey; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: '90d', label: 'Last 90 days' },
    { key: 'ytd', label: 'YTD' },
    { key: 'custom', label: 'Custom' },
  ];

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

        {/* Title */}
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-white">PO Modified</h1>
          <p className="text-purple-300 text-sm mt-1">
            Orders where a <span className="text-fuchsia-300 font-semibold">seller removed an item or decreased its quantity</span> due to unavailability — D2R third-party INTERCITY, bucketed by order date.
          </p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${range === r.key ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-purple-200">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-white/10 border border-white/15 rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40" />
              <span>→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-white/10 border border-white/15 rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40" />
            </div>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO #, brand, buyer, phone, status…"
            className="flex-1 min-w-[240px] max-w-[420px] bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
          />
          <button
            onClick={exportCsv}
            disabled={!resp || rows.length === 0}
            className="px-3 py-2 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-100 text-xs font-bold disabled:opacity-40 transition-colors"
          >
            ↓ CSV
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi label="Modified POs" value={fmtCount(k?.modifiedPos ?? 0)} sub="seller item edits" tone="fuchsia" />
          <Kpi label="Item Removed" value={fmtCount(k?.itemRemovedPos ?? 0)} sub="POs with a removal" tone="rose" />
          <Kpi label="Quantity Decreased" value={fmtCount(k?.qtyDecreasedPos ?? 0)} sub="POs with a qty cut" tone="amber" />
          <Kpi label="Value Lost" value={fmtAmount(k?.valueLost ?? 0)} sub={`of ${fmtAmount(k?.prevAmountSum ?? 0)} original`} tone="emerald" />
        </div>

        {/* Table */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Modified Purchase Orders</h3>
            <span className="text-xs text-purple-300/70">{loading ? 'Loading…' : `${rows.length.toLocaleString('en-IN')} POs`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">PO Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Order Date &amp; Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Remarks</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Previous PO Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">New PO Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Value Lost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">PO Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Brand</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Buyer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.poNumber} className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors">
                    <td className="px-4 py-3 tabular-nums font-semibold text-fuchsia-200">{r.poNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-purple-100 whitespace-nowrap text-xs">{r.orderDateTime ?? '—'}</td>
                    <td className="px-4 py-3">
                      {(r.remarks ?? '').split(', ').filter(Boolean).map((rm) => (
                        <span key={rm} className={`inline-block mr-1 px-2 py-0.5 rounded-md text-xs font-semibold ${rm === 'Item Removed' ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30' : 'bg-amber-500/15 text-amber-200 border border-amber-400/30'}`}>{rm}</span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-purple-100">{fmtFull(r.prevAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{fmtFull(r.newAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300 font-semibold">{r.valueLost > 0 ? `−${fmtFull(r.valueLost)}` : '—'}</td>
                    <td className="px-4 py-3 text-purple-100 text-xs whitespace-nowrap">{r.poStatus ?? '—'}</td>
                    <td className="px-4 py-3 text-purple-100 text-xs max-w-[160px] truncate" title={r.brandName ?? ''}>{r.brandName ?? '—'}</td>
                    <td className="px-4 py-3 text-purple-100 text-xs max-w-[200px] truncate" title={`${r.buyerBusiness ?? ''} ${r.buyerPhone ?? ''}`}>
                      <div className="truncate">{r.buyerBusiness ?? '—'}</div>
                      <div className="text-[11px] text-sky-300/80 tabular-nums">{r.buyerPhone ?? ''}</div>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-purple-300/60">No modified POs in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {resp && (
          <p className="mt-3 text-xs text-purple-300/50">Updated {new Date(resp.timestamp).toLocaleString('en-IN')}</p>
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'fuchsia' | 'rose' | 'amber' | 'emerald' }) {
  const tones: Record<string, { border: string; glow: string; value: string; label: string }> = {
    fuchsia: { border: 'border-fuchsia-400/30', glow: 'from-fuchsia-500/20 to-fuchsia-600/0', value: 'text-fuchsia-100', label: 'text-fuchsia-300' },
    rose: { border: 'border-rose-400/30', glow: 'from-rose-500/20 to-rose-600/0', value: 'text-rose-100', label: 'text-rose-300' },
    amber: { border: 'border-amber-400/30', glow: 'from-amber-500/20 to-amber-600/0', value: 'text-amber-100', label: 'text-amber-300' },
    emerald: { border: 'border-emerald-400/30', glow: 'from-emerald-500/20 to-emerald-600/0', value: 'text-emerald-100', label: 'text-emerald-300' },
  };
  const s = tones[tone];
  return (
    <div className={`relative overflow-hidden bg-white/5 backdrop-blur-xl border ${s.border} rounded-2xl p-4`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${s.glow} pointer-events-none`} />
      <div className="relative z-10">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</div>
        <div className={`mt-1.5 text-2xl font-bold ${s.value}`}>{value}</div>
        {sub && <div className="mt-1 text-[11px] text-purple-200/70">{sub}</div>}
      </div>
    </div>
  );
}
