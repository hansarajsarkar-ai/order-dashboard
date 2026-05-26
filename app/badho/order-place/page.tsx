'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [showCreate, setShowCreate] = useState(false);

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
              D2R brand-seller purchase orders still in <span className="font-semibold text-fuchsia-300">DRAFT</span> over the last <span className="font-semibold text-fuchsia-300">30 days</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 bg-[length:200%_100%] hover:bg-[position:100%_0] border border-emerald-200 text-emerald-950 text-xs font-extrabold uppercase tracking-wider shadow-md shadow-emerald-300/40 hover:shadow-lg hover:shadow-emerald-300/60 transition-all"
            >
              + Create new PO
            </button>
            <button
              onClick={() => fetchData(filters)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/30 text-fuchsia-100 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Filter bar — date window is hard-coded to the last 30 days
            (the only window worth surfacing in this dashboard). All other
            filters remain user-editable below. */}
        <div className="mb-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
              <span className="text-[11px] text-fuchsia-300 font-semibold">
                {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={clearFilters}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25"
              >
                Clear all
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            <div>
              <div className={labelClass}>PO Number</div>
              <input
                type="text"
                value={filters.poNumber}
                onChange={(e) => setF('poNumber', e.target.value)}
                onKeyDown={(e) => {
                  // Quick-open: digits-only + Enter pops the modal for that
                  // PO directly, skipping the list refresh entirely.
                  if (e.key === 'Enter' && /^\d+$/.test(filters.poNumber)) {
                    setActivePo(filters.poNumber);
                  }
                }}
                placeholder="e.g. 1452323 — press Enter to open"
                className={inputClass}
              />
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
                    <td className="group px-4 py-2.5 font-mono whitespace-nowrap transition-colors duration-150 hover:bg-fuchsia-500/15">
                      {r.poNumber != null ? (
                        <button
                          onClick={() => setActivePo(String(r.poNumber))}
                          className="text-fuchsia-100 group-hover:text-fuchsia-400 hover:text-fuchsia-300 group-hover:[text-shadow:0_0_12px_rgba(232,121,249,0.55)] hover:underline decoration-fuchsia-400/80 underline-offset-4 transition-all duration-150"
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

      {activePo && (
        <PoItemsModal
          poNumber={activePo}
          onClose={() => setActivePo(null)}
          onChanged={() => fetchData(filters)}
        />
      )}

      {showCreate && (
        <CreatePoDialog
          onClose={() => setShowCreate(false)}
          onCreated={(poNumber) => {
            setShowCreate(false);
            // Open the freshly-created DRAFT in the existing modal so the
            // user lands straight on the add-products + place-order flow.
            setActivePo(poNumber);
            fetchData(filters);
          }}
        />
      )}
    </div>
  );
}

// 48×48 product thumbnail. On hover, shows a frosted-glass card with a
// 480px square image, the SKU label, an angle counter, and (when
// applicable) nav arrows + dots. Renders through a portal so the modal
// body's overflow:auto doesn't clip it; position is computed from the
// thumbnail's rect and flipped left/up to stay on-screen near edges.
// On small viewports the card downscales to fit while staying square.
function ProductThumb({ images, alt }: { images: string[]; alt: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; size: number } | null>(null);
  const [idx, setIdx] = useState(0);
  const hideTimer = useRef<number | null>(null);

  // Auto-advance the carousel every 2s while the popup is open and the
  // SKU has more than one image. Pauses when the popup is closed; resets
  // to slide 0 on each open via openAt() below.
  useEffect(() => {
    if (!pos || images.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % images.length);
    }, 2000);
    return () => window.clearInterval(t);
  }, [pos, images.length]);

  if (!images || images.length === 0) {
    return (
      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-purple-300/40 text-[10px]">
        —
      </div>
    );
  }

  // Card geometry. The image is square and as large as the viewport
  // allows; the card adds ~80px of chrome (padding + label row).
  const IMG_PREFERRED = 480;
  const CHROME = 80;
  const MARGIN = 16;
  const openAt = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Largest square image that fits given side gutters around the thumb
    // and top/bottom viewport padding.
    const widthRoom = Math.max(r.left, vw - r.right) - MARGIN - 24;
    const heightRoom = vh - CHROME - 2 * MARGIN;
    const imgSize = Math.max(
      240,
      Math.min(IMG_PREFERRED, Math.floor(widthRoom), Math.floor(heightRoom)),
    );
    const cardW = imgSize + 24;
    const cardH = imgSize + CHROME;
    let left = r.right + 12;
    if (left + cardW > vw - MARGIN) left = r.left - cardW - 12;
    if (left < MARGIN) left = MARGIN;
    let top = r.top + r.height / 2 - cardH / 2;
    if (top < MARGIN) top = MARGIN;
    if (top + cardH > vh - MARGIN) top = vh - cardH - MARGIN;
    setPos({ top, left, size: imgSize });
    setIdx(0);
  };
  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    // Small delay lets the cursor traverse the gap between thumb and popup.
    hideTimer.current = window.setTimeout(() => setPos(null), 120);
  };
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={images[0]}
        alt={alt}
        onMouseEnter={() => { cancelHide(); openAt(); }}
        onMouseLeave={scheduleHide}
        className="w-12 h-12 rounded-lg object-cover border border-white/15 bg-white/5 cursor-zoom-in shadow-md shadow-black/30 hover:border-fuchsia-400/50 transition-colors"
      />
      {pos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              width: pos.size + 24,
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            className="rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-fuchsia-400/10"
          >
            <div className="p-3">
              <div className="relative" style={{ width: pos.size, height: pos.size }}>
                <div
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.06] to-fuchsia-500/[0.04]"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[idx]}
                  alt={alt}
                  className="relative w-full h-full object-contain rounded-xl"
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prev}
                      aria-label="Previous image"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 text-white text-xl leading-none border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg transition-colors"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      aria-label="Next image"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 text-white text-xl leading-none border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg transition-colors"
                    >
                      ›
                    </button>
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/65 text-white text-[11px] tabular-nums border border-white/15 font-medium">
                      {idx + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
              <div className="mt-2.5 flex items-start justify-between gap-3 px-1">
                <p className="text-[12px] leading-snug text-white/90 line-clamp-2 flex-1" title={alt}>{alt}</p>
                {images.length > 1 && (
                  <div className="flex items-center gap-1 pt-0.5 shrink-0">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                        aria-label={`Show image ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-fuchsia-300' : 'w-1.5 bg-white/30 hover:bg-white/60'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Interactive packaging chip — shows the CASE/UNIT tag + units-per-case
// in compact form, then opens a portal popover on hover or click with a
// breakdown: 1/2/5/10 cases → unit totals + the MOQ in cases. Helps the
// user reason about how a stepper click translates into PO quantity
// without leaving the table.
function PackagingChip({
  packagingType,
  unitsPerCase,
  moq,
}: {
  packagingType: 'CASE' | 'UNIT' | null;
  unitsPerCase: number | null;
  moq: number | null;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  if (unitsPerCase == null) {
    return <span className="text-purple-300/40">—</span>;
  }

  const isCase = packagingType === 'CASE';
  const upc = unitsPerCase || 1;
  // For CASE, "1 case = upc units" tends to match moq; if not, MOQ may be
  // expressed in units that don't divide evenly — show as raw units.
  const moqCases = isCase && moq && upc > 0 ? Math.ceil(moq / upc) : null;
  const samples = isCase ? [1, 2, 5, 10] : [1, 5, 10, 25];

  const POPUP_W = 240;
  const POPUP_H = 240;
  const openAt = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.right + 8;
    if (left + POPUP_W > vw - 8) left = r.left - POPUP_W - 8;
    if (left < 8) left = 8;
    let top = r.top + r.height / 2 - POPUP_H / 2;
    if (top < 8) top = 8;
    if (top + POPUP_H > vh - 8) top = vh - POPUP_H - 8;
    setPos({ top, left });
    setOpen(true);
  };
  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onMouseEnter={() => { cancelHide(); openAt(); }}
        onMouseLeave={scheduleHide}
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openAt(); }}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-white/5 transition-colors cursor-help focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
            isCase
              ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
              : 'bg-sky-500/15 text-sky-200 border-sky-400/30'
          }`}
        >
          {packagingType ?? 'UNIT'}
        </span>
        <span className="text-purple-100 tabular-nums">{unitsPerCase}</span>
        <span className="text-purple-400/50 text-[9px]" aria-hidden>ⓘ</span>
      </button>
      {open && pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: POPUP_W }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            className="rounded-xl bg-slate-950/95 backdrop-blur-xl border border-white/15 shadow-2xl p-3 text-xs"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="uppercase tracking-wider text-[10px] text-purple-300/70 font-semibold">Packaging</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                  isCase
                    ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                    : 'bg-sky-500/15 text-sky-200 border-sky-400/30'
                }`}
              >
                {packagingType ?? 'UNIT'}
              </span>
            </div>
            <div className="space-y-1 mb-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-purple-300/70">1 case</span>
                <span className="text-white font-semibold tabular-nums">{upc} unit{upc === 1 ? '' : 's'}</span>
              </div>
              {moq != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-300/70">Min order</span>
                  <span className="text-white font-semibold tabular-nums">
                    {moq} unit{moq === 1 ? '' : 's'}
                    {moqCases != null && moqCases > 0 && (
                      <span className="text-amber-200/80 ml-1">· {moqCases} case{moqCases === 1 ? '' : 's'}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-md border border-white/10 overflow-hidden">
              <div className="grid grid-cols-2 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold">
                <span>{isCase ? 'Cases' : 'Packs'}</span>
                <span className="text-right">Units</span>
              </div>
              {samples.map((n, i) => (
                <div
                  key={n}
                  className={`grid grid-cols-2 px-2 py-1 tabular-nums ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                >
                  <span className="text-purple-100">{n}</span>
                  <span className="text-right text-white font-medium">{n * upc}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Create-PO dialog — pick a buyer (by phone) and a live D2R seller (by
// business name typeahead), then POST /api/order-place/create-po. On
// success the parent opens the new DRAFT in the existing PoItemsModal so
// the rest of the flow (add products / set qty / place) is reused
// untouched.
interface BuyerLookupResult {
  id: string;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
}
interface SellerSearchRow {
  id: string;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  brandLabel: string | null;
}

function CreatePoDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (poNumber: string) => void;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  // `buyerMatch` is the latest successful lookup result; `buyer` is the
  // value the user actually confirmed via the Select button. Submit only
  // looks at `buyer`, so the pill no longer lies about a click that
  // never happened.
  const [buyerMatch, setBuyerMatch] = useState<BuyerLookupResult | null>(null);
  const [buyer, setBuyer] = useState<BuyerLookupResult | null>(null);
  const [buyerErr, setBuyerErr] = useState<string | null>(null);
  const [buyerLoading, setBuyerLoading] = useState(false);

  const [sellerQ, setSellerQ] = useState('');
  const [sellerResults, setSellerResults] = useState<SellerSearchRow[]>([]);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerErr, setSellerErr] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerSearchRow | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Buyer lookup — debounced on phone input. 10-digit gate matches the
  // API. We populate `buyerMatch` but never auto-set `buyer`; the user
  // must hit Select to commit. Changing the phone clears both states so
  // a stale confirmation can't outlive its number.
  useEffect(() => {
    setBuyerMatch(null);
    setBuyer(null);
    setBuyerErr(null);
    if (!/^\d{10}$/.test(phone)) return;
    const t = setTimeout(() => {
      setBuyerLoading(true);
      fetch(`/api/order-place/buyer-lookup?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        .then(async (res) => {
          const j = await res.json();
          if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
          if (!j.buyer) setBuyerErr('No buyer found for this phone');
          else setBuyerMatch(j.buyer);
        })
        .catch((e) => setBuyerErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setBuyerLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [phone]);

  // Seller typeahead — debounced. Empty query returns the first 30 live
  // sellers alphabetically so the picker is useful even on first paint.
  useEffect(() => {
    const t = setTimeout(() => {
      setSellerLoading(true);
      setSellerErr(null);
      fetch(`/api/order-place/seller-search?q=${encodeURIComponent(sellerQ)}`, { cache: 'no-store' })
        .then(async (res) => {
          const j = await res.json();
          if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
          setSellerResults((j.rows as SellerSearchRow[]) ?? []);
        })
        .catch((e) => setSellerErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setSellerLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [sellerQ]);

  const canSubmit = !!buyer && !!seller && !submitting;

  // Clear the auth keys the dashboard set on login and bounce to /login.
  // Used both when no token is present and when the server reports 401
  // (typically: jwt expired).
  const forceLogin = (reason: string) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('authToken');
        localStorage.removeItem('employeeId');
        localStorage.removeItem('employeeName');
        localStorage.removeItem('employeeEmail');
      } catch {}
    }
    setCreateErr(`${reason} — redirecting to login…`);
    // Small delay so the redirect message is actually visible before the
    // route change wipes the dialog.
    setTimeout(() => router.push('/login'), 600);
  };

  const submit = async () => {
    if (!buyer || !seller) return;
    setSubmitting(true);
    setCreateErr(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      if (!token) {
        forceLogin('Not signed in');
        return;
      }
      const res = await fetch('/api/order-place/create-po', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The server uses this to look up the caller in
          // employeeBase.employee and stamp createdById on the PO.
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ buyerId: buyer.id, sellerId: seller.id }),
      });
      const j = await res.json();
      if (res.status === 401) {
        // Expired / tampered / missing — only path forward is a fresh
        // login so the localStorage token rotates.
        forceLogin('Session expired');
        return;
      }
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      onCreated(String(j.poNumber));
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 to-purple-950 border border-emerald-400/40 rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Create new PO</h3>
            <p className="text-[11px] text-purple-300/70 mt-0.5">Pick a buyer and a live D2R seller. The order opens as a DRAFT so you can add products and set quantities before placing it.</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="shrink-0 w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-purple-200 hover:text-white text-base leading-none flex items-center justify-center disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Buyer */}
        <label className="block text-[11px] uppercase tracking-wider text-purple-300/80 mb-1.5">Buyer phone</label>
        <input
          type="tel"
          value={phone}
          autoFocus
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="10-digit mobile, e.g. 9305129200"
          className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/15 text-white text-sm tabular-nums focus:outline-none focus:border-fuchsia-400/60"
        />
        <div className="min-h-[48px] mt-1.5">
          {buyerLoading && <div className="text-[11px] text-purple-300/70">Looking up…</div>}
          {!buyerLoading && buyerErr && <div className="text-[11px] text-rose-300">{buyerErr}</div>}
          {!buyerLoading && buyer && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm text-white font-semibold truncate">{buyer.businessName ?? '—'}</div>
                <div className="text-[11px] text-purple-200/80 truncate">
                  {[buyer.city, buyer.district, buyer.state, buyer.pincode].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/25 border border-emerald-400/50 text-emerald-100"
                >
                  ✓ Selected
                </span>
                <button
                  type="button"
                  onClick={() => setBuyer(null)}
                  className="text-[10px] text-purple-300 hover:text-white underline underline-offset-2"
                >
                  change
                </button>
              </div>
            </div>
          )}
          {!buyerLoading && !buyer && buyerMatch && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setBuyer(buyerMatch)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBuyer(buyerMatch); } }}
              className="group rounded-md bg-white/[0.03] hover:bg-fuchsia-500/10 border border-white/10 hover:border-fuchsia-400/40 px-2.5 py-1.5 flex items-start justify-between gap-2 cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm text-white font-semibold truncate">{buyerMatch.businessName ?? '—'}</div>
                <div className="text-[11px] text-purple-200/80 truncate">
                  {[buyerMatch.city, buyerMatch.district, buyerMatch.state, buyerMatch.pincode].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setBuyer(buyerMatch); }}
                className="shrink-0 px-2.5 py-1 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/40 text-fuchsia-100 text-[10px] font-bold uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-opacity"
              >
                Select
              </button>
            </div>
          )}
        </div>

        {/* Seller */}
        <label className="block text-[11px] uppercase tracking-wider text-purple-300/80 mb-1.5 mt-3">Seller</label>
        <input
          type="text"
          value={sellerQ}
          onChange={(e) => { setSellerQ(e.target.value); setSeller(null); }}
          placeholder="Search by business name…"
          className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-fuchsia-400/60"
        />
        {seller ? (
          <div className="mt-2 rounded-md bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm text-white font-semibold truncate">{seller.businessName ?? '—'}</div>
              <div className="text-[11px] text-purple-200/80 truncate">
                {seller.brandLabel ? `Brand: ${seller.brandLabel} · ` : ''}{[seller.city, seller.state].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <button
              onClick={() => setSeller(null)}
              className="text-[10px] text-purple-300 hover:text-white shrink-0 underline underline-offset-2"
            >
              change
            </button>
          </div>
        ) : (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-white/[0.02]">
            {sellerLoading && <div className="px-3 py-2 text-[11px] text-purple-300/70">Searching…</div>}
            {!sellerLoading && sellerErr && <div className="px-3 py-2 text-[11px] text-rose-300">{sellerErr}</div>}
            {!sellerLoading && !sellerErr && sellerResults.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-purple-300/60 text-center">
                {sellerQ ? `No live sellers match "${sellerQ}".` : 'No live sellers available.'}
              </div>
            )}
            {!sellerLoading && sellerResults.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setSeller(s)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeller(s); } }}
                className="group flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-fuchsia-500/10 border-t border-white/5 first:border-t-0 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{s.businessName ?? '—'}</div>
                  <div className="text-[11px] text-purple-300/70 truncate">
                    {s.brandLabel ? `${s.brandLabel} · ` : ''}{[s.city, s.state].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button
                  type="button"
                  // Inner button — stop the row click so it doesn't fire
                  // twice (no functional issue, just keeps semantics clean).
                  onClick={(e) => { e.stopPropagation(); setSeller(s); }}
                  className="shrink-0 px-2.5 py-1 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/40 text-fuchsia-100 text-[10px] font-bold uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-opacity"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        )}

        {createErr && (
          <div className="mt-3 px-3 py-2 rounded-md bg-rose-500/10 border border-rose-400/30 text-rose-200 text-[11px]">
            ⚠ {createErr}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 text-xs disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-1.5 rounded-md bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 border border-emerald-200 text-emerald-950 text-xs font-extrabold uppercase tracking-wider shadow-md shadow-emerald-300/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create draft PO →'}
          </button>
        </div>
      </div>
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
  paymentOption: string | null;
  paymentInstrument: string | null;
  sellerMov: string | null;
  buyerWalletAmount: string | null;
}

interface PoItem {
  itemId: string;
  brandSKUId: string | null;
  skuLabel: string | null;
  brandLabel: string | null;
  size: string | null;
  images: string[];
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  status: string | null;
  margin: string | null;
  mrp: string | null;
  packagingType: 'CASE' | 'UNIT' | null;
  minimumOrderableQuantity: number | null;
  noOfUnitsPerCase: number | null;
}

interface PoItemsResponse {
  po: PoSummary;
  items: PoItem[];
  itemCount: number;
  totalQuantity: number;
  totalItemAmount: number;
}

interface SkuOption {
  sellerBrandSKUId: string;
  brandSKUId: string;
  brandLabel: string | null;
  skuLabel: string | null;
  size: string | null;
  images: string[];
  slabMinQuantity: number | null;
  slabMaxQuantity: number | null;
  slabHint: string | null;
  unitPriceHint: string | null;
  marginHint: string | null;
  mrp: string | null;
  packagingType: 'CASE' | 'UNIT' | null;
  minimumOrderableQuantity: number | null;
  noOfUnitsPerCase: number | null;
  alreadyInPo: boolean;
}

function PoItemsModal({
  poNumber,
  onClose,
  onChanged,
}: {
  poNumber: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<PoItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mutation state — surfaces errors from POST/PATCH/DELETE/place-order calls
  // without trashing the loaded item list.
  const [busy, setBusy] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [placeConfirm, setPlaceConfirm] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/order-place/po-items?poNumber=${encodeURIComponent(poNumber)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as PoItemsResponse);
      setQtyDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [poNumber]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const po = data?.po;
  const items = data?.items ?? [];
  const isDraft = po?.status === 'DRAFT';

  async function mutate(label: string, opts: { url: string; method: string; body?: unknown }) {
    setBusy(label);
    setMutationError(null);
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as PoItemsResponse);
      setQtyDraft({});
      onChanged?.();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const saveQty = (it: PoItem) => {
    const draft = qtyDraft[it.itemId];
    if (draft === undefined) return;
    const q = Number(draft);
    if (!Number.isInteger(q) || q < 1) {
      setMutationError('Quantity must be a positive integer');
      return;
    }
    if (q === Number(it.quantity)) {
      setQtyDraft((prev) => { const n = { ...prev }; delete n[it.itemId]; return n; });
      return;
    }
    void mutate(`qty-${it.itemId}`, {
      url: '/api/order-place/po-items',
      method: 'PATCH',
      body: { itemId: it.itemId, quantity: q },
    });
  };

  const removeItem = (it: PoItem) => {
    if (!window.confirm(`Remove ${it.skuLabel ?? 'this item'} from the PO?`)) return;
    void mutate(`del-${it.itemId}`, {
      url: `/api/order-place/po-items?itemId=${encodeURIComponent(it.itemId)}`,
      method: 'DELETE',
    });
  };

  const addProduct = (sku: SkuOption, quantity: number) => {
    void mutate(`add-${sku.sellerBrandSKUId}`, {
      url: '/api/order-place/po-items',
      method: 'POST',
      body: { poNumber, sellerBrandSKUId: sku.sellerBrandSKUId, quantity },
    });
  };

  // Bulk add — calls POST sequentially so each item's response updates the
  // PO totals live (instead of one batch refresh at the end). Per-item
  // failures are collected and shown together at the end; successful items
  // are NOT rolled back.
  const addProductsBulk = async (
    list: Array<{ sku: SkuOption; quantity: number }>,
    onItemDone?: (sku: SkuOption, ok: boolean) => void,
  ) => {
    if (list.length === 0) return;
    setMutationError(null);
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const { sku, quantity } = list[i];
      setBusy(`bulk-add ${i + 1}/${list.length} — ${sku.skuLabel ?? sku.sellerBrandSKUId}`);
      try {
        const res = await fetch('/api/order-place/po-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poNumber, sellerBrandSKUId: sku.sellerBrandSKUId, quantity }),
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setData(json as PoItemsResponse);
        onChanged?.();
        onItemDone?.(sku, true);
      } catch (e) {
        failed.push(`${sku.skuLabel ?? sku.sellerBrandSKUId}: ${e instanceof Error ? e.message : String(e)}`);
        onItemDone?.(sku, false);
      }
    }
    setBusy(null);
    setQtyDraft({});
    if (failed.length > 0) {
      setMutationError(`${failed.length} of ${list.length} item(s) failed — ${failed.join(' · ')}`);
    }
  };

  const placeOrder = async () => {
    setBusy('place');
    setMutationError(null);
    try {
      const res = await fetch('/api/order-place/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poNumber }),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      onChanged?.();
      onClose();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
      setPlaceConfirm(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-900 via-purple-950/80 to-slate-900 border border-fuchsia-400/30 rounded-2xl shadow-[0_0_60px_rgba(217,70,239,0.25)] overflow-hidden flex flex-col"
        style={{ width: 'min(2200px, 96vw)', height: 'min(1400px, 95vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-2.5 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">PO</span>
              <span className="font-mono text-xl font-bold text-fuchsia-200">{poNumber}</span>
              {po && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                  {po.status}
                </span>
              )}
            </div>
            {po && (
              <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-purple-200/90">
                <div className="group px-2 py-0.5 -mx-2 rounded border-l-2 border-transparent hover:border-fuchsia-400 hover:bg-fuchsia-500/10 transition-all duration-150 cursor-default">
                  <span className="text-purple-400/70 group-hover:text-fuchsia-300 transition-colors">Buyer:</span>{' '}
                  <span className="text-white font-medium group-hover:[text-shadow:0_0_10px_rgba(255,255,255,0.35)] transition-all">{po.buyerBusinessName ?? '—'}</span>
                  {po.buyerPhone && (
                    <span className="text-purple-300/70 tabular-nums group-hover:text-fuchsia-200 transition-colors"> · {po.buyerPhone}</span>
                  )}
                </div>
                <div className="group px-2 py-0.5 -mx-2 rounded border-l-2 border-transparent hover:border-fuchsia-400 hover:bg-fuchsia-500/10 transition-all duration-150 cursor-default">
                  <span className="text-purple-400/70 group-hover:text-fuchsia-300 transition-colors">Seller:</span>{' '}
                  <span className="text-white font-medium group-hover:[text-shadow:0_0_10px_rgba(255,255,255,0.35)] transition-all">{po.sellerBusinessName ?? '—'}</span>
                  {po.sellerPhone && (
                    <span className="text-purple-300/70 tabular-nums group-hover:text-fuchsia-200 transition-colors"> · {po.sellerPhone}</span>
                  )}
                </div>
                <div className="group px-2 py-0.5 -mx-2 rounded border-l-2 border-transparent hover:border-fuchsia-400 hover:bg-fuchsia-500/10 transition-all duration-150 cursor-default">
                  <span className="text-purple-400/70 group-hover:text-fuchsia-300 transition-colors">Created:</span>{' '}
                  <span className="text-purple-100 group-hover:text-white transition-colors">{formatDate(po.created_at)}</span>
                </div>
                <div className="group px-2 py-0.5 -mx-2 rounded border-l-2 border-transparent hover:border-emerald-400 hover:bg-emerald-500/10 transition-all duration-150 cursor-default flex items-center gap-2 flex-wrap">
                  <span>
                    <span className="text-purple-400/70 group-hover:text-emerald-300 transition-colors">PO total:</span>{' '}
                    <span className="text-white font-semibold tabular-nums group-hover:text-emerald-200 group-hover:[text-shadow:0_0_12px_rgba(110,231,183,0.5)] transition-all">{formatAmount(po.amount)}</span>
                  </span>
                  {/* Buyer wallet — analytics.realTimeBuyerWalletBalances
                      .availableWalletBalance. Always rendered (em-dash on
                      null) so the user knows the data was actually looked
                      up rather than just missing from the layout. */}
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 text-[10px] font-bold uppercase tracking-wider"
                    title="Buyer's available wallet balance from analytics.realTimeBuyerWalletBalances"
                  >
                    <span aria-hidden>💳</span>
                    <span>Wallet</span>
                    <span className="text-white tabular-nums">
                      {po.buyerWalletAmount != null
                        ? `₹${Number(po.buyerWalletAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '—'}
                    </span>
                  </span>
                </div>
                <div className="md:col-span-2 group px-2 py-0.5 -mx-2 rounded border-l-2 border-transparent hover:border-fuchsia-400 hover:bg-fuchsia-500/10 transition-all duration-150 cursor-default">
                  <span className="text-purple-400/70 group-hover:text-fuchsia-300 transition-colors">PO ID:</span>{' '}
                  <span className="font-mono text-[11px] text-purple-100 group-hover:text-white select-all break-all">{po.poId}</span>
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

        {/* Action bar — always rendered so the payment-mode chip is visible
            for placed POs too, even when the DRAFT-only controls are hidden. */}
        {po && (
          <div className="px-6 py-1.5 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap bg-white/[0.02]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isDraft && (
                <button
                  onClick={() => setShowAdd((v) => !v)}
                  disabled={busy !== null}
                  className="px-2.5 py-1 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/30 text-fuchsia-100 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
                >
                  {showAdd ? '× Close add panel' : '+ Add product'}
                </button>
              )}
              <PaymentModeChip
                option={po.paymentOption}
                instrument={po.paymentInstrument}
                editable={isDraft}
                busy={busy === 'pay-cod'}
                onSetCOD={() => mutate('pay-cod', {
                  url: '/api/order-place/payment-info',
                  method: 'POST',
                  body: { poNumber, option: 'COD' },
                })}
              />
            </div>
            <div className="flex items-center gap-1.5">
              {busy && <span className="text-[10px] text-fuchsia-300 animate-pulse">Saving…</span>}
              {isDraft && (() => {
                // MOV gate. NULL/0 means the seller has no floor and any
                // total is acceptable; otherwise the line-sum must reach
                // sellerMov. Same condition the server enforces.
                const mov = po?.sellerMov != null ? Number(po.sellerMov) : 0;
                const total = data?.totalItemAmount ?? 0;
                const shortfall = mov > 0 ? Math.max(0, mov - total) : 0;
                const movMet = mov === 0 || shortfall === 0;
                const ready = busy === null && items.length > 0 && movMet;
                const blockedReason = items.length === 0
                  ? 'Add at least one item before placing'
                  : !movMet
                    ? `Add ₹${shortfall.toFixed(2)} more to meet ₹${mov.toFixed(2)} MOV`
                    : 'Place this PO as PENDING';
                return (
                  <>
                    {!movMet && items.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/40 text-amber-100 text-[10px] font-bold uppercase tracking-wider"
                        title={`Seller's minimum order value is ₹${mov.toFixed(2)}; current total ₹${total.toFixed(2)}`}
                      >
                        <span aria-hidden>⚠</span>
                        <span>
                          Add <span className="text-white">₹{shortfall.toFixed(2)}</span> more to meet MOV
                        </span>
                      </span>
                    )}
                    <button
                      onClick={() => setPlaceConfirm(true)}
                      disabled={!ready}
                      className={`place-order-cta group relative overflow-hidden rounded-lg px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition-all duration-200
                        ${ready
                          ? 'is-ready text-emerald-950 border-emerald-200 bg-gradient-to-r from-emerald-200 via-lime-200 to-emerald-200 bg-[length:200%_100%] hover:bg-[position:100%_0] hover:scale-[1.03] active:scale-[0.98] shadow-md shadow-emerald-300/40 hover:shadow-lg hover:shadow-emerald-300/60'
                          : 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300/40 cursor-not-allowed shadow-none'}
                      `}
                      title={blockedReason}
                    >
                      {/* Shine sweep — moves left-to-right on hover only */}
                      {ready && (
                        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                      )}
                      <span className="relative inline-flex items-center gap-1.5">
                        <span>Place Order</span>
                        <span className="text-sm leading-none transition-transform group-hover:translate-x-1">→</span>
                      </span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {mutationError && (
          <div className="px-6 py-2 text-rose-200 text-xs bg-rose-500/10 border-b border-rose-400/30 flex items-center justify-between gap-3">
            <span>⚠ {mutationError}</span>
            <button onClick={() => setMutationError(null)} className="text-rose-200/70 hover:text-white">×</button>
          </div>
        )}

        {/* Body — when the Add panel is open we go side-by-side (Add on
            the left, current PO items on the right) so the user never
            loses sight of what's already in the order. On narrow
            viewports both stack vertically with the Add panel capped at
            half-height so the items table stays scrollable below it. */}
        <div className={`flex-1 min-h-0 ${isDraft && showAdd ? 'flex flex-col lg:flex-row' : ''}`}>
          {isDraft && showAdd && (
            <div className="lg:w-1/2 lg:border-r border-white/10 max-h-[50vh] lg:max-h-none overflow-auto bg-white/[0.015]">
              <AddProductPanel poNumber={poNumber} busy={busy} onAdd={addProduct} onAddBulk={addProductsBulk} />
            </div>
          )}
          <div className={`${isDraft && showAdd ? 'lg:w-1/2' : 'w-full'} min-h-0 flex-1 overflow-auto`}>
            {isDraft && showAdd && (
              <div className="sticky top-0 z-20 px-6 py-2 bg-slate-900/90 backdrop-blur border-b border-white/10 text-[11px] uppercase tracking-wider text-purple-300/80 font-semibold">
                In this PO · {items.length} item{items.length === 1 ? '' : 's'}
              </div>
            )}
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
              {isDraft ? 'No items yet — use “+ Add product” to start the order.' : 'No items recorded against this PO.'}
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                <tr className="text-purple-200 uppercase text-xs">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Image</th>
                  <th className="px-4 py-3 text-left">Brand</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right" title="Slab margin (%) the trigger used to compute unitPrice from consumerSellingPrice">Margin</th>
                  <th className="px-4 py-3 text-right" title="brandSKU.consumerSellingPrice — the MRP printed on the pack.">MRP</th>
                  <th className="px-4 py-3 text-center">Item Status</th>
                  {isDraft && <th className="px-4 py-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const draftQty = qtyDraft[it.itemId];
                  const showSaveBtn = draftQty !== undefined && draftQty !== String(it.quantity);
                  const rowBusy = busy === `qty-${it.itemId}` || busy === `del-${it.itemId}`;
                  // CASE rows can't be edited freely — only stepped by full
                  // packs. Each click writes the new total straight to the
                  // PATCH endpoint instead of going through the draft/Save
                  // flow that UNIT rows still use.
                  const isCase = it.packagingType === 'CASE';
                  const moq = it.minimumOrderableQuantity && it.minimumOrderableQuantity > 0
                    ? it.minimumOrderableQuantity
                    : 1;
                  const currentQty = Number(it.quantity) || 0;
                  const stepQty = (delta: 1 | -1) => {
                    const next = currentQty + delta * moq;
                    if (next < moq) return; // can't go below one case
                    void mutate(`qty-${it.itemId}`, {
                      url: '/api/order-place/po-items',
                      method: 'PATCH',
                      body: { itemId: it.itemId, quantity: next },
                    });
                  };
                  return (
                    <tr key={it.itemId} className={`border-t border-white/5 hover:bg-white/5 ${rowBusy ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5 text-purple-300/70 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5"><ProductThumb images={it.images ?? []} alt={it.skuLabel ?? 'product'} /></td>
                      <td className="px-4 py-2.5 text-purple-100">{it.brandLabel ?? '—'}</td>
                      <td className="px-4 py-2.5 text-white">{it.skuLabel ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white">
                        {isDraft ? (
                          isCase ? (
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                onClick={() => stepQty(-1)}
                                disabled={busy !== null || currentQty <= moq}
                                className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white text-base leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label="Remove one case"
                                title={`Remove 1 case (−${moq})`}
                              >−</button>
                              <div className="px-2 min-w-[3.5rem] text-right">
                                <div className="text-white text-sm font-semibold tabular-nums leading-tight">{currentQty}</div>
                                <div className="text-[9px] text-amber-200/80 tabular-nums leading-tight">{Math.round(currentQty / moq)} case{Math.round(currentQty / moq) === 1 ? '' : 's'}</div>
                              </div>
                              <button
                                onClick={() => stepQty(1)}
                                disabled={busy !== null}
                                className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white text-base leading-none flex items-center justify-center disabled:opacity-40"
                                aria-label="Add one case"
                                title={`Add 1 case (+${moq})`}
                              >+</button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                min={1}
                                value={draftQty ?? String(it.quantity ?? '')}
                                onChange={(e) => setQtyDraft((prev) => ({ ...prev, [it.itemId]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveQty(it); }}
                                disabled={busy !== null}
                                className="w-20 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-sm text-right tabular-nums focus:outline-none focus:border-fuchsia-400/50"
                              />
                              {showSaveBtn && (
                                <button
                                  onClick={() => saveQty(it)}
                                  disabled={busy !== null}
                                  className="px-2 py-1 rounded-md bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-100 text-[10px] font-bold uppercase hover:bg-fuchsia-500/50 disabled:opacity-50"
                                >
                                  Save
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          it.quantity ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">
                        {(() => {
                          // Calculated unit price = MRP × margin% (matches
                          // the picker). The DB's poi.unitPrice is what
                          // the trigger computed (= MRP × (1 − margin)),
                          // so we deliberately ignore it here and recompute
                          // from MRP + margin for the display.
                          const mrp = Number(it.mrp);
                          const m = Number(it.margin);
                          if (!Number.isFinite(mrp) || !Number.isFinite(m) || it.mrp == null || it.margin == null) return '—';
                          const v = (mrp * m) / 100;
                          return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white font-semibold">{formatAmount(it.amount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-200">{it.margin != null ? `${Number(it.margin).toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{formatAmount(it.mrp)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-purple-200 border border-white/10">
                          {it.status ?? '—'}
                        </span>
                      </td>
                      {isDraft && (
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => removeItem(it)}
                            disabled={busy !== null}
                            className="px-2 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-[10px] font-bold uppercase disabled:opacity-50"
                            title="Remove item"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>
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

      {/* Place-order confirm dialog */}
      {placeConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80" onClick={() => !busy && setPlaceConfirm(false)}>
          <div className="w-full max-w-md bg-gradient-to-br from-slate-900 to-purple-950 border border-emerald-400/40 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Place PO {poNumber}?</h3>
            <p className="text-sm text-purple-200 mb-4">
              This will set status to <span className="font-bold text-emerald-300">PENDING</span> and stamp{' '}
              <code className="text-purple-100">markedPendingTime</code> = now. Downstream Badho systems (notifications, settlement readiness, third-party delivery) will treat this as a placed order.
            </p>
            {data && (
              <div className="text-xs text-purple-300/80 mb-5 space-y-0.5">
                <div>{data.itemCount} items · qty {data.totalQuantity.toLocaleString('en-IN')}</div>
                <div>Total {formatAmount(data.totalItemAmount)}</div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPlaceConfirm(false)}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={placeOrder}
                disabled={busy !== null}
                className="px-4 py-1.5 rounded-lg bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-400/50 text-emerald-50 text-sm font-bold disabled:opacity-50"
              >
                {busy === 'place' ? 'Placing…' : 'Confirm — place order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local keyframes for the Place Order CTA. Two stacked animations
          while .is-ready (items > 0 and idle):
            - blink: brightness + opacity dip so the button visibly winks
            - ping:  expanding emerald halo that fades out, telegraphing
                     "tap me" without being epileptic
          Both pause on hover so the shine sweep + scale take over. */}
      <style jsx>{`
        .place-order-cta.is-ready {
          animation:
            place-order-blink 1.2s ease-in-out infinite,
            place-order-ping  1.6s ease-out    infinite;
        }
        .place-order-cta.is-ready:hover {
          animation-play-state: paused, paused;
        }
        @keyframes place-order-blink {
          0%, 100% {
            filter: brightness(1);
            opacity: 1;
          }
          50% {
            filter: brightness(1.25);
            opacity: 0.82;
          }
        }
        @keyframes place-order-ping {
          0% {
            box-shadow:
              0 8px 18px -6px rgba(16, 185, 129, 0.5),
              0 0 0 0   rgba(52, 211, 153, 0.7),
              0 0 0 0   rgba(52, 211, 153, 0.45);
          }
          70% {
            box-shadow:
              0 8px 18px -6px rgba(16, 185, 129, 0.5),
              0 0 0 12px rgba(52, 211, 153, 0),
              0 0 0 24px rgba(52, 211, 153, 0);
          }
          100% {
            box-shadow:
              0 8px 18px -6px rgba(16, 185, 129, 0.5),
              0 0 0 0   rgba(52, 211, 153, 0),
              0 0 0 0   rgba(52, 211, 153, 0);
          }
        }
      `}</style>
    </div>
  );
}

function PaymentModeChip({
  option,
  instrument,
  editable,
  busy,
  onSetCOD,
}: {
  option: string | null;
  instrument: string | null;
  // On DRAFT POs the chip becomes clickable to assign COD. For PENDING and
  // other statuses it stays informational.
  editable?: boolean;
  busy?: boolean;
  onSetCOD?: () => void;
}) {
  // Color the chip by payment kind so the eye can scan a PO list at a glance:
  //   COD                      → amber (seller bears collection risk)
  //   FULLY_PAID / *_ADVANCE   → emerald (already paid)
  //   anything else / unknown  → purple
  //   null (DRAFT, not picked) → dim
  const styled = (() => {
    if (!option) return { label: 'Payment: Not set', tint: 'neutral' as const, detail: null as string | null };
    const map: Record<string, { label: string; tint: 'amber' | 'emerald' | 'purple' }> = {
      COD:             { label: 'COD',             tint: 'amber'   },
      FULLY_PAID:      { label: 'Paid in full',    tint: 'emerald' },
      PARTIAL_ADVANCE: { label: 'Partial advance', tint: 'emerald' },
      FULL_ADVANCE:    { label: 'Full advance',    tint: 'emerald' },
    };
    const entry = map[option] ?? { label: option, tint: 'purple' as const };
    return { ...entry, detail: instrument ? `via ${instrument}` : null };
  })();

  const isCOD = option === 'COD';
  // On DRAFT, show a primary "Set COD" CTA when not yet set, plus a
  // dim secondary chip if already COD (to communicate confirmation).
  const showSetCOD = !!editable && !isCOD;

  const tintClass: Record<typeof styled.tint, string> = {
    amber:   'bg-amber-500/15 border-amber-400/40 text-amber-100',
    emerald: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100',
    purple:  'bg-purple-500/15 border-purple-400/40 text-purple-100',
    neutral: 'bg-white/5 border-white/10 text-purple-300/80',
  };

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        disabled
        title={styled.detail ?? `Payment mode: ${option ?? 'not set'}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider cursor-default transition-colors ${tintClass[styled.tint]}`}
      >
        <span aria-hidden>💳</span>
        <span>{styled.label}</span>
        {styled.detail && (
          <span className="font-normal opacity-80 normal-case tracking-normal">· {styled.detail}</span>
        )}
      </button>
      {showSetCOD && (
        <button
          type="button"
          onClick={onSetCOD}
          disabled={busy}
          className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/40 border border-amber-400/40 text-amber-100 text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Set payment mode to COD"
        >
          {busy ? 'Setting…' : '+ Set COD'}
        </button>
      )}
    </div>
  );
}

function AddProductPanel({
  poNumber,
  busy,
  onAdd,
  onAddBulk,
}: {
  poNumber: string;
  busy: string | null;
  onAdd: (sku: SkuOption, qty: number) => void;
  onAddBulk: (
    list: Array<{ sku: SkuOption; quantity: number }>,
    onItemDone?: (sku: SkuOption, ok: boolean) => void,
  ) => Promise<void> | void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selection state — keyed by sellerBrandSKUId. Persists across search
  // changes so the user can refine the list, tick boxes, refine again,
  // then bulk-add at the end.
  const [selected, setSelected] = useState<Record<string, true>>({});
  // Pending row-add: clicking Add on a row opens this dialog so the user
  // confirms the quantity before the actual mutation fires. Bulk-add
  // doesn't go through here — it uses each SKU's slab minimum.
  const [pendingSku, setPendingSku] = useState<SkuOption | null>(null);
  const [pendingQty, setPendingQty] = useState<string>('1');

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      const url = `/api/order-place/seller-skus?poNumber=${encodeURIComponent(poNumber)}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      fetch(url, { cache: 'no-store' })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
          setResults((json.rows as SkuOption[]) ?? []);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [poNumber, q]);

  const visibleIds = results.map((s) => s.sellerBrandSKUId);
  const selectedCount = Object.keys(selected).length;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected[id]);
  const someVisibleSelected = visibleIds.some((id) => selected[id]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        for (const id of visibleIds) delete next[id];
      } else {
        for (const id of visibleIds) next[id] = true;
      }
      return next;
    });
  };

  const clearSelection = () => setSelected({});

  const bulkAdd = async () => {
    // Resolve the selected ids back to their full SkuOption + slab-min qty.
    // Bulk-add doesn't go through the quantity dialog; each row uses its
    // own slabMinQuantity, which is always inside the trigger's @> check.
    const ids = Object.keys(selected);
    const byId = new Map(results.map((s) => [s.sellerBrandSKUId, s]));
    const list = ids
      .map((id) => {
        const sku = byId.get(id);
        if (!sku) return null;
        const qty = sku.slabMinQuantity ?? 1;
        if (!Number.isInteger(qty) || qty < 1) return null;
        return { sku, quantity: qty };
      })
      .filter((x): x is { sku: SkuOption; quantity: number } => x !== null);
    if (list.length === 0) return;
    await onAddBulk(list, (sku, ok) => {
      if (ok) {
        // Remove successfully-added items from the selection so the user
        // sees progress and doesn't accidentally re-add them.
        setSelected((prev) => {
          const next = { ...prev };
          delete next[sku.sellerBrandSKUId];
          return next;
        });
      }
    });
  };

  return (
    <div className="px-6 py-3 border-b border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKUs by brand or product, or scroll the list…"
          className="flex-1 min-w-[260px] px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none"
          autoFocus
        />
        {loading && <span className="text-[11px] text-purple-300/70">Searching…</span>}
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <button
              onClick={clearSelection}
              disabled={busy !== null}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/5 text-purple-200 border border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              Clear ({selectedCount})
            </button>
          )}
          <button
            onClick={bulkAdd}
            disabled={busy !== null || selectedCount === 0}
            className="px-3 py-1.5 rounded-md bg-fuchsia-500/30 hover:bg-fuchsia-500/50 border border-fuchsia-400/50 text-fuchsia-50 text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && busy.startsWith('bulk-add') ? busy : `+ Add ${selectedCount || ''} selected`}
          </button>
        </div>
      </div>
      {error && (
        <div className="text-rose-200 text-xs mb-2">Failed to load SKUs: {error}</div>
      )}
      <div className="max-h-[420px] overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 sticky top-0 z-10">
            <tr className="text-purple-200 uppercase text-[10px]">
              <th className="px-3 py-2 text-center w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                  onChange={toggleAllVisible}
                  disabled={busy !== null || visibleIds.length === 0}
                  className="accent-fuchsia-500 cursor-pointer disabled:cursor-not-allowed"
                  title={allVisibleSelected ? 'Unselect all visible' : 'Select all visible'}
                />
              </th>
              <th className="px-3 py-2 text-center">Add</th>
              <th className="px-3 py-2 text-left">Image</th>
              <th className="px-3 py-2 text-left">Brand</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right" title="seller_brandSKU.noOfUnitsPerCase — pieces per shipping case. For UNIT packaging this is usually 1.">Units/Case</th>
              <th className="px-3 py-2 text-right" title="seller_brandSKU.minimumOrderableQuantity — smallest qty the seller will accept on an order line. For CASE packaging this equals one full case.">MOQ</th>
              <th className="px-3 py-2 text-right" title="MRP × margin% (e.g. ₹5 at 36% → ₹1.80).">Unit Price</th>
              <th className="px-3 py-2 text-right" title="Slab margin (%) used by the PO trigger to derive unitPrice.">Margin</th>
              <th className="px-3 py-2 text-right">MRP</th>
            </tr>
          </thead>
          <tbody>
            {results.map((s) => {
              const adding = busy === `add-${s.sellerBrandSKUId}`;
              const isSelected = !!selected[s.sellerBrandSKUId];
              return (
                <tr
                  key={s.sellerBrandSKUId}
                  className={`border-t border-white/5 hover:bg-white/5 ${adding ? 'opacity-50' : ''} ${isSelected ? 'bg-fuchsia-500/10' : ''}`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(s.sellerBrandSKUId)}
                      disabled={busy !== null}
                      className="accent-fuchsia-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => {
                        setPendingSku(s);
                        // For CASE SKUs the dialog tracks cases (always
                        // start at 1 case); for UNIT it tracks raw units
                        // and starts at the slab minimum.
                        setPendingQty(
                          s.packagingType === 'CASE'
                            ? '1'
                            : String(s.slabMinQuantity ?? 1),
                        );
                      }}
                      disabled={busy !== null}
                      className="px-2.5 py-1 rounded-md bg-fuchsia-500/25 hover:bg-fuchsia-500/45 border border-fuchsia-400/40 text-fuchsia-100 text-[10px] font-bold uppercase disabled:opacity-50"
                      title="Set quantity and add"
                    >
                      {adding ? '…' : s.alreadyInPo ? 'Add again' : 'Add'}
                    </button>
                  </td>
                  <td className="px-3 py-2"><ProductThumb images={s.images ?? []} alt={s.skuLabel ?? 'product'} /></td>
                  <td className="px-3 py-2 text-purple-100">{s.brandLabel ?? '—'}</td>
                  <td className="px-3 py-2 text-white">{s.skuLabel ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-purple-200">
                    <PackagingChip
                      packagingType={s.packagingType ?? null}
                      unitsPerCase={s.noOfUnitsPerCase ?? null}
                      moq={s.minimumOrderableQuantity ?? null}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-purple-200">{s.minimumOrderableQuantity ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-purple-100">
                    {(() => {
                      // Calculated unit price = MRP × margin% (per the
                      // user's spec: ₹5 at 36% → ₹1.80). This is not the
                      // value the PO trigger writes — the actual unitPrice
                      // is consumerSellingPrice × (1 − margin/100) — so
                      // this column is a quick "what does the margin buy
                      // me" reference for the picker, separate from the
                      // line's true price in the PO items table.
                      //
                      // Local formatter — the shared INR helper uses
                      // maximumFractionDigits:0 which rounded ₹1.80 to ₹2.
                      const mrp = Number(s.mrp);
                      const m = Number(s.marginHint);
                      if (!Number.isFinite(mrp) || !Number.isFinite(m) || s.mrp == null || s.marginHint == null) return '—';
                      const v = (mrp * m) / 100;
                      return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-200">{s.marginHint != null ? `${Number(s.marginHint).toFixed(2)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-purple-200">{formatAmount(s.mrp)}</td>
                </tr>
              );
            })}
            {!loading && results.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-purple-300/60 text-xs">
                {q ? `No SKUs match "${q}" for this seller.` : 'No SKUs found for this seller.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-purple-300/60 mt-2">
        Tick rows and press <span className="text-fuchsia-300 font-semibold">Add N selected</span> to add many at once (each at its slab minimum), or use <span className="text-fuchsia-300 font-semibold">Add</span> on a single row to pick a quantity first. PO total updates after each item. Unit price is a hint — Badho&apos;s pricing engine sets the actual value on insert.
      </p>

      {/* Quantity dialog — opens when the user clicks Add on a row.
          Two flavours driven by sb.packagingType:
            - CASE: input is readonly, only +/− steppers. Each click is
                    one *case*; we send `cases × minimumOrderableQuantity`
                    units to the PO. UI labels stay in cases so the user
                    isn't confused by suddenly-large numbers.
            - UNIT (default): free-form qty input that maps 1:1 to units.
          Both paths honour the slab range and warn if the resulting unit
          count would fall outside it. */}
      {pendingSku && (() => {
        const sku = pendingSku;
        const isCase = sku.packagingType === 'CASE';
        const moq = sku.minimumOrderableQuantity && sku.minimumOrderableQuantity > 0
          ? sku.minimumOrderableQuantity
          : 1;
        const minQ = sku.slabMinQuantity ?? 1;
        // slabMaxQuantity is the exclusive upper bound of the int4range,
        // so the highest accepted qty is maxQ-1 (mirrors the trigger).
        const maxQ = sku.slabMaxQuantity != null ? sku.slabMaxQuantity - 1 : null;
        const slabLabel = maxQ != null ? `${minQ}–${maxQ}` : `${minQ}+`;
        const raw = Number(pendingQty);
        const validNumber = Number.isInteger(raw) && raw >= 1;
        // For CASE the visible number is cases; the actual qty written to
        // purchaseOrderItem is cases × moq.
        const units = validNumber ? (isCase ? raw * moq : raw) : 0;
        const inSlab = validNumber && (units >= minQ) && (maxQ == null || units <= maxQ);
        // Calculated unit price = MRP × margin% (matches both tables).
        // null when either input is missing/not-numeric.
        const mrpNum = Number(sku.mrp);
        const marginNum = Number(sku.marginHint);
        const calcUnitPrice: number | null =
          sku.mrp != null && sku.marginHint != null && Number.isFinite(mrpNum) && Number.isFinite(marginNum)
            ? (mrpNum * marginNum) / 100
            : null;
        const lineAmount: number | null = calcUnitPrice != null ? units * calcUnitPrice : null;
        const fmt2 = (n: number) =>
          `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const close = () => { setPendingSku(null); };
        const submit = () => {
          if (!validNumber) return;
          onAdd(sku, units);
          close();
        };
        const dec = () => setPendingQty((q) => String(Math.max(1, (Number(q) || 1) - 1)));
        const inc = () => setPendingQty((q) => String((Number(q) || 0) + 1));
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80"
            onClick={() => busy === null && close()}
          >
            <div
              className="w-full max-w-sm bg-gradient-to-br from-slate-900 to-purple-950 border border-fuchsia-400/40 rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-3">
                <ProductThumb images={sku.images ?? []} alt={sku.skuLabel ?? 'product'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-purple-300/70 flex items-center gap-1.5">
                    <span>{sku.brandLabel ?? '—'}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${isCase ? 'bg-amber-500/20 text-amber-200 border-amber-400/40' : 'bg-sky-500/20 text-sky-200 border-sky-400/40'}`}>
                      {isCase ? `CASE · ${moq}/case` : 'UNIT'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white line-clamp-2 leading-snug">{sku.skuLabel ?? '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4 text-[11px]">
                <div className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5">
                  <div className="text-purple-400/70 text-[10px] uppercase tracking-wider">Unit</div>
                  <div className="text-purple-100 font-semibold tabular-nums">
                    {calcUnitPrice != null ? fmt2(calcUnitPrice) : '—'}
                  </div>
                </div>
                <div className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5">
                  <div className="text-purple-400/70 text-[10px] uppercase tracking-wider">Margin</div>
                  <div className="text-emerald-200 font-semibold tabular-nums">{sku.marginHint != null ? `${Number(sku.marginHint).toFixed(2)}%` : '—'}</div>
                </div>
                <div className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5">
                  <div className="text-purple-400/70 text-[10px] uppercase tracking-wider">MRP</div>
                  <div className="text-purple-100 font-semibold tabular-nums">{formatAmount(sku.mrp)}</div>
                </div>
              </div>
              <label className="block text-[11px] uppercase tracking-wider text-purple-300/80 mb-1.5">
                {isCase ? 'Cases' : 'Quantity'}
              </label>
              <div className="flex items-center gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={dec}
                  disabled={busy !== null || raw <= 1}
                  className="w-10 h-10 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xl leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={isCase ? 'Remove one case' : 'Decrease quantity'}
                >−</button>
                {isCase ? (
                  // Readonly display so users can't drift off the case grid.
                  // Stepper buttons are the only way to change the value.
                  <div
                    className="flex-1 px-3 py-2 rounded-md bg-white/[0.03] border border-white/15 text-white text-base text-center tabular-nums font-semibold select-none"
                    aria-live="polite"
                    aria-label={`${raw} cases (${units} units)`}
                  >
                    {raw}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    value={pendingQty}
                    onChange={(e) => setPendingQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }}
                    disabled={busy !== null}
                    className="flex-1 px-3 py-2 rounded-md bg-white/5 border border-white/15 text-white text-base text-center tabular-nums focus:outline-none focus:border-fuchsia-400/60"
                  />
                )}
                <button
                  type="button"
                  onClick={inc}
                  disabled={busy !== null}
                  className="w-10 h-10 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xl leading-none flex items-center justify-center disabled:opacity-40"
                  aria-label={isCase ? 'Add one case' : 'Increase quantity'}
                >+</button>
              </div>
              {/* Live amount preview — units × calcUnitPrice. Updates on
                  every stepper press so the user sees exactly what hits
                  the PO before confirming. */}
              {lineAmount != null && validNumber && (
                <div className="mb-3 rounded-md bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-200/80 uppercase tracking-wider">Amount</span>
                  <span className="text-white font-bold tabular-nums text-sm">
                    {fmt2(lineAmount)}
                    <span className="text-emerald-200/70 font-normal ml-1.5 text-[10px]">
                      = {units} × {calcUnitPrice != null ? fmt2(calcUnitPrice) : '—'}
                    </span>
                  </span>
                </div>
              )}
              <div className="text-[10px] text-purple-300/70 mb-4 space-y-0.5">
                {isCase && (
                  <div>
                    1 case = <span className="text-purple-100 font-semibold tabular-nums">{moq}</span> units · sending{' '}
                    <span className="text-fuchsia-200 font-semibold tabular-nums">{units}</span> units to the PO
                  </div>
                )}
                <div>
                  Slab range: <span className="text-purple-100 font-semibold tabular-nums">{slabLabel}</span> units
                  {validNumber && !inSlab && (
                    <span className="ml-2 text-amber-300">⚠ outside slab — Badho may reject this qty</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={close}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 text-xs disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy !== null || !validNumber}
                  className="px-4 py-1.5 rounded-md bg-fuchsia-500/30 hover:bg-fuchsia-500/50 border border-fuchsia-400/50 text-fuchsia-50 text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCase ? `Add ${raw} case${raw > 1 ? 's' : ''}` : 'Add to PO'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
