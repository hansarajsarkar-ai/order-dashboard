'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface DraftOrderRow {
  poNumber: string | number | null;
  amount: string | number | null;
  status: string;
  created_at: string;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
}

interface ApiResponse {
  rows: DraftOrderRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    startDate: string;
    endDate: string;
    poNumber: string;
    buyer: string;
    seller: string;
    minAmount: number | null;
    maxAmount: number | null;
    sortBy: string;
    sortOrder: string;
  };
  timestamp: string;
}

type SortBy = 'created_at' | 'amount' | 'poNumber' | 'buyer' | 'seller';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'created_at', label: 'Created At' },
  { key: 'amount',     label: 'Amount' },
  { key: 'poNumber',   label: 'PO Number' },
  { key: 'buyer',      label: 'Buyer' },
  { key: 'seller',     label: 'Seller' },
];

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatAmount(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return INR.format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultDates(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: ymd(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
    endDate:   ymd(today),
  };
}

interface FilterState {
  startDate: string;
  endDate: string;
  poNumber: string;
  buyer: string;
  seller: string;
  minAmount: string;
  maxAmount: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
}

function readState(params: URLSearchParams): FilterState {
  const def = defaultDates();
  const sortByParam = (params.get('sortBy') || 'created_at') as SortBy;
  const sortByOk = SORT_OPTIONS.some((o) => o.key === sortByParam);
  return {
    startDate: params.get('startDate') || def.startDate,
    endDate:   params.get('endDate')   || def.endDate,
    poNumber:  params.get('poNumber')  || '',
    buyer:     params.get('buyer')     || '',
    seller:    params.get('seller')    || '',
    minAmount: params.get('minAmount') || '',
    maxAmount: params.get('maxAmount') || '',
    sortBy:    sortByOk ? sortByParam : 'created_at',
    sortOrder: (params.get('sortOrder') || 'desc') as SortOrder === 'asc' ? 'asc' : 'desc',
    page:      Math.max(1, Number(params.get('page')) || 1),
    pageSize:  PAGE_SIZE_OPTIONS.includes(Number(params.get('pageSize')))
                 ? Number(params.get('pageSize')) : 50,
  };
}

function stateToQuery(s: FilterState): string {
  const def = defaultDates();
  const qs = new URLSearchParams();
  if (s.startDate !== def.startDate) qs.set('startDate', s.startDate);
  if (s.endDate   !== def.endDate)   qs.set('endDate',   s.endDate);
  if (s.poNumber) qs.set('poNumber', s.poNumber);
  if (s.buyer)    qs.set('buyer',    s.buyer);
  if (s.seller)   qs.set('seller',   s.seller);
  if (s.minAmount) qs.set('minAmount', s.minAmount);
  if (s.maxAmount) qs.set('maxAmount', s.maxAmount);
  if (s.sortBy   !== 'created_at') qs.set('sortBy',   s.sortBy);
  if (s.sortOrder !== 'desc')      qs.set('sortOrder', s.sortOrder);
  if (s.page     !== 1)            qs.set('page',     String(s.page));
  if (s.pageSize !== 50)           qs.set('pageSize', String(s.pageSize));
  return qs.toString();
}

function stateToApiQuery(s: FilterState): string {
  const qs = new URLSearchParams();
  qs.set('startDate', s.startDate);
  qs.set('endDate',   s.endDate);
  if (s.poNumber) qs.set('poNumber', s.poNumber);
  if (s.buyer)    qs.set('buyer',    s.buyer);
  if (s.seller)   qs.set('seller',   s.seller);
  if (s.minAmount) qs.set('minAmount', s.minAmount);
  if (s.maxAmount) qs.set('maxAmount', s.maxAmount);
  qs.set('sortBy',    s.sortBy);
  qs.set('sortOrder', s.sortOrder);
  qs.set('page',      String(s.page));
  qs.set('pageSize',  String(s.pageSize));
  return qs.toString();
}

export default function OrderPlaceDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-purple-200 text-sm">Loading…</div>
        </div>
      }
    >
      <OrderPlaceDashboard />
    </Suspense>
  );
}

function OrderPlaceDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [filters, setFilters] = useState<FilterState>(() => readState(new URLSearchParams()));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePo, setActivePo] = useState<string | null>(null);

  // Initialize filters from URL once on mount and whenever URL changes via back/forward.
  useEffect(() => {
    setFilters(readState(new URLSearchParams(searchParams?.toString() ?? '')));
  }, [searchParams]);

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

  // Push filter state into the URL (replace, not push, so back-button isn't spammed).
  const lastQueryRef = useRef('');
  useEffect(() => {
    if (!authChecked) return;
    const q = stateToQuery(filters);
    if (q === lastQueryRef.current) return;
    lastQueryRef.current = q;
    router.replace(q ? `?${q}` : '?', { scroll: false });
  }, [filters, authChecked, router]);

  const fetchData = useCallback(async (s: FilterState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/order-place/draft-orders?${stateToApiQuery(s)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce fetches so typing into a text input doesn't spam the API.
  useEffect(() => {
    if (!authChecked) return;
    const t = setTimeout(() => fetchData(filters), 250);
    return () => clearTimeout(t);
  }, [filters, authChecked, fetchData]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const setF = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value } as FilterState;
      // Any filter change resets to page 1 — except changing page itself.
      if (key !== 'page' && key !== 'pageSize') next.page = 1;
      return next;
    });
  };

  const clearFilters = () => {
    const def = defaultDates();
    setFilters({
      startDate: def.startDate, endDate: def.endDate,
      poNumber: '', buyer: '', seller: '',
      minAmount: '', maxAmount: '',
      sortBy: 'created_at', sortOrder: 'desc',
      page: 1, pageSize: filters.pageSize,
    });
  };

  const setDatePreset = (days: number) => {
    const today = new Date();
    setFilters((prev) => ({
      ...prev,
      startDate: ymd(new Date(today.getTime() - days * 24 * 60 * 60 * 1000)),
      endDate:   ymd(today),
      page: 1,
    }));
  };

  const activeFilterCount = useMemo(() => {
    const def = defaultDates();
    let n = 0;
    if (filters.startDate !== def.startDate || filters.endDate !== def.endDate) n++;
    if (filters.poNumber) n++;
    if (filters.buyer) n++;
    if (filters.seller) n++;
    if (filters.minAmount) n++;
    if (filters.maxAmount) n++;
    if (filters.sortBy !== 'created_at' || filters.sortOrder !== 'desc') n++;
    return n;
  }, [filters]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startIdx = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const endIdx   = total === 0 ? 0 : Math.min(filters.page * filters.pageSize, total);

  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages));
    if (next !== filters.page) setF('page', next);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/30 transition-colors';
  const labelClass = 'text-[11px] font-semibold uppercase tracking-wider text-purple-300/80 mb-1';
  const presetBtn = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${active ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'bg-white/5 text-purple-200 border border-white/10 hover:bg-white/10'}`;

  const def = defaultDates();
  const daysDiff = (() => {
    const a = new Date(filters.startDate).getTime();
    const b = new Date(filters.endDate).getTime();
    return Math.round((b - a) / (24 * 60 * 60 * 1000));
  })();
  const today = ymd(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4 py-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="mx-auto relative z-10" style={{ maxWidth: '1920px' }}>
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
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
        <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Order Place Dashboard
            </h1>
            <p className="text-purple-200/80 text-sm mt-1">
              D2R brand-seller purchase orders still in <span className="font-semibold text-fuchsia-300">DRAFT</span>.
              Window: <span className="font-mono">{filters.startDate}</span> → <span className="font-mono">{filters.endDate}</span> ({daysDiff} days).
            </p>
          </div>
          <button
            onClick={() => fetchData(filters)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/30 text-fuchsia-100 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">Date preset</span>
              {[
                { label: 'Today', days: 0 },
                { label: '7d',  days: 7 },
                { label: '30d', days: 30 },
                { label: '90d', days: 90 },
              ].map((p) => {
                const active = filters.startDate === ymd(new Date(Date.now() - p.days * 24 * 60 * 60 * 1000))
                            && filters.endDate === today;
                return (
                  <button key={p.label} onClick={() => setDatePreset(p.days)} className={presetBtn(active)}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <>
                  <span className="text-[11px] text-fuchsia-300 font-semibold">
                    {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={clearFilters}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25"
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            <div>
              <div className={labelClass}>Start date</div>
              <input type="date" value={filters.startDate} onChange={(e) => setF('startDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>End date</div>
              <input type="date" value={filters.endDate} onChange={(e) => setF('endDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>PO Number</div>
              <input type="text" value={filters.poNumber} onChange={(e) => setF('poNumber', e.target.value)} placeholder="e.g. 145119" className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>Buyer (name / phone)</div>
              <input type="text" value={filters.buyer} onChange={(e) => setF('buyer', e.target.value)} placeholder="Cloud kichen" className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>Seller (name / phone)</div>
              <input type="text" value={filters.seller} onChange={(e) => setF('seller', e.target.value)} placeholder="ChukDe" className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>Min amount (₹)</div>
              <input type="number" inputMode="decimal" value={filters.minAmount} onChange={(e) => setF('minAmount', e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>Max amount (₹)</div>
              <input type="number" inputMode="decimal" value={filters.maxAmount} onChange={(e) => setF('maxAmount', e.target.value)} placeholder="10000" className={inputClass} />
            </div>
            <div>
              <div className={labelClass}>Sort</div>
              <div className="flex gap-1.5">
                <select value={filters.sortBy} onChange={(e) => setF('sortBy', e.target.value as SortBy)} className={`${inputClass} flex-1`}>
                  {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key} className="bg-slate-900">{o.label}</option>)}
                </select>
                <button
                  onClick={() => setF('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-purple-100 text-xs font-bold hover:bg-white/10"
                  title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {filters.sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-white/10">
            <div className="text-sm text-purple-100">
              {loading && !data ? (
                <span className="text-purple-300/70">Loading…</span>
              ) : error ? (
                <span className="text-rose-300">Error</span>
              ) : (
                <>
                  Showing <span className="font-bold text-white">{startIdx.toLocaleString('en-IN')}</span>
                  <span className="text-purple-300/70">–</span>
                  <span className="font-bold text-white">{endIdx.toLocaleString('en-IN')}</span>
                  <span className="text-purple-300/70"> of </span>
                  <span className="font-bold text-fuchsia-300">{total.toLocaleString('en-IN')}</span>
                  <span className="text-purple-300/70"> matching DRAFT orders</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-purple-300/60 flex items-center gap-3">
              {loading && data && <span className="text-fuchsia-300 animate-pulse">refreshing…</span>}
              {data?.timestamp && <span>Updated {new Date(data.timestamp).toLocaleTimeString('en-IN')}</span>}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 text-rose-200 text-sm bg-rose-500/10 border-b border-rose-400/30">
              Failed to load: {error}
            </div>
          )}

          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                <tr className="text-purple-200 uppercase text-xs">
                  <th className="px-4 py-3 text-left whitespace-nowrap">PO Number</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Created At</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Buyer</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Buyer Phone</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Seller</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Seller Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.poNumber ?? 'po'}-${i}`} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                      {r.poNumber != null ? (
                        <button
                          onClick={() => setActivePo(String(r.poNumber))}
                          className="text-fuchsia-100 hover:text-white hover:underline decoration-fuchsia-400/60 underline-offset-4 transition-colors"
                          title="View items in this PO"
                        >
                          {r.poNumber}
                        </button>
                      ) : (
                        <span className="text-fuchsia-100">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white whitespace-nowrap">{formatAmount(r.amount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-purple-100 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-white">{r.buyerBusinessName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-purple-200 tabular-nums whitespace-nowrap">
                      {r.buyerPhone ? <a href={`tel:${r.buyerPhone}`} className="hover:text-fuchsia-300">{r.buyerPhone}</a> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-white">{r.sellerBusinessName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-purple-200 tabular-nums whitespace-nowrap">
                      {r.sellerPhone ? <a href={`tel:${r.sellerPhone}`} className="hover:text-fuchsia-300">{r.sellerPhone}</a> : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-purple-300/70">
                      No DRAFT purchase orders match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between gap-3 flex-wrap p-3 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-purple-200">
              <span>Rows per page</span>
              <select
                value={filters.pageSize}
                onChange={(e) => setFilters((prev) => ({ ...prev, pageSize: Number(e.target.value), page: 1 }))}
                className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-fuchsia-400/50"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n} className="bg-slate-900">{n}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={() => goToPage(1)}                       disabled={filters.page <= 1}            className={pagerBtn(filters.page <= 1)}>«</button>
              <button onClick={() => goToPage(filters.page - 1)}         disabled={filters.page <= 1}            className={pagerBtn(filters.page <= 1)}>‹ Prev</button>
              <span className="px-3 py-1.5 text-xs text-purple-100">
                Page <span className="font-bold text-white">{filters.page}</span> of <span className="font-bold text-white">{totalPages.toLocaleString('en-IN')}</span>
              </span>
              <button onClick={() => goToPage(filters.page + 1)}         disabled={filters.page >= totalPages}   className={pagerBtn(filters.page >= totalPages)}>Next ›</button>
              <button onClick={() => goToPage(totalPages)}               disabled={filters.page >= totalPages}   className={pagerBtn(filters.page >= totalPages)}>»</button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const p = Number(fd.get('jump'));
                if (Number.isFinite(p)) goToPage(p);
              }}
              className="flex items-center gap-1.5"
            >
              <span className="text-xs text-purple-200">Jump to</span>
              <input name="jump" type="number" min={1} max={totalPages} defaultValue={filters.page} className="w-16 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-fuchsia-400/50" />
              <button type="submit" className="px-2 py-1 rounded-md bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-100 text-xs font-semibold hover:bg-fuchsia-500/40">Go</button>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>

      {activePo && <PoItemsModal poNumber={activePo} onClose={() => setActivePo(null)} />}
    </div>
  );
}

interface PoSummary {
  poId: string;
  poNumber: string | number | null;
  amount: string | null;
  status: string;
  created_at: string;
  buyerBusinessName: string | null;
  buyerPhone: string | null;
  sellerBusinessName: string | null;
  sellerPhone: string | null;
}

interface PoItem {
  itemId: string;
  brandSKUId: string | null;
  skuLabel: string | null;
  brandLabel: string | null;
  size: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  status: string | null;
}

interface PoItemsResponse {
  po: PoSummary;
  items: PoItem[];
  itemCount: number;
  totalQuantity: number;
  totalItemAmount: number;
}

function PoItemsModal({ poNumber, onClose }: { poNumber: string; onClose: () => void }) {
  const [data, setData] = useState<PoItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/order-place/po-items?poNumber=${encodeURIComponent(poNumber)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json as PoItemsResponse);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [poNumber]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const po = data?.po;
  const items = data?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[90vh] bg-gradient-to-br from-slate-900 via-purple-950/80 to-slate-900 border border-fuchsia-400/30 rounded-2xl shadow-[0_0_60px_rgba(217,70,239,0.25)] overflow-hidden flex flex-col"
        style={{ maxWidth: '1100px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">PO</span>
              <span className="font-mono text-xl font-bold text-fuchsia-200">{poNumber}</span>
              {po && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                  {po.status}
                </span>
              )}
            </div>
            {po && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-purple-200/90">
                <div>
                  <span className="text-purple-400/70">Buyer:</span>{' '}
                  <span className="text-white font-medium">{po.buyerBusinessName ?? '—'}</span>
                  {po.buyerPhone && <span className="text-purple-300/70 tabular-nums"> · {po.buyerPhone}</span>}
                </div>
                <div>
                  <span className="text-purple-400/70">Seller:</span>{' '}
                  <span className="text-white font-medium">{po.sellerBusinessName ?? '—'}</span>
                  {po.sellerPhone && <span className="text-purple-300/70 tabular-nums"> · {po.sellerPhone}</span>}
                </div>
                <div>
                  <span className="text-purple-400/70">Created:</span>{' '}
                  <span className="text-purple-100">{formatDate(po.created_at)}</span>
                </div>
                <div>
                  <span className="text-purple-400/70">PO total:</span>{' '}
                  <span className="text-white font-semibold tabular-nums">{formatAmount(po.amount)}</span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-200 hover:text-white text-lg leading-none flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <div className="px-6 py-12 text-center text-purple-300/70 text-sm">Loading items…</div>
          )}
          {error && !loading && (
            <div className="px-6 py-6 text-rose-200 text-sm bg-rose-500/10 border-b border-rose-400/30">
              Failed to load: {error}
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="px-6 py-12 text-center text-purple-300/70 text-sm">
              No items recorded against this PO.
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                <tr className="text-purple-200 uppercase text-xs">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Brand</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Item Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.itemId} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2.5 text-purple-300/70 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 text-purple-100">{it.brandLabel ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white">{it.skuLabel ?? '—'}</td>
                    <td className="px-4 py-2.5 text-purple-200">{it.size ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{it.quantity ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">{formatAmount(it.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white font-semibold">{formatAmount(it.amount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-purple-200 border border-white/10">
                        {it.status ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && data && items.length > 0 && (
          <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap text-xs">
            <div className="text-purple-200">
              <span className="font-bold text-white">{data.itemCount}</span>
              <span className="text-purple-300/70"> items · </span>
              <span className="font-bold text-white">{data.totalQuantity.toLocaleString('en-IN')}</span>
              <span className="text-purple-300/70"> qty · sum of line amounts </span>
              <span className="font-bold text-white">{formatAmount(data.totalItemAmount)}</span>
            </div>
            <div className="text-purple-300/60">
              PO total {formatAmount(data.po.amount)}
              {Math.abs(Number(data.po.amount ?? 0) - data.totalItemAmount) > 0.5 && (
                <span className="ml-2 text-amber-300">(differs from line sum)</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function pagerBtn(disabled: boolean): string {
  return `px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
    disabled
      ? 'bg-white/5 border-white/5 text-purple-400/40 cursor-not-allowed'
      : 'bg-white/5 border-white/10 text-purple-100 hover:bg-white/10 hover:border-fuchsia-400/40'
  }`;
}
