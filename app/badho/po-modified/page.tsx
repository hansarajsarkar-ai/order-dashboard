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
  shipmentStatus: string | null;
  brandName: string | null;
  buyerBusiness: string | null;
  buyerPhone: string | null;
  paymentMode: string | null;
  paidAmount: number | null;
  buyerInformed: string | null;
  remarks: string | null;
  refundableAmount: number;
  refundStatus: string | null;
  refundAmount: number | null;
  refundTime: string | null;
  refundId: string | null;
  refundType: string | null;
}
interface Kpis {
  modifiedPos: number;
  itemRemovedPos: number;
  qtyDecreasedPos: number;
  prevAmountSum: number;
  newAmountSum: number;
  valueLost: number;
  refundableTotal: number;
  refundCompletedPos: number;
  refundCompletedAmount: number;
  refundPendingPos: number;
}
interface ApiResp {
  data: PoRow[];
  kpis: Kpis;
  timestamp: string;
}

interface ItemRow {
  productName: string | null;
  itemChangeType: string;
  prevQty: number | null;
  newQty: number | null;
  itemAmount: number;
  modifiedByRole: string | null;
}

type RangeKey = 'all' | '7d' | '30d' | '90d' | 'ytd' | 'custom';

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
// Format the API's ISO response timestamp as an IST "last updated" stamp,
// e.g. "09 Jun, 03:45 PM".
function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// Colour the shipment-status badge. Check failures/returns FIRST so values like
// "UNDELIVERED" and "RTO DELIVERED" (which contain "DELIVERED") read as rose,
// not green. Then delivered = green, anything in-motion = sky, rest neutral.
function shipmentBadge(status: string): string {
  const s = status.toUpperCase();
  if (s.includes('RTO') || s.includes('RETURN') || s.includes('FAIL') || s.includes('CANCEL') || s.includes('LOST') || s.includes('UNDELIV')) return 'bg-rose-500/15 text-rose-200 border-rose-400/30';
  if (s.includes('DELIVERED')) return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  if (s.includes('TRANSIT') || s.includes('DISPATCH') || s.includes('SHIP') || s.includes('PICK') || s.includes('OUT FOR') || s.includes('DELIVERY')) return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
  return 'bg-white/5 text-purple-200/70 border-white/15';
}

// Colour the PO-status badge: completed/delivered = green, in-progress = sky,
// pending = amber, rejected/cancelled = rose, everything else neutral.
function poStatusBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === 'COMPLETED' || s === 'DELIVERED') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  if (s === 'INPROGRESS' || s === 'DISPATCHED' || s === 'IN_PROGRESS') return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
  if (s === 'PENDING') return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
  if (s === 'REJECTED' || s === 'CANCELLED') return 'bg-rose-500/15 text-rose-200 border-rose-400/30';
  return 'bg-white/5 text-purple-200/70 border-white/15';
}

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;

// Prev/Next/First/Last pager button styling, dimmed when disabled.
function pagerBtn(disabled: boolean): string {
  return `px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${disabled ? 'bg-white/[0.03] text-purple-300/30 border-white/5 cursor-not-allowed' : 'bg-white/5 text-purple-200 border-white/10 hover:bg-white/10 hover:text-white'}`;
}

// Build the compact page-number list with ellipses: always show first, last,
// and a small window around the current page. Returns numbers and '…' markers.
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

// Stored "buyer informed" values are stamped server-side as
// `<remark> — <Name> (<timestamp>)`. Split them back out so the table can
// show the remark prominently with the author + time on a separate line.
// Greedy first group ensures we split on the LAST " — " in case the remark
// text itself contains an em-dash.
function parseInformed(raw: string): { text: string; by: string | null; at: string | null } {
  const m = raw.match(/^(.*) — (.+?) \(([^)]+)\)$/);
  if (m) return { text: m[1].trim(), by: m[2].trim(), at: m[3].trim() };
  return { text: raw, by: null, at: null };
}

export default function PoModifiedDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [resp, setResp] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<{ po: PoRow; items: ItemRow[] | null } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [editPo, setEditPo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingInform, setSavingInform] = useState(false);
  const [informError, setInformError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [jumpTo, setJumpTo] = useState('');
  // Toggle filters: PO statuses currently selected (empty = show all), and the
  // buyer-informed state ('all' | 'informed' = remark filled | 'blank' = no remark).
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [informedFilter, setInformedFilter] = useState<'all' | 'informed' | 'blank'>('all');

  const toggleStatus = (s: string) =>
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const saveInform = async (poNumber: string) => {
    setSavingInform(true);
    setInformError(null);
    try {
      const res = await fetch('/api/po-modified/inform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber,
          text: draft,
          employeeId: typeof window !== 'undefined' ? localStorage.getItem('employeeId') : null,
          employeeEmail: typeof window !== 'undefined' ? localStorage.getItem('employeeEmail') : null,
          employeeName: typeof window !== 'undefined' ? localStorage.getItem('employeeName') : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      // A filled remark actions the PO — it drops off this dashboard. Remove the
      // row and decrement the matching KPI counters so the strip stays in sync
      // without a refetch. (An empty save clears the remark; keep the row then.)
      setResp((prev) => {
        if (!prev) return prev;
        if (!json.value) {
          return { ...prev, data: prev.data.map((d) => d.poNumber === poNumber ? { ...d, buyerInformed: null } : d) };
        }
        const gone = prev.data.find((d) => d.poNumber === poNumber);
        if (!gone) return prev;
        const k = { ...prev.kpis };
        k.modifiedPos = Math.max(0, k.modifiedPos - 1);
        if (gone.remarks?.includes('Item Removed')) k.itemRemovedPos = Math.max(0, k.itemRemovedPos - 1);
        if (gone.remarks?.includes('Quantity Decreased')) k.qtyDecreasedPos = Math.max(0, k.qtyDecreasedPos - 1);
        k.prevAmountSum = Math.max(0, k.prevAmountSum - gone.prevAmount);
        k.newAmountSum = Math.max(0, k.newAmountSum - gone.newAmount);
        k.valueLost = Math.max(0, k.valueLost - gone.valueLost);
        k.refundableTotal = Math.max(0, k.refundableTotal - gone.refundableAmount);
        if (gone.refundStatus === 'COMPLETED') {
          k.refundCompletedPos = Math.max(0, k.refundCompletedPos - 1);
          k.refundCompletedAmount = Math.max(0, k.refundCompletedAmount - (gone.refundAmount ?? 0));
        } else if (gone.refundableAmount > 0) {
          k.refundPendingPos = Math.max(0, k.refundPendingPos - 1);
        }
        return { ...prev, data: prev.data.filter((d) => d.poNumber !== poNumber), kpis: k };
      });
      setEditPo(null);
      setDraft('');
    } catch (err) {
      setInformError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingInform(false);
    }
  };

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
    if (range === 'all') return { startDate: null, endDate: null };
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
    return resp.data.filter((r) => {
      if (activeStatuses.size > 0 && !(r.poStatus && activeStatuses.has(r.poStatus.toUpperCase()))) return false;
      if (informedFilter === 'informed' && !r.buyerInformed) return false;
      if (informedFilter === 'blank' && r.buyerInformed) return false;
      if (q && ![r.poNumber, r.brandName, r.buyerBusiness, r.buyerPhone, r.poStatus, r.shipmentStatus, r.remarks]
        .some((v) => (v ?? '').toString().toLowerCase().includes(q))) return false;
      return true;
    });
  }, [resp, search, activeStatuses, informedFilter]);

  // Chip counts come from the full fetched set (current date range), so toggling
  // one filter doesn't shift the other chips' numbers. Statuses sorted by volume.
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (resp) for (const r of resp.data) {
      const s = (r.poStatus || 'UNKNOWN').toUpperCase();
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [resp]);
  const informedCounts = useMemo(() => {
    let filled = 0, blank = 0;
    if (resp) for (const r of resp.data) { if (r.buyerInformed) filled++; else blank++; }
    return { filled, blank };
  }, [resp]);

  // Is a client-side filter narrowing the fetched set? (Date range re-queries the
  // server, so the big KPI cards already reflect it — these are the in-page filters.)
  const isFiltered = activeStatuses.size > 0 || informedFilter !== 'all' || search.trim().length > 0;

  // Summary KPIs recomputed over the filtered rows — mirrors the server's KPI
  // reduce in /api/po-modified so the smaller "filtered" boxes match the big ones.
  const filteredKpis = useMemo<Kpis>(() => rows.reduce(
    (acc, d) => {
      acc.modifiedPos += 1;
      if (d.remarks?.includes('Item Removed')) acc.itemRemovedPos += 1;
      if (d.remarks?.includes('Quantity Decreased')) acc.qtyDecreasedPos += 1;
      acc.prevAmountSum += d.prevAmount;
      acc.newAmountSum += d.newAmount;
      acc.valueLost += d.valueLost;
      acc.refundableTotal += d.refundableAmount;
      if (d.refundStatus === 'COMPLETED') {
        acc.refundCompletedPos += 1;
        acc.refundCompletedAmount += d.refundAmount ?? 0;
      } else if (d.refundableAmount > 0) {
        acc.refundPendingPos += 1;
      }
      return acc;
    },
    { modifiedPos: 0, itemRemovedPos: 0, qtyDecreasedPos: 0, prevAmountSum: 0, newAmountSum: 0, valueLost: 0, refundableTotal: 0, refundCompletedPos: 0, refundCompletedAmount: 0, refundPendingPos: 0 }
  ), [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );

  // Snap back to page 1 whenever the filtered set or page size changes.
  useEffect(() => { setPage(1); }, [search, range, customFrom, customTo, pageSize, activeStatuses, informedFilter]);

  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const openDrill = async (po: PoRow) => {
    if (!po.poNumber) return;
    setDrill({ po, items: null });
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/po-modified/items?poNumber=${encodeURIComponent(po.poNumber)}`, { cache: 'no-store' });
      const json = await res.json();
      setDrill({ po, items: res.ok ? (json.data as ItemRow[]) : [] });
    } catch {
      setDrill({ po, items: [] });
    } finally {
      setDrillLoading(false);
    }
  };

  const exportCsv = () => {
    if (!resp) return;
    const headers = ['PO Number', 'Order Date & Time', 'Remarks', 'Previous PO Amount', 'New PO Amount', 'Value Lost', 'Payment Type', 'Buyer Paid', 'Refundable Amount', 'Refund Amount', 'Refund Status', 'Refund Time', 'Refund Id', 'Shipment Status', 'PO Status', 'Brand', 'Buyer Business', 'Buyer Phone', 'Buyer Informed'];
    const esc = (v: string | number | null) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(',')];
    for (const r of rows) {
      lines.push([r.poNumber, r.orderDateTime, r.remarks, r.prevAmount, r.newAmount, r.valueLost, r.paymentMode, r.paidAmount ?? '', r.refundableAmount, r.refundAmount ?? '', r.refundStatus ?? (r.refundableAmount > 0 ? 'PENDING' : ''), r.refundTime ?? '', r.refundId ?? '', r.shipmentStatus ?? '', r.poStatus, r.brandName, r.buyerBusiness, r.buyerPhone, r.buyerInformed ?? ''].map(esc).join(','));
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
    { key: 'all', label: 'All' },
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-purple-300/70 uppercase">Rows per page</span>
            <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setPageSize(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pageSize === n ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
          <Kpi label="Modified POs" value={fmtCount(k?.modifiedPos ?? 0)} sub="seller item edits" tone="fuchsia" />
          <Kpi label="Item Removed" value={fmtCount(k?.itemRemovedPos ?? 0)} sub="POs with a removal" tone="rose" />
          <Kpi label="Quantity Decreased" value={fmtCount(k?.qtyDecreasedPos ?? 0)} sub="POs with a qty cut" tone="amber" />
          <Kpi label="Value Lost" value={fmtAmount(k?.valueLost ?? 0)} sub={`of ${fmtAmount(k?.prevAmountSum ?? 0)} original`} tone="emerald" />
          <Kpi label="Refund Owed" value={fmtAmount(k?.refundableTotal ?? 0)} sub={`${fmtCount(k?.refundCompletedPos ?? 0)} done · ${fmtCount(k?.refundPendingPos ?? 0)} pending`} tone="sky" />
        </div>

        {/* Toggle filters — PO status + buyer-informed state */}
        {resp && (statusCounts.length > 0 || resp.data.length > 0) && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70 mr-1">PO Status</span>
              {statusCounts.map(([s, n]) => {
                const active = activeStatuses.has(s);
                const dimmed = activeStatuses.size > 0 && !active;
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border transition-all ${poStatusBadge(s)} ${active ? 'ring-2 ring-fuchsia-400/60' : ''} ${dimmed ? 'opacity-40 hover:opacity-75' : 'hover:opacity-90'}`}
                  >
                    {s} <span className="font-normal opacity-70">({n.toLocaleString('en-IN')})</span>
                  </button>
                );
              })}
              {activeStatuses.size > 0 && (
                <button onClick={() => setActiveStatuses(new Set())} className="px-2 py-0.5 rounded-md text-[11px] text-purple-300 hover:text-white hover:bg-white/10 border border-white/10">clear</button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70 mr-1">Buyer Informed</span>
              <button
                onClick={() => setInformedFilter((f) => (f === 'informed' ? 'all' : 'informed'))}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border transition-all bg-emerald-500/15 text-emerald-200 border-emerald-400/30 ${informedFilter === 'informed' ? 'ring-2 ring-fuchsia-400/60' : informedFilter === 'blank' ? 'opacity-40 hover:opacity-75' : 'hover:opacity-90'}`}
              >
                Informed <span className="font-normal opacity-70">({informedCounts.filled.toLocaleString('en-IN')})</span>
              </button>
              <button
                onClick={() => setInformedFilter((f) => (f === 'blank' ? 'all' : 'blank'))}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border transition-all bg-amber-500/15 text-amber-200 border-amber-400/30 ${informedFilter === 'blank' ? 'ring-2 ring-fuchsia-400/60' : informedFilter === 'informed' ? 'opacity-40 hover:opacity-75' : 'hover:opacity-90'}`}
              >
                Not Informed <span className="font-normal opacity-70">({informedCounts.blank.toLocaleString('en-IN')})</span>
              </button>
            </div>
          </div>
        )}

        {/* Filtered summary — smaller boxes, only while an in-page filter is active */}
        {resp && isFiltered && (
          <div className="mb-6 -mt-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/80">Filtered summary</span>
              <span className="text-[11px] text-purple-300/60">{fmtCount(filteredKpis.modifiedPos)} of {fmtCount(k?.modifiedPos ?? 0)} POs match</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              <Kpi compact label="Modified POs" value={fmtCount(filteredKpis.modifiedPos)} sub="in current filter" tone="fuchsia" />
              <Kpi compact label="Item Removed" value={fmtCount(filteredKpis.itemRemovedPos)} sub="POs with a removal" tone="rose" />
              <Kpi compact label="Quantity Decreased" value={fmtCount(filteredKpis.qtyDecreasedPos)} sub="POs with a qty cut" tone="amber" />
              <Kpi compact label="Value Lost" value={fmtAmount(filteredKpis.valueLost)} sub={`of ${fmtAmount(filteredKpis.prevAmountSum)} original`} tone="emerald" />
              <Kpi compact label="Refund Owed" value={fmtAmount(filteredKpis.refundableTotal)} sub={`${fmtCount(filteredKpis.refundCompletedPos)} done · ${fmtCount(filteredKpis.refundPendingPos)} pending`} tone="sky" />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-bold text-white">Modified Purchase Orders</h3>
            <div className="flex items-center gap-3 flex-wrap">
              {resp?.timestamp && (
                <span className="text-[11px] text-purple-300/60">Last updated {fmtUpdated(resp.timestamp)}</span>
              )}
              <button
                onClick={fetchData}
                disabled={loading}
                title="Reload the latest data"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10 hover:text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                <span className={loading ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <span className="text-xs text-purple-300/70">{loading ? 'Loading…' : `${rows.length.toLocaleString('en-IN')} rows · page ${safePage}/${totalPages}`}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-fuchsia-600/30 via-purple-600/30 to-indigo-600/30 border-b-2 border-fuchsia-400/40 backdrop-blur-xl shadow-lg shadow-purple-900/20">
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">#</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">PO Number</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Order Date &amp; Time</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Remarks</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Previous PO Amount</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">New PO Amount</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Value Lost</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Payment Type</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Buyer Paid</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Refundable</th>
                  <th className="px-4 py-3.5 text-right text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Refund Amount</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Refund Status</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Refund Time</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Shipment Status</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">PO Status</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Brand</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Buyer</th>
                  <th className="px-4 py-3.5 text-left text-sm font-bold text-purple-100 uppercase tracking-wide whitespace-nowrap">Buyer Informed</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr
                    key={r.poNumber}
                    onClick={() => openDrill(r)}
                    className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors cursor-pointer"
                    title="View item-level detail"
                  >
                    <td className="px-4 py-3 text-right tabular-nums text-purple-300/60 whitespace-nowrap">{(safePage - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-fuchsia-200 whitespace-nowrap">{r.poNumber ?? '—'} <span className="text-purple-300/40">↗</span></td>
                    <td className="px-4 py-3 text-purple-100 whitespace-nowrap text-sm">{r.orderDateTime ?? '—'}</td>
                    <td className="px-4 py-3">
                      {(r.remarks ?? '').split(', ').filter(Boolean).map((rm) => (
                        <span key={rm} className={`inline-block mr-1 px-2 py-0.5 rounded-md text-xs font-semibold ${rm === 'Item Removed' ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30' : 'bg-amber-500/15 text-amber-200 border border-amber-400/30'}`}>{rm}</span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-purple-100">{fmtFull(r.prevAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{fmtFull(r.newAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300 font-semibold">{r.valueLost > 0 ? `−${fmtFull(r.valueLost)}` : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.paymentMode ? (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${r.paymentMode === 'COD' ? 'bg-amber-500/15 text-amber-200 border-amber-400/30' : r.paymentMode === 'FULLY_PAID' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' : 'bg-sky-500/15 text-sky-200 border-sky-400/30'}`}>{r.paymentMode}</span>
                      ) : <span className="text-purple-300/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-200">{r.paidAmount != null && r.paidAmount > 0 ? fmtFull(r.paidAmount) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-sky-200">{r.refundableAmount > 0 ? fmtFull(r.refundableAmount) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-purple-100">{r.refundAmount != null ? fmtFull(r.refundAmount) : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.refundStatus ? (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${r.refundStatus === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/15 text-amber-200 border-amber-400/30'}`} title={r.refundId ? `Refund id: ${r.refundId}${r.refundType ? ` · ${r.refundType}` : ''}` : undefined}>{r.refundStatus}</span>
                      ) : r.refundableAmount > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-rose-500/15 text-rose-200 border-rose-400/30">PENDING</span>
                      ) : (
                        <span className="text-purple-300/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-purple-100 text-sm whitespace-nowrap">{r.refundTime ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.shipmentStatus ? (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${shipmentBadge(r.shipmentStatus)}`}>{r.shipmentStatus}</span>
                      ) : <span className="text-purple-300/40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.poStatus ? (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${poStatusBadge(r.poStatus)}`}>{r.poStatus}</span>
                      ) : <span className="text-purple-300/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-purple-100 text-sm max-w-[160px] truncate" title={r.brandName ?? ''}>{r.brandName ?? '—'}</td>
                    <td className="px-4 py-3 text-purple-100 text-sm max-w-[200px] truncate" title={`${r.buyerBusiness ?? ''} ${r.buyerPhone ?? ''}`}>
                      <div className="truncate">{r.buyerBusiness ?? '—'}</div>
                      <div className="text-xs text-sky-300/80 tabular-nums">{r.buyerPhone ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                      {editPo === r.poNumber ? (
                        <div className="flex items-center gap-1 min-w-[240px]">
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !savingInform) saveInform(r.poNumber!); if (e.key === 'Escape') { setEditPo(null); setInformError(null); } }}
                            placeholder="Enter remark…"
                            className="flex-1 min-w-0 bg-white/10 border border-fuchsia-400/40 rounded-md px-2 py-1 text-xs text-white placeholder-purple-300/40 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/50"
                          />
                          <button onClick={() => saveInform(r.poNumber!)} disabled={savingInform} className="px-2 py-1 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/40 text-emerald-100 text-[11px] font-bold disabled:opacity-50">{savingInform ? '…' : 'Save'}</button>
                          <button onClick={() => { setEditPo(null); setInformError(null); }} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-purple-200 text-[11px]">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5">
                          {r.buyerInformed ? (
                            (() => {
                              const info = parseInformed(r.buyerInformed);
                              return (
                                <div className="min-w-0 max-w-[280px]" title={r.buyerInformed}>
                                  <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 max-w-full truncate align-bottom">{info.text}</span>
                                  {(info.by || info.at) && (
                                    <div className="mt-0.5 text-[11px] text-purple-300/70 truncate">
                                      {info.by && <span className="text-purple-200/90">{info.by}</span>}
                                      {info.by && info.at && <span className="text-purple-300/40"> · </span>}
                                      {info.at && <span className="tabular-nums">{info.at}</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : <span className="text-purple-300/40">—</span>}
                          <button onClick={() => { setEditPo(r.poNumber); setDraft(''); setInformError(null); }} title="Add / edit remark" className="px-1.5 py-0.5 rounded text-[11px] text-fuchsia-300 hover:text-white hover:bg-fuchsia-500/20 border border-transparent hover:border-fuchsia-400/30 shrink-0">✎</button>
                        </div>
                      )}
                      {editPo === r.poNumber && informError && <div className="text-[10px] text-rose-300 mt-1 max-w-[260px]">{informError}</div>}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={17} className="px-4 py-10 text-center text-purple-300/60">No modified POs in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {rows.length > 0 && (
            <div className="flex items-center justify-center gap-2 flex-wrap px-6 py-4 border-t border-white/10 bg-white/[0.02]">
              <button onClick={() => goToPage(1)} disabled={safePage <= 1} className={pagerBtn(safePage <= 1)} aria-label="First page">«</button>
              <button onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1} className={pagerBtn(safePage <= 1)}>‹ Prev</button>
              {pageList(safePage, totalPages).map((p, idx) =>
                p === '…' ? (
                  <span key={`e${idx}`} className="px-2 text-purple-300/50 select-none">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`min-w-[40px] px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${p === safePage ? 'bg-fuchsia-500/40 text-white border-fuchsia-400/60 shadow-lg shadow-fuchsia-900/30' : 'bg-white/5 text-purple-200 border-white/10 hover:bg-white/10 hover:text-white'}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages} className={pagerBtn(safePage >= totalPages)}>Next ›</button>
              <button onClick={() => goToPage(totalPages)} disabled={safePage >= totalPages} className={pagerBtn(safePage >= totalPages)} aria-label="Last page">»</button>
              <form
                onSubmit={(e) => { e.preventDefault(); const p = Number(jumpTo); if (Number.isFinite(p) && p > 0) { goToPage(p); setJumpTo(''); } }}
                className="flex items-center gap-2 ml-2"
              >
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpTo}
                  onChange={(e) => setJumpTo(e.target.value)}
                  placeholder={`1–${totalPages}`}
                  className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm text-center placeholder-purple-300/40 focus:outline-none focus:border-fuchsia-400/50 tabular-nums"
                />
                <button type="submit" className="px-4 py-1.5 rounded-lg bg-fuchsia-500/30 hover:bg-fuchsia-500/50 border border-fuchsia-400/50 text-white text-sm font-bold transition-colors">Go</button>
              </form>
            </div>
          )}
        </div>

        {resp && (
          <p className="mt-3 text-xs text-purple-300/50">Updated {new Date(resp.timestamp).toLocaleString('en-IN')}</p>
        )}
      </div>

      {/* Item-level drill modal */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={() => setDrill(null)}>
          <div className="bg-slate-900 border border-fuchsia-400/30 rounded-2xl w-[94vw] max-w-[900px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">PO {drill.po.poNumber} · item detail</h2>
                <p className="text-xs text-purple-300/80 mt-0.5">
                  {drill.po.orderDateTime} · {drill.po.poStatus} · {drill.po.brandName}
                  {' · '}
                  <span className="text-purple-100">{fmtFull(drill.po.prevAmount)} → {fmtFull(drill.po.newAmount)}</span>
                  {drill.po.valueLost > 0 && <span className="text-rose-300 font-semibold"> (−{fmtFull(drill.po.valueLost)})</span>}
                </p>
                {(drill.po.refundableAmount > 0 || drill.po.refundStatus) && (
                  <p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-purple-300/70">Refund</span>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${drill.po.refundStatus === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-200' : drill.po.refundStatus ? 'bg-amber-500/15 text-amber-200' : 'bg-rose-500/15 text-rose-200'}`}>{drill.po.refundStatus ?? 'PENDING'}</span>
                    <span className="text-sky-200">{fmtFull(drill.po.refundAmount ?? drill.po.refundableAmount)}</span>
                    {drill.po.refundType && <span className="text-purple-300/60">{drill.po.refundType}</span>}
                    {drill.po.refundTime && <span className="text-purple-200/80">· {drill.po.refundTime}</span>}
                    {drill.po.refundId && <span className="text-purple-300/50 font-mono text-[10px]">· {drill.po.refundId}</span>}
                  </p>
                )}
              </div>
              <button onClick={() => setDrill(null)} aria-label="Close" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-purple-100 text-lg leading-none shrink-0">×</button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Product Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Change</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Prev Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">New Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Item Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drillLoading && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-purple-300/60">Loading items…</td></tr>
                  )}
                  {!drillLoading && drill.items?.map((it, i) => {
                    const unchanged = it.itemChangeType === 'UNCHANGED';
                    const badge = it.itemChangeType === 'ITEM REMOVED'
                      ? 'bg-rose-500/15 text-rose-200 border-rose-400/30'
                      : it.itemChangeType === 'QUANTITY DECREASED'
                        ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                        : unchanged
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                          : 'bg-white/5 text-purple-200/70 border-white/15';
                    const removed = it.itemChangeType === 'ITEM REMOVED';
                    return (
                      <tr key={`${it.productName}-${i}`} className={`border-b border-white/5 ${removed ? 'bg-rose-500/[0.04]' : unchanged ? 'bg-emerald-500/[0.06]' : ''}`}>
                        <td className={`px-4 py-2.5 ${removed ? 'text-purple-200/70 line-through' : 'text-white'}`}>{it.productName ?? '—'}</td>
                        <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge}`}>{it.itemChangeType}</span></td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">{it.prevQty ?? '—'}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${it.itemChangeType !== 'UNCHANGED' ? 'text-rose-300 font-semibold' : 'text-purple-100'}`}>{it.newQty ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">{fmtFull(it.itemAmount)}</td>
                      </tr>
                    );
                  })}
                  {!drillLoading && drill.items && drill.items.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-purple-300/60">No items found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, sub, tone, compact }: { label: string; value: string; sub?: string; tone: 'fuchsia' | 'rose' | 'amber' | 'emerald' | 'sky'; compact?: boolean }) {
  const tones: Record<string, { border: string; glow: string; value: string; label: string }> = {
    fuchsia: { border: 'border-fuchsia-400/30', glow: 'from-fuchsia-500/20 to-fuchsia-600/0', value: 'text-fuchsia-100', label: 'text-fuchsia-300' },
    rose: { border: 'border-rose-400/30', glow: 'from-rose-500/20 to-rose-600/0', value: 'text-rose-100', label: 'text-rose-300' },
    amber: { border: 'border-amber-400/30', glow: 'from-amber-500/20 to-amber-600/0', value: 'text-amber-100', label: 'text-amber-300' },
    emerald: { border: 'border-emerald-400/30', glow: 'from-emerald-500/20 to-emerald-600/0', value: 'text-emerald-100', label: 'text-emerald-300' },
    sky: { border: 'border-sky-400/30', glow: 'from-sky-500/20 to-sky-600/0', value: 'text-sky-100', label: 'text-sky-300' },
  };
  const s = tones[tone];
  // Full class strings per size (never interpolate Tailwind classes — they'd be purged).
  const box = compact ? 'rounded-xl p-2.5' : 'rounded-2xl p-4';
  const labelSz = compact ? 'text-[9px]' : 'text-[11px]';
  const valueSz = compact ? 'mt-1 text-lg' : 'mt-1.5 text-2xl';
  const subSz = compact ? 'mt-0.5 text-[9px]' : 'mt-1 text-[11px]';
  return (
    <div className={`relative overflow-hidden bg-white/5 backdrop-blur-xl border ${s.border} ${box}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${s.glow} pointer-events-none`} />
      <div className="relative z-10">
        <div className={`${labelSz} font-semibold uppercase tracking-wider ${s.label}`}>{label}</div>
        <div className={`${valueSz} font-bold ${s.value}`}>{value}</div>
        {sub && <div className={`${subSz} text-purple-200/70`}>{sub}</div>}
      </div>
    </div>
  );
}
