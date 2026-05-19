'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── CSV utility (same shape as order-dashboard) ─────────────────────────
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

// ─── Types ───────────────────────────────────────────────────────────────
interface Cell { count: number; amount: number; }
interface DeliveryAgg { deliveryStatus: string | null; total: Cell; }
interface StatusAgg { status: string; total: Cell; deliveryStatuses: DeliveryAgg[]; }
interface BrandRow { brandName: string; total: Cell; byStatus: StatusAgg[]; }
interface StatusColumn { status: string; total: Cell; deliveryStatuses: DeliveryAgg[]; }
interface PivotData {
  brands: BrandRow[];
  statusColumns: StatusColumn[];
  grand: Cell;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
}

const STATUS_TONE: Record<string, string> = {
  DELIVERED: 'text-emerald-200',
  COMPLETED: 'text-emerald-200',
  REJECTED:  'text-rose-200',
  CANCELLED: 'text-amber-200',
  PENDING:   'text-sky-200',
  ACCEPTED:  'text-purple-200',
  INVOICED:  'text-fuchsia-200',
};
const STATUS_BG: Record<string, string> = {
  DELIVERED: 'bg-emerald-500/5',
  COMPLETED: 'bg-emerald-500/5',
  REJECTED:  'bg-rose-500/5',
  CANCELLED: 'bg-amber-500/5',
  PENDING:   'bg-sky-500/5',
  ACCEPTED:  'bg-purple-500/5',
  INVOICED:  'bg-fuchsia-500/5',
};
const toneFor = (s: string) => STATUS_TONE[s] || 'text-white';
const bgFor   = (s: string) => STATUS_BG[s] || 'bg-white/5';

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

  // ─── Data + filters ─────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [range, setRange] = useState<'year' | '30d' | '7d' | 'today' | 'custom'>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const resolveRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (range === '7d') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (range === '30d') {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (range === 'custom') return { startDate: customFrom || null, endDate: customTo || null };
    return { startDate: null, endDate: null }; // year
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
    setExpandedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  // Filter brand rows by search
  const visibleBrands = (() => {
    if (!pivotData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pivotData.brands;
    return pivotData.brands.filter((b) => b.brandName.toLowerCase().includes(q));
  })();

  // Helper: lookup a brand's stat for a given (status, deliveryStatus or null)
  const cellFor = (brand: BrandRow, status: string, deliveryStatus: string | null | undefined): Cell | null => {
    const st = brand.byStatus.find((s) => s.status === status);
    if (!st) return null;
    if (deliveryStatus === undefined) return st.total; // status total
    const ds = st.deliveryStatuses.find((d) => (d.deliveryStatus ?? null) === deliveryStatus);
    return ds ? ds.total : { count: 0, amount: 0 };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

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

        {/* Title */}
        <div className="mb-5">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Brand Performance Dashboard
          </h1>
        </div>

        {/* Pivot section */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Brand × Order Status</h2>
              <p className="text-purple-300 text-sm mt-1">
                Rows = brand (businessName prefix; ChukDe-GT + ChukDe-NonGT merged). Click any status column header to reveal its delivery-status breakdown.
              </p>
            </div>
            {pivotData && (
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)] hover:shadow-[0_0_24px_rgba(217,70,239,0.6)]"
                onClick={() => {
                  if (!pivotData) return;
                  // Flat CSV: one row per (brand, status, deliveryStatus)
                  const headers = ['Brand', 'Status', 'Delivery Status', 'Orders', 'GMV'];
                  const rows: CsvCell[][] = [];
                  for (const br of pivotData.brands) {
                    for (const st of br.byStatus) {
                      for (const ds of st.deliveryStatuses) {
                        rows.push([br.brandName, st.status, ds.deliveryStatus ?? '(no delivery status)', ds.total.count, ds.total.amount]);
                      }
                    }
                  }
                  const suffix = pivotData.startDate && pivotData.endDate
                    ? `${pivotData.startDate}_${pivotData.endDate}`
                    : String(pivotData.year ?? currentYear);
                  downloadCSV(`brand-status-pivot-${suffix}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
          </div>

          {/* Date chips */}
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
                  active
                    ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                    : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                }`}>
                  {opt.label}
                </button>
              );
            })}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                <span className="text-purple-300 text-xs">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
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

          {/* Pivot table */}
          <div className="overflow-x-auto">
            {pivotLoading || !pivotData ? (
              <div className="px-8 py-12 text-center text-purple-300">Loading…</div>
            ) : visibleBrands.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No brands in this slice</div>
            ) : (
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                  {/* Row 1: status column headers (with expand toggle) */}
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-20 bg-slate-900 border-b border-r border-white/10 px-3 py-3 text-left font-semibold text-purple-200 uppercase tracking-wider min-w-[220px]">
                      Brand
                    </th>
                    {pivotData.statusColumns.map((sc) => {
                      const expanded = expandedStatuses.has(sc.status);
                      const subCount = sc.deliveryStatuses.length;
                      return (
                        <th
                          key={sc.status}
                          colSpan={expanded ? subCount : 1}
                          onClick={() => toggleStatus(sc.status)}
                          className={`border-b border-r border-white/10 px-3 py-3 text-center font-semibold ${toneFor(sc.status)} cursor-pointer hover:bg-white/10 select-none whitespace-nowrap`}
                          title={`Click to ${expanded ? 'collapse' : 'expand'} delivery-status breakdown`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] opacity-70">{expanded ? '▾' : '▸'}</span>
                            <span>{sc.status}</span>
                            <span className="text-[10px] text-purple-300/60 font-normal">({sc.total.count.toLocaleString()})</span>
                          </div>
                        </th>
                      );
                    })}
                    <th rowSpan={2} className="sticky right-0 z-20 bg-fuchsia-900/30 border-b border-l-2 border-fuchsia-400/40 px-3 py-3 text-right font-semibold text-fuchsia-200 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                  {/* Row 2: sub-headers for expanded statuses (delivery status names) */}
                  <tr>
                    {pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        return [
                          <th key={`${sc.status}_sub_collapsed`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-1.5 text-[9px] text-purple-300/60 font-normal uppercase tracking-wider whitespace-nowrap`}>
                            count · ₹
                          </th>,
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, idx) => (
                        <th
                          key={`${sc.status}_${ds.deliveryStatus ?? '_'}_${idx}`}
                          className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-1.5 text-[9px] font-semibold ${toneFor(sc.status)} uppercase tracking-wider whitespace-nowrap`}
                          title={ds.deliveryStatus ?? '(no delivery status)'}
                        >
                          <div className="font-bold text-[10px]">{ds.deliveryStatus ?? '∅ none'}</div>
                          <div className="text-[9px] text-purple-300/60 font-normal mt-0.5">{ds.total.count.toLocaleString()} · {formatAmount(ds.total.amount)}</div>
                        </th>
                      ));
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleBrands.map((br, idx) => (
                    <tr key={br.brandName} className="hover:bg-white/5">
                      <td className="sticky left-0 z-10 bg-slate-900 border-b border-r border-white/10 px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-purple-300/60 tabular-nums w-6">{idx + 1}</span>
                          <span className="text-white font-semibold">{br.brandName}</span>
                        </div>
                      </td>
                      {pivotData.statusColumns.flatMap((sc) => {
                        if (!expandedStatuses.has(sc.status)) {
                          const cell = cellFor(br, sc.status, undefined);
                          if (!cell || cell.count === 0) {
                            return [
                              <td key={`${br.brandName}_${sc.status}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-2 text-right text-purple-400/30 tabular-nums`}>—</td>,
                            ];
                          }
                          return [
                            <td key={`${br.brandName}_${sc.status}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-2 text-right whitespace-nowrap`}>
                              <div className={`font-bold tabular-nums ${toneFor(sc.status)}`}>{cell.count.toLocaleString()}</div>
                              <div className="text-[10px] text-purple-300/70 tabular-nums">{formatAmount(cell.amount)}</div>
                            </td>,
                          ];
                        }
                        return sc.deliveryStatuses.map((ds, dIdx) => {
                          const cell = cellFor(br, sc.status, ds.deliveryStatus ?? null);
                          if (!cell || cell.count === 0) {
                            return (
                              <td key={`${br.brandName}_${sc.status}_${ds.deliveryStatus ?? '_'}_${dIdx}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-2 text-right text-purple-400/30 tabular-nums`}>—</td>
                            );
                          }
                          return (
                            <td key={`${br.brandName}_${sc.status}_${ds.deliveryStatus ?? '_'}_${dIdx}`} className={`border-b border-r border-white/10 ${bgFor(sc.status)} px-2 py-2 text-right whitespace-nowrap`}>
                              <div className={`font-bold tabular-nums ${toneFor(sc.status)}`}>{cell.count.toLocaleString()}</div>
                              <div className="text-[10px] text-purple-300/70 tabular-nums">{formatAmount(cell.amount)}</div>
                            </td>
                          );
                        });
                      })}
                      <td className="sticky right-0 z-10 bg-fuchsia-900/20 border-b border-l-2 border-fuchsia-400/40 px-3 py-2 text-right whitespace-nowrap">
                        <div className="font-bold tabular-nums text-white">{br.total.count.toLocaleString()}</div>
                        <div className="text-[10px] text-fuchsia-200/80 tabular-nums">{formatAmount(br.total.amount)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-900/95 backdrop-blur">
                  <tr>
                    <td className="sticky left-0 z-10 bg-slate-900 border-t border-r border-white/10 px-3 py-3 font-bold text-purple-200 uppercase tracking-wider text-[11px]">
                      Total
                    </td>
                    {pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        return [
                          <td key={`tot_${sc.status}`} className={`border-t border-r border-white/10 ${bgFor(sc.status)} px-2 py-3 text-right whitespace-nowrap`}>
                            <div className={`font-bold tabular-nums ${toneFor(sc.status)}`}>{sc.total.count.toLocaleString()}</div>
                            <div className="text-[10px] text-purple-300/70 tabular-nums">{formatAmount(sc.total.amount)}</div>
                          </td>,
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, dIdx) => (
                        <td key={`tot_${sc.status}_${ds.deliveryStatus ?? '_'}_${dIdx}`} className={`border-t border-r border-white/10 ${bgFor(sc.status)} px-2 py-3 text-right whitespace-nowrap`}>
                          <div className={`font-bold tabular-nums ${toneFor(sc.status)}`}>{ds.total.count.toLocaleString()}</div>
                          <div className="text-[10px] text-purple-300/70 tabular-nums">{formatAmount(ds.total.amount)}</div>
                        </td>
                      ));
                    })}
                    <td className="sticky right-0 z-10 bg-fuchsia-900/30 border-t border-l-2 border-fuchsia-400/40 px-3 py-3 text-right whitespace-nowrap">
                      <div className="font-bold tabular-nums text-white">{pivotData.grand.count.toLocaleString()}</div>
                      <div className="text-[10px] text-fuchsia-200 tabular-nums">{formatAmount(pivotData.grand.amount)}</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {pivotData && visibleBrands.length > 0 && (
            <div className="px-8 py-2 border-t border-white/10 bg-white/5 text-right text-xs text-purple-300/70">
              {visibleBrands.length} brand{visibleBrands.length === 1 ? '' : 's'}
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

// Fragment is imported but tree-shaken if unused; keeping for future row expansion patterns.
const _unused = Fragment;
void _unused;
