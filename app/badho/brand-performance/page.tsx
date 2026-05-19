'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── CSV utility ─────────────────────────────────────────────────────────
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
function formatAmount(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000)   return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000)     return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount)}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Types ───────────────────────────────────────────────────────────────
interface Cell { count: number; amount: number; }
interface MonthStatusAgg { total: Cell; byDelivery: Record<string, Cell>; }
interface BrandRow {
  brandName: string;
  total: Cell;
  byMonth: Record<number, { total: Cell; byStatus: Record<string, MonthStatusAgg> }>;
}
interface StatusColumn {
  status: string;
  total: Cell;
  deliveryStatuses: { deliveryStatus: string | null; total: Cell }[];
}
interface PivotData {
  brands: BrandRow[];
  months: number[];
  statusColumns: StatusColumn[];
  monthTotals: Record<number, Cell>;
  monthStatusTotals: Record<string, Cell>;
  monthStatusDeliveryTotals: Record<string, Cell>;
  grand: Cell;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
}

// Single sexy palette — keep status color only for the small header pills
// so context isn't lost, but every data cell uses one neutral background and
// pure-white counts so the numbers actually pop.
const STATUS_TONE: Record<string, string> = {
  DELIVERED: 'text-emerald-300',  COMPLETED: 'text-emerald-300',
  REJECTED:  'text-rose-300',     CANCELLED: 'text-amber-300',
  PENDING:   'text-sky-300',      ACCEPTED:  'text-violet-300',
  INVOICED:  'text-fuchsia-300',
};
// Tiny status-tinted pill background for header chips (NOT used on data cells).
const STATUS_PILL_BG: Record<string, string> = {
  DELIVERED: 'bg-emerald-500/15', COMPLETED: 'bg-emerald-500/15',
  REJECTED:  'bg-rose-500/15',    CANCELLED: 'bg-amber-500/15',
  PENDING:   'bg-sky-500/15',     ACCEPTED:  'bg-violet-500/15',
  INVOICED:  'bg-fuchsia-500/15',
};
// All data cells share one quiet background — alternated per row for scannability.
const STATUS_BG: Record<string, string> = {};
const pillBgFor = (s: string) => STATUS_PILL_BG[s] || 'bg-white/10';
// All amounts share a single muted purple so the column doesn't fight the count.
const amountToneFor = (_s: string) => 'text-purple-300/80';
const toneFor = (s: string) => STATUS_TONE[s] || 'text-white';
// Data cells: no status tint. Caller passes a neutral or alternating background.
const bgFor   = (_s: string) => '';

export default function BrandPerformanceDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const currentYear = new Date().getFullYear();
  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [range, setRange] = useState<'year' | '30d' | '7d' | 'today' | 'custom'>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  // Sub-tab switch: 'dashboard' = pivot, 'details' = flat row-level table
  const [bpTab, setBpTab] = useState<'dashboard' | 'details'>('dashboard');
  const [detailsSearch, setDetailsSearch] = useState('');
  const [detailsSort, setDetailsSort] = useState<'orders' | 'gmv' | 'brand' | 'month' | 'status'>('orders');

  const resolveRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (range === '7d') { const s = new Date(today); s.setDate(s.getDate() - 6); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (range === '30d') { const s = new Date(today); s.setDate(s.getDate() - 29); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (range === 'custom') return { startDate: customFrom || null, endDate: customTo || null };
    return { startDate: null, endDate: null };
  };

  const fetchPivot = async () => {
    try {
      setPivotLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      const res = await fetch(`/api/brand-performance/status-pivot?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setPivotData(json);
    } catch (err) {
      console.error('Brand pivot fetch error:', err);
      setPivotData(null);
    } finally {
      setPivotLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchPivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, range, customFrom, customTo]);

  const toggleStatus = (s: string) => {
    setExpandedStatuses((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const visibleBrands = (() => {
    if (!pivotData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pivotData.brands;
    return pivotData.brands.filter((b) => b.brandName.toLowerCase().includes(q));
  })();

  // Per-status sub-column count when expanded (uses the global statusColumns deliveryStatuses union)
  const subColsFor = (sc: StatusColumn) => expandedStatuses.has(sc.status) ? sc.deliveryStatuses.length : 1;
  // Total sub-columns per month (= sum of subColsFor across statuses)
  const subColsPerMonth = (statusColumns: StatusColumn[]) =>
    statusColumns.reduce((s, sc) => s + subColsFor(sc), 0);

  // Cell lookup helpers
  const brandMonthStatusCell = (br: BrandRow, month: number, status: string): Cell | null => {
    const m = br.byMonth[month]; if (!m) return null;
    const s = m.byStatus[status]; if (!s) return null;
    return s.total;
  };
  const brandMonthStatusDeliveryCell = (br: BrandRow, month: number, status: string, deliveryKey: string): Cell | null => {
    const m = br.byMonth[month]; if (!m) return null;
    const s = m.byStatus[status]; if (!s) return null;
    return s.byDelivery[deliveryKey] ?? null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-8 relative overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="absolute top-0 left-1/4 w-[28rem] h-[28rem] bg-fuchsia-500 rounded-full mix-blend-screen filter blur-[120px] opacity-[0.12] animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-[28rem] h-[28rem] bg-indigo-500 rounded-full mix-blend-screen filter blur-[120px] opacity-[0.12] animate-pulse animation-delay-2000" />
      <div className="absolute top-1/3 right-0 w-72 h-72 bg-purple-500 rounded-full mix-blend-screen filter blur-[100px] opacity-[0.08]" />
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-[95%] mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/badho" className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
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
            <button onClick={handleLogout} disabled={isLoggingOut} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50 transition-colors">
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Title — gradient text + glowing underline */}
        <div className="mb-7 relative">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-9 rounded-full bg-gradient-to-b from-fuchsia-400 via-purple-500 to-indigo-500 shadow-[0_0_24px_rgba(217,70,239,0.6)]" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
              Brand Performance
            </h1>
          </div>
          <p className="text-purple-300/70 text-sm ml-4">How every brand stacks up — orders, GMV, and delivery quality across months.</p>
        </div>

        {/* KPI strip — high-level overview */}
        {pivotData && (() => {
          const totalBrands = pivotData.brands.length;
          const liveBrands = pivotData.brands.filter((b) => b.total.count > 0).length;
          const topBrand = pivotData.brands[0];
          const tiles: Array<{ label: string; primary: string; sub: string; accent: string }> = [
            { label: 'Brands with orders', primary: `${liveBrands.toLocaleString('en-IN')}`, sub: `of ${totalBrands} total`, accent: 'from-fuchsia-500/25 to-purple-500/10' },
            { label: 'Total orders',       primary: pivotData.grand.count.toLocaleString('en-IN'), sub: `${pivotData.months.length} month${pivotData.months.length === 1 ? '' : 's'} in scope`, accent: 'from-sky-500/25 to-blue-500/10' },
            { label: 'Total GMV',          primary: formatAmount(pivotData.grand.amount), sub: 'orders × amount', accent: 'from-emerald-500/25 to-teal-500/10' },
            { label: 'Top brand',          primary: topBrand?.brandName ?? '—', sub: topBrand ? `${topBrand.total.count.toLocaleString('en-IN')} orders · ${formatAmount(topBrand.total.amount)}` : '', accent: 'from-amber-500/25 to-orange-500/10' },
          ];
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {tiles.map((t, i) => (
                <div
                  key={i}
                  className={`relative rounded-2xl p-5 bg-gradient-to-br ${t.accent} border border-white/10 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:border-white/30 hover:shadow-[0_0_40px_rgba(217,70,239,0.18)] hover:-translate-y-0.5`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-purple-200/70 font-semibold">{t.label}</div>
                    <div className="text-3xl font-extrabold text-white tabular-nums mt-1.5 truncate" title={t.primary}>{t.primary}</div>
                    <div className="text-[11px] text-purple-200/70 mt-1 truncate" title={t.sub}>{t.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Sub-tab toggle — premium pill switcher */}
        <div className="mb-5 inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)]">
          {([
            { key: 'dashboard', label: 'Dashboard', icon: '▤' },
            { key: 'details',   label: 'Details data', icon: '▥' },
          ] as const).map((t) => {
            const active = bpTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setBpTab(t.key)}
                className={`relative px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 inline-flex items-center gap-2 ${
                  active
                    ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_28px_rgba(217,70,239,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]'
                    : 'text-purple-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className={`text-base leading-none ${active ? 'opacity-90' : 'opacity-60'}`}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {bpTab === 'details' && (
        /* Pivot section — Brand × Month × Status now lives under the Details tab */
        <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-fuchsia-400/40 hover:shadow-[0_0_60px_rgba(217,70,239,0.18)]">
          {/* Gradient top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/80 to-transparent" />
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80 bg-fuchsia-500/15 border border-fuchsia-400/30 rounded-md px-2 py-0.5">PIVOT</span>
                <h2 className="text-2xl font-bold text-white">Brand × Month × Status</h2>
              </div>
              <p className="text-purple-300/80 text-sm mt-2">
                Rows = brand (businessName prefix; ChukDe-GT + ChukDe-NonGT merged). Top columns = month. Sub-columns = status — click any status header to reveal its delivery-status breakdown.
              </p>
            </div>
            {pivotData && (
              <button
                className="group px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_4px_18px_-4px_rgba(217,70,239,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_6px_28px_-4px_rgba(217,70,239,0.7),inset_0_1px_0_rgba(255,255,255,0.3)] transition-shadow"
                onClick={() => {
                  if (!pivotData) return;
                  const headers = ['Brand', 'Month', 'Status', 'Delivery Status', 'Orders', 'GMV'];
                  const rows: CsvCell[][] = [];
                  for (const br of pivotData.brands) {
                    for (const m of pivotData.months) {
                      const monthData = br.byMonth[m];
                      if (!monthData) continue;
                      for (const status of Object.keys(monthData.byStatus)) {
                        const sd = monthData.byStatus[status];
                        for (const dKey of Object.keys(sd.byDelivery)) {
                          const ds = sd.byDelivery[dKey];
                          rows.push([br.brandName, MONTH_NAMES[m - 1] || m, status, dKey === '__NULL__' ? '(no delivery status)' : dKey, ds.count, ds.amount]);
                        }
                      }
                    }
                  }
                  const suffix = pivotData.startDate && pivotData.endDate ? `${pivotData.startDate}_${pivotData.endDate}` : String(pivotData.year ?? currentYear);
                  downloadCSV(`brand-month-status-${suffix}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
          </div>

          {/* Date chips + search */}
          <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Date (markedPendingTime)</span>
            {([
              { key: 'year',   label: `${currentYear} (full year)` },
              { key: '30d',    label: 'Last 30 days' },
              { key: '7d',     label: 'Last 7 days' },
              { key: 'today',  label: 'Today' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = range === opt.key;
              return (
                <button key={opt.key} onClick={() => setRange(opt.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  active ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]' : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                }`}>{opt.label}</button>
              );
            })}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <span className="text-purple-300 text-xs">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand…"
              className="ml-auto px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[220px]"
            />
          </div>

          {/* Status legend / quick expand */}
          {pivotData && pivotData.statusColumns.length > 0 && (
            <div className="px-8 py-2 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap text-[11px]">
              <span className="text-purple-300/70 uppercase tracking-wide font-semibold">Statuses</span>
              {pivotData.statusColumns.map((sc) => {
                const expanded = expandedStatuses.has(sc.status);
                return (
                  <button
                    key={sc.status}
                    onClick={() => toggleStatus(sc.status)}
                    className={`px-2 py-0.5 rounded-md font-semibold ${pillBgFor(sc.status)} ${toneFor(sc.status)} border ${expanded ? 'border-white/30' : 'border-white/10'} hover:border-white/40`}
                  >
                    {expanded ? '▾' : '▸'} {sc.status} <span className="text-purple-300/60 font-normal">({sc.total.count.toLocaleString()})</span>
                  </button>
                );
              })}
              {expandedStatuses.size > 0 && (
                <button onClick={() => setExpandedStatuses(new Set())} className="ml-2 px-2 py-0.5 rounded-md text-rose-200 hover:bg-rose-500/20 border border-rose-400/30">
                  collapse all
                </button>
              )}
            </div>
          )}

          {/* Pivot table */}
          <div className="overflow-auto max-h-[720px]">
            {pivotLoading || !pivotData ? (
              <div className="px-8 py-12 text-center text-purple-300">Loading…</div>
            ) : visibleBrands.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No brands in this slice</div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur">
                  {/* Row 1: month super-headers */}
                  <tr>
                    <th rowSpan={3} className="sticky left-0 z-30 bg-slate-900 border-b border-r border-white/10 px-3 py-3 text-left font-semibold text-purple-200 uppercase tracking-wider min-w-[220px]">
                      Brand
                    </th>
                    {pivotData.months.map((m) => {
                      const totalSubCols = subColsPerMonth(pivotData.statusColumns);
                      return (
                        <th
                          key={`m_${m}`}
                          colSpan={totalSubCols}
                          className="bg-slate-800 border-b border-r border-white/10 px-3 py-2.5 text-center font-bold text-white whitespace-nowrap text-sm"
                        >
                          {MONTH_NAMES[m - 1] || m}
                          <span className="ml-2 text-[11px] text-purple-200/70 font-semibold tabular-nums">
                            {(pivotData.monthTotals[m]?.count ?? 0).toLocaleString('en-IN')} · {formatAmount(pivotData.monthTotals[m]?.amount ?? 0)}
                          </span>
                        </th>
                      );
                    })}
                    <th rowSpan={3} className="sticky right-0 z-30 bg-fuchsia-950 border-b border-l-2 border-fuchsia-400/70 px-4 py-3 text-right font-bold text-fuchsia-100 uppercase tracking-wider min-w-[130px] shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]">
                      Total
                    </th>
                  </tr>
                  {/* Row 2: status sub-headers under each month */}
                  <tr>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.map((sc) => (
                      <th
                        key={`m${m}_${sc.status}`}
                        colSpan={subColsFor(sc)}
                        onClick={() => toggleStatus(sc.status)}
                        className="bg-slate-900 border-b border-r border-white/10 px-3 py-2 text-center cursor-pointer hover:bg-white/10 select-none whitespace-nowrap"
                        title={`Click to ${expandedStatuses.has(sc.status) ? 'collapse' : 'expand'} ${sc.status} delivery-status breakdown`}
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${pillBgFor(sc.status)} ${toneFor(sc.status)} border border-white/10`}>
                          <span className="text-[10px] opacity-70">{expandedStatuses.has(sc.status) ? '▾' : '▸'}</span>{sc.status}
                        </span>
                      </th>
                    )))}
                  </tr>
                  {/* Row 3: delivery-status sub-sub-headers (only for expanded statuses; placeholder cells otherwise) */}
                  <tr>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        return [
                          <th key={`d_${m}_${sc.status}`} className={`${bgFor(sc.status)} border-b border-r border-white/10 px-3 py-1.5 text-[10px] text-purple-300/60 font-medium tracking-wide whitespace-nowrap`}>
                            count · ₹
                          </th>
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, idx) => (
                        <th
                          key={`d_${m}_${sc.status}_${ds.deliveryStatus ?? '_'}_${idx}`}
                          className={`${bgFor(sc.status)} border-b border-r border-white/10 px-3 py-1.5 text-[11px] font-bold ${toneFor(sc.status)} whitespace-nowrap`}
                          title={ds.deliveryStatus ?? '(no delivery status)'}
                        >
                          {ds.deliveryStatus ?? '∅ none'}
                        </th>
                      ));
                    }))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBrands.map((br, idx) => (
                    <tr key={br.brandName} className={`${idx % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'} hover:bg-white/10 transition-colors`}>
                      <td className="sticky left-0 z-10 bg-slate-900 border-b border-r border-white/10 px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-purple-400/60 tabular-nums font-bold w-5 text-right">{idx + 1}</span>
                          <span className="block w-0.5 h-5 rounded-full bg-gradient-to-b from-fuchsia-400/60 to-purple-500/40" />
                          <span className="text-white font-bold text-sm tracking-tight">{br.brandName}</span>
                        </div>
                      </td>
                      {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                        if (!expandedStatuses.has(sc.status)) {
                          const cell = brandMonthStatusCell(br, m, sc.status);
                          if (!cell || cell.count === 0) {
                            return [
                              <td key={`c_${br.brandName}_${m}_${sc.status}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right text-purple-400/40 text-base tabular-nums`}>—</td>
                            ];
                          }
                          return [
                            <td key={`c_${br.brandName}_${m}_${sc.status}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right whitespace-nowrap`}>
                              <div className="text-base font-extrabold tabular-nums leading-tight text-white">{cell.count.toLocaleString('en-IN')}</div>
                              <div className={`text-xs font-semibold tabular-nums mt-0.5 ${amountToneFor(sc.status)}`}>{formatAmount(cell.amount)}</div>
                            </td>
                          ];
                        }
                        return sc.deliveryStatuses.map((ds, dIdx) => {
                          const dKey = ds.deliveryStatus ?? '__NULL__';
                          const cell = brandMonthStatusDeliveryCell(br, m, sc.status, dKey);
                          if (!cell || cell.count === 0) {
                            return (
                              <td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right text-purple-400/40 text-base tabular-nums`}>—</td>
                            );
                          }
                          return (
                            <td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right whitespace-nowrap`}>
                              <div className="text-base font-extrabold tabular-nums leading-tight text-white">{cell.count.toLocaleString('en-IN')}</div>
                              <div className={`text-xs font-semibold tabular-nums mt-0.5 ${amountToneFor(sc.status)}`}>{formatAmount(cell.amount)}</div>
                            </td>
                          );
                        });
                      }))}
                      <td className="sticky right-0 z-10 bg-fuchsia-950 border-b border-l-2 border-fuchsia-400/70 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]">
                        <div className="text-base font-extrabold tabular-nums leading-tight text-white">{br.total.count.toLocaleString('en-IN')}</div>
                        <div className="text-xs font-semibold tabular-nums mt-0.5 text-fuchsia-200">{formatAmount(br.total.amount)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur">
                  <tr>
                    <td className="sticky left-0 z-30 bg-slate-900 border-t border-r border-white/10 px-3 py-3 font-bold text-purple-200 uppercase tracking-wider text-[11px]">
                      Total
                    </td>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        const t = pivotData.monthStatusTotals[`${m}__${sc.status}`] ?? { count: 0, amount: 0 };
                        return [
                          <td key={`t_${m}_${sc.status}`} className={`border-t border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right whitespace-nowrap`}>
                            <div className="text-base font-extrabold tabular-nums leading-tight text-white">{t.count.toLocaleString('en-IN')}</div>
                            <div className={`text-xs font-semibold tabular-nums mt-0.5 ${amountToneFor(sc.status)}`}>{formatAmount(t.amount)}</div>
                          </td>
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, dIdx) => {
                        const dKey = ds.deliveryStatus ?? '__NULL__';
                        const t = pivotData.monthStatusDeliveryTotals[`${m}__${sc.status}__${dKey}`] ?? { count: 0, amount: 0 };
                        return (
                          <td key={`t_${m}_${sc.status}_${dKey}_${dIdx}`} className={`border-t border-r border-white/10 ${bgFor(sc.status)} px-3 py-3 text-right whitespace-nowrap`}>
                            <div className="text-base font-extrabold tabular-nums leading-tight text-white">{t.count.toLocaleString('en-IN')}</div>
                            <div className={`text-xs font-semibold tabular-nums mt-0.5 ${amountToneFor(sc.status)}`}>{formatAmount(t.amount)}</div>
                          </td>
                        );
                      });
                    }))}
                    <td className="sticky right-0 z-30 bg-gradient-to-r from-fuchsia-950 to-purple-950 border-t border-l-2 border-fuchsia-400/70 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]">
                      <div className="text-lg font-extrabold tabular-nums leading-tight text-white">{pivotData.grand.count.toLocaleString('en-IN')}</div>
                      <div className="text-sm font-semibold tabular-nums mt-0.5 text-fuchsia-100">{formatAmount(pivotData.grand.amount)}</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {pivotData && visibleBrands.length > 0 && (
            <div className="px-8 py-2 border-t border-white/10 bg-white/5 text-right text-xs text-purple-300/70">
              {visibleBrands.length} brand{visibleBrands.length === 1 ? '' : 's'} · {pivotData.months.length} month{pivotData.months.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        )}

        {bpTab === 'dashboard' && (
        /* Dashboard — flat row-level table at the (brand, month, status, deliveryStatus) grain */
        <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-fuchsia-400/40 hover:shadow-[0_0_60px_rgba(217,70,239,0.18)]">
          {/* Gradient top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/80 to-transparent" />
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80 bg-sky-500/15 border border-sky-400/30 rounded-md px-2 py-0.5">DETAILS</span>
                <h2 className="text-2xl font-bold text-white">Details data</h2>
              </div>
              <p className="text-purple-300/80 text-sm mt-2">
                Flat row per <span className="font-mono text-fuchsia-300">(brand, month, status, deliveryStatus)</span>. Same WHERE as the pivot, just un-pivoted.
              </p>
            </div>
            {pivotData && (
              <button
                className="group px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_4px_18px_-4px_rgba(217,70,239,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_6px_28px_-4px_rgba(217,70,239,0.7),inset_0_1px_0_rgba(255,255,255,0.3)] transition-shadow"
                onClick={() => {
                  if (!pivotData) return;
                  const headers = ['Brand', 'Month', 'Status', 'Delivery Status', 'Orders', 'GMV'];
                  const rows: CsvCell[][] = [];
                  for (const br of pivotData.brands) {
                    for (const m of pivotData.months) {
                      const md = br.byMonth[m];
                      if (!md) continue;
                      for (const status of Object.keys(md.byStatus)) {
                        const sd = md.byStatus[status];
                        for (const dKey of Object.keys(sd.byDelivery)) {
                          const ds = sd.byDelivery[dKey];
                          rows.push([br.brandName, MONTH_NAMES[m - 1] || m, status, dKey === '__NULL__' ? '(no delivery status)' : dKey, ds.count, ds.amount]);
                        }
                      }
                    }
                  }
                  const suffix = pivotData.startDate && pivotData.endDate ? `${pivotData.startDate}_${pivotData.endDate}` : String(pivotData.year ?? currentYear);
                  downloadCSV(`brand-performance-details-${suffix}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
          </div>

          {/* Date chips (same as Dashboard for symmetry) + search */}
          <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Date (markedPendingTime)</span>
            {([
              { key: 'year',   label: `${currentYear} (full year)` },
              { key: '30d',    label: 'Last 30 days' },
              { key: '7d',     label: 'Last 7 days' },
              { key: 'today',  label: 'Today' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = range === opt.key;
              return (
                <button key={opt.key} onClick={() => setRange(opt.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  active ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]' : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                }`}>{opt.label}</button>
              );
            })}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <span className="text-purple-300 text-xs">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            )}
            <input
              type="text"
              value={detailsSearch}
              onChange={(e) => setDetailsSearch(e.target.value)}
              placeholder="Search brand / status / delivery…"
              className="ml-auto px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[260px]"
            />
          </div>

          {/* Flat table */}
          <div className="overflow-auto max-h-[720px]">
            {pivotLoading || !pivotData ? (
              <div className="px-8 py-12 text-center text-purple-300">Loading…</div>
            ) : (() => {
              // Flatten pivot into one row per (brand, month, status, deliveryStatus)
              type DetailRow = { brandName: string; month: number; status: string; deliveryStatus: string | null; count: number; amount: number; };
              const flat: DetailRow[] = [];
              for (const br of pivotData.brands) {
                for (const m of pivotData.months) {
                  const md = br.byMonth[m];
                  if (!md) continue;
                  for (const status of Object.keys(md.byStatus)) {
                    const sd = md.byStatus[status];
                    for (const dKey of Object.keys(sd.byDelivery)) {
                      const ds = sd.byDelivery[dKey];
                      flat.push({ brandName: br.brandName, month: m, status, deliveryStatus: dKey === '__NULL__' ? null : dKey, count: ds.count, amount: ds.amount });
                    }
                  }
                }
              }
              const q = detailsSearch.trim().toLowerCase();
              let filtered = flat;
              if (q) {
                filtered = filtered.filter((r) =>
                  r.brandName.toLowerCase().includes(q) ||
                  r.status.toLowerCase().includes(q) ||
                  (r.deliveryStatus || '').toLowerCase().includes(q)
                );
              }
              const sorted = [...filtered].sort((a, b) => {
                if (detailsSort === 'orders') return b.count - a.count;
                if (detailsSort === 'gmv')    return b.amount - a.amount;
                if (detailsSort === 'brand')  return a.brandName.localeCompare(b.brandName);
                if (detailsSort === 'month')  return a.month - b.month;
                if (detailsSort === 'status') return a.status.localeCompare(b.status);
                return 0;
              });
              if (sorted.length === 0) {
                return <div className="px-8 py-12 text-center text-purple-300">No rows</div>;
              }
              const totalOrders = filtered.reduce((s, r) => s + r.count, 0);
              const totalGmv    = filtered.reduce((s, r) => s + r.amount, 0);
              const ind = (col: typeof detailsSort) => detailsSort === col ? ' ↓' : '';
              return (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10">
                    <tr>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider w-12">#</th>
                      <th onClick={() => setDetailsSort('brand')}  className="px-4 py-3 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white">Brand{ind('brand')}</th>
                      <th onClick={() => setDetailsSort('month')}  className="px-3 py-3 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white">Month{ind('month')}</th>
                      <th onClick={() => setDetailsSort('status')} className="px-3 py-3 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white">Status{ind('status')}</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider">Delivery Status</th>
                      <th onClick={() => setDetailsSort('orders')} className="px-3 py-3 text-right text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white">Orders{ind('orders')}</th>
                      <th onClick={() => setDetailsSort('gmv')}    className="px-3 py-3 text-right text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white">GMV{ind('gmv')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={`${r.brandName}__${r.month}__${r.status}__${r.deliveryStatus ?? '_'}__${i}`} className={`border-b border-white/5 hover:bg-white/10 transition-colors ${i % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'}`}>
                        <td className="px-3 py-2.5 text-purple-300/60 tabular-nums w-12">{i + 1}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="block w-0.5 h-4 rounded-full bg-gradient-to-b from-fuchsia-400/60 to-purple-500/40" />
                            <span className="text-white font-bold text-sm tracking-tight">{r.brandName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-purple-200 whitespace-nowrap">{MONTH_NAMES[r.month - 1] || r.month}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${pillBgFor(r.status)} ${toneFor(r.status)} border border-white/10`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-purple-200 whitespace-nowrap">{r.deliveryStatus || <span className="italic text-purple-400/60">(none)</span>}</td>
                        <td className="px-3 py-2.5 text-right text-base font-extrabold tabular-nums text-white">{r.count.toLocaleString('en-IN')}</td>
                        <td className={`px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${amountToneFor(r.status)}`}>{formatAmount(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-900/95 backdrop-blur border-t border-white/10">
                    <tr>
                      <td className="px-3 py-3" />
                      <td className="px-4 py-3 text-purple-200 font-bold uppercase text-[11px] tracking-wider">Filtered total</td>
                      <td className="px-3 py-3 text-purple-300/70 text-xs">{filtered.length} rows</td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right text-base font-extrabold tabular-nums text-white">{totalOrders.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-fuchsia-200">{formatAmount(totalGmv)}</td>
                    </tr>
                  </tfoot>
                </table>
              );
            })()}
          </div>
        </div>
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
