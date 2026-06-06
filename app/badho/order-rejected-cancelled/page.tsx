'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  ORDER REJECTED / CANCELLED DASHBOARD
 * ─────────────────────────────────────────────────────────────────────
 *  Index-style lookup: nothing renders until the operator searches a PO
 *  number. The matched PO opens as five info cards —
 *    1. Parties     (seller +phone, buyer +phone +address)
 *    2. Delivery    (AWB, delivery id, ticket)
 *    3. Amount      (item total, discounts, coupon, wallet, margin)
 *    4. Items       (per-line breakup, from /api/po-items)
 *    5. Payment     (option, event, paid amount, date)
 *  — plus Reject / Cancel actions. Both open a reason picker; on confirm we
 *  write status + reason + timestamp to purchaseOrder via the dashboard's
 *  guarded API routes (see app/api/order-rejected-cancelled/*).
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrderData {
  poNumber: string;
  markedPendingTime: string | null;
  status: string;
  pushedStatus: string;
  timeline?: {
    pending: string | null;
    inProgress: string | null;
    dispatched: string | null;
    delivered: string | null;
    completed: string | null;
  };
  seller: { businessName: string | null; phone: string | null; location: string | null };
  buyer: { businessName: string | null; phone: string | null; address: string | null };
  delivery: {
    awbNumber: string | null;
    deliveryId: string | null;
    courierName: string | null;
    status: string | null;
    partner: string | null;
    trackingUrl: string | null;
  };
  ticket: {
    reference: string | null;
    status: string | null;
    type: string | null;
    category: string | null;
    subcategory: string | null;
    createdAt: string | null;
  } | null;
  amount: {
    itemTotal: number | null;
    grossAmount: number | null;
    itemDiscount: number | null;
    couponAmount: number | null;
    appliedWalletAmount: number | null;
    sellerDiscount: number | null;
    paymentOptionBadhoDiscount: number | null;
    orderMarginDiscount: number | null;
  };
  payment: { option: string | null; event: string | null; paidAmount: number | null; paymentDate: string | null };
  cancelReason: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  markedCancelledTime: string | null;
  markedRejectedTime: string | null;
}

interface ItemRow {
  id: string;
  brandSKUId: string | null;
  skuLabel: string | null;
  brandLabel: string | null;
  status: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  unitPrice: number | null;
  discount: number | null;
  total: number | null;
}

// Reasons from the buyer-cancellation reference list. Title is what we store
// in cancelReason / rejectReason; the blurb is operator guidance only.
const REASONS: { title: string; blurb: string }[] = [
  { title: 'Order Placed by Mistake', blurb: 'The buyer placed the order unintentionally.' },
  { title: 'Duplicate Order', blurb: 'The buyer has already confirmed a similar order and wants to cancel this one.' },
  { title: 'Wrong Product Selected', blurb: 'The buyer accidentally chose the incorrect product(s).' },
  { title: 'No Longer Needed / Not Interested', blurb: 'The buyer no longer requires the product or has lost interest.' },
  { title: 'Already Purchased Elsewhere', blurb: 'The buyer has procured the product from another vendor.' },
  { title: 'Temporarily Unavailable', blurb: 'The buyer is currently unable to decide or accept the order.' },
  { title: 'Requires Partial Quantity', blurb: 'The buyer only needs a specific portion of the order quantity.' },
  { title: 'Price Too High / Found Cheaper', blurb: 'The buyer finds the product expensive or has a better price elsewhere.' },
  { title: 'Payment Method Issue', blurb: 'The buyer is unable or unwilling to pay in advance.' },
  { title: 'Delivery Expectations Not Met', blurb: 'The buyer has specific delivery requirements.' },
  { title: 'Delivery Timeline Concern', blurb: 'The standard delivery schedule does not meet the buyer’s needs.' },
];

const TERMINAL = new Set(['REJECTED', 'CANCELLED']);

const rupee = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDateTime = (s: string | null) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return s;
  }
};

// Compact gap between two timestamps (for the timeline connectors): days when
// ≥1 day, else hours, else minutes. null when either side is missing/invalid.
const fmtGap = (from: string | null, to: string | null): string | null => {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const days = ms / 86_400_000;
  if (days >= 1) return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
  const hrs = ms / 3_600_000;
  if (hrs >= 1) return `${Math.round(hrs)}h`;
  const mins = Math.round(ms / 60_000);
  return `${mins}m`;
};

const STATUS_BADGE: Record<string, { cls: string; dot: string }> = {
  COMPLETED: { cls: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30', dot: 'bg-cyan-400' },
  DELIVERED: { cls: 'bg-blue-500/15 text-blue-200 border-blue-400/30', dot: 'bg-blue-400' },
  PENDING: { cls: 'bg-amber-500/15 text-amber-200 border-amber-400/30', dot: 'bg-amber-400' },
  REJECTED: { cls: 'bg-rose-500/15 text-rose-200 border-rose-400/30', dot: 'bg-rose-400' },
  CANCELLED: { cls: 'bg-slate-500/15 text-slate-200 border-slate-400/30', dot: 'bg-slate-400' },
};

const DELIVERY_BADGE: Record<string, string> = {
  DELIVERED: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  RTO: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
  RETURNED: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
  IN_TRANSIT: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
  DISPATCHED: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
};

interface Accent {
  chip: string; // gradient for the icon chip
  glow: string; // shadow tint
  bar: string;  // top accent bar gradient
  label: string; // section label text color
}

const ACCENTS: Record<string, Accent> = {
  fuchsia: { chip: 'from-fuchsia-500 to-purple-600', glow: 'shadow-fuchsia-500/40', bar: 'from-fuchsia-400/70 via-purple-400/40 to-transparent', label: 'text-fuchsia-300/90' },
  cyan: { chip: 'from-sky-500 to-cyan-600', glow: 'shadow-cyan-500/40', bar: 'from-sky-400/70 via-cyan-400/40 to-transparent', label: 'text-sky-300/90' },
  emerald: { chip: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/40', bar: 'from-emerald-400/70 via-teal-400/40 to-transparent', label: 'text-emerald-300/90' },
  amber: { chip: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/40', bar: 'from-amber-400/70 via-orange-400/40 to-transparent', label: 'text-amber-300/90' },
  indigo: { chip: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-500/40', bar: 'from-indigo-400/70 via-violet-400/40 to-transparent', label: 'text-indigo-300/90' },
};

const initials = (name: string | null) =>
  (name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();

function Card({ accent, title, icon, action, children, delay = 0 }: { accent: Accent; title: string; icon: string; action?: React.ReactNode; children: React.ReactNode; delay?: number }) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="orc-fade-up group relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.02] backdrop-blur-xl overflow-hidden transition-all duration-300 hover:border-white/20 hover:shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)] hover:-translate-y-1"
    >
      {/* top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accent.bar}`} />
      {/* inner top highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {/* hover sheen */}
      <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(420px_circle_at_var(--mx,50%)_0,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="relative px-5 pt-5 pb-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accent.chip} flex items-center justify-center text-base shadow-lg ${accent.glow} ring-1 ring-white/15`}>
          {icon}
        </div>
        <h3 className="text-[12px] font-bold text-white/90 uppercase tracking-[0.14em] flex-1">{title}</h3>
        {action}
      </div>
      <div className="relative px-5 pb-5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, strong, valueClass }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.06] last:border-0">
      <span className="text-[12px] text-white/45 whitespace-nowrap">{label}</span>
      <span className={`text-right ${strong ? 'text-[15px] font-bold text-white' : 'text-[13px] text-white/85'} ${mono ? 'tabular-nums' : ''} ${valueClass || ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function OrderRejectedCancelledDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [poInput, setPoInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [data, setData] = useState<OrderData | null>(null);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [searchedPo, setSearchedPo] = useState<string | null>(null);

  const [modalAction, setModalAction] = useState<'reject' | 'cancel' | null>(null);
  const [modalStep, setModalStep] = useState<'reason' | 'remark'>('reason');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setEmployeeId(localStorage.getItem('employeeId') || '');
    setEmployeeEmail(localStorage.getItem('employeeEmail') || '');
    setAuthChecked(true);
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    ['authToken', 'employeeId', 'employeeName', 'employeeEmail'].forEach((k) => localStorage.removeItem(k));
    router.replace('/login');
  };

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const po = poInput.trim();
    if (!/^\d+$/.test(po)) {
      setSearchError('Enter a numeric PO number');
      setData(null);
      setItems(null);
      setSearchedPo(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setData(null);
    setItems(null);
    setActionError(null);
    try {
      const [lookupRes, itemsRes] = await Promise.all([
        fetch(`/api/order-rejected-cancelled/lookup?poNumber=${encodeURIComponent(po)}`),
        fetch(`/api/po-items?poNumber=${encodeURIComponent(po)}`),
      ]);
      const lookupJson = await lookupRes.json();
      if (!lookupRes.ok) throw new Error(lookupJson.error || 'Lookup failed');
      setSearchedPo(po);
      setData(lookupJson.found ? lookupJson.data : null);
      if (itemsRes.ok) {
        const itemsJson = await itemsRes.json();
        setItems(Array.isArray(itemsJson.data) ? itemsJson.data : []);
      } else {
        setItems([]);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Lookup failed');
      setSearchedPo(null);
    } finally {
      setSearching(false);
    }
  };

  const openModal = (action: 'reject' | 'cancel') => {
    setModalAction(action);
    setModalStep('reason');
    setSelectedReason(null);
    setRemark('');
    setActionError(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalAction(null);
    setModalStep('reason');
    setSelectedReason(null);
    setRemark('');
    setActionError(null);
  };

  // Picking a reason advances to the remark step (second popup).
  const pickReason = (title: string) => {
    setSelectedReason(title);
    setActionError(null);
    setModalStep('remark');
  };

  const confirmAction = async () => {
    if (!modalAction || !data || !selectedReason) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/order-rejected-cancelled/${modalAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: data.poNumber,
          reason: selectedReason,
          remark: remark.trim() || null,
          employeeId,
          employeeEmail,
          employeeName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `${modalAction} failed`);
      setToast(`PO ${data.poNumber} ${modalAction === 'reject' ? 'rejected' : 'cancelled'} successfully`);
      setModalAction(null);
      setModalStep('reason');
      setSelectedReason(null);
      setRemark('');
      await runSearch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${modalAction} failed`);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const isTerminal = data ? TERMINAL.has(data.status) : false;
  const a = data?.amount;

  return (
    <div className="min-h-screen bg-[#080510] p-4 sm:p-8 relative overflow-hidden">
      {/* Ambient mesh background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-[#160a29] to-slate-950" />
      <div className="pointer-events-none absolute -top-40 left-[15%] w-[36rem] h-[36rem] bg-fuchsia-600/25 rounded-full blur-[130px] orc-float" />
      <div className="pointer-events-none absolute top-1/4 -right-32 w-[32rem] h-[32rem] bg-indigo-600/25 rounded-full blur-[130px] orc-float-slow" />
      <div className="pointer-events-none absolute -bottom-48 left-1/3 w-[34rem] h-[34rem] bg-cyan-500/[0.14] rounded-full blur-[140px] orc-float" />
      {/* Masked fine grid */}
      <div className="pointer-events-none absolute inset-0 orc-grid opacity-[0.05]" />
      {/* Vignette for depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,transparent,rgba(0,0,0,0.6))]" />

      <div className="max-w-[1700px] mx-auto relative z-10">
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
        <div className="mb-6 orc-fade-up">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-fuchsia-200/80 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.9)]" />
            Order Operations
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight orc-text-shimmer bg-[linear-gradient(110deg,#f0abfc,45%,#c084fc,55%,#818cf8,75%,#f0abfc)] bg-clip-text text-transparent">
            Order Rejected / Cancelled
          </h1>
          <p className="text-purple-200/70 text-sm mt-1.5">
            Search a PO number to load its details, then reject or cancel it with a reason.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={runSearch} className="mb-6 flex items-center gap-3 flex-wrap orc-fade-up">
          <div className="relative flex-1 min-w-[260px] max-w-[440px] group">
            <div className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-r from-fuchsia-500/0 via-fuchsia-500/0 to-indigo-500/0 group-focus-within:from-fuchsia-500/30 group-focus-within:to-indigo-500/30 blur-sm transition-all duration-300" />
            <input
              type="text"
              inputMode="numeric"
              value={poInput}
              onChange={(e) => setPoInput(e.target.value)}
              placeholder="Search by PO number…"
              className="relative w-full pl-10 pr-3 py-2.5 text-sm rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/40 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-300/60 text-base z-10">⌕</span>
          </div>
          <button
            type="submit"
            disabled={searching}
            className="orc-shine px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.4)] hover:shadow-[0_0_36px_rgba(217,70,239,0.65)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {toast && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-sm">
            {toast}
          </div>
        )}

        {searchError && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
            {searchError}
          </div>
        )}

        {!searchError && searchedPo && !data && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-10 text-center">
            <div className="text-3xl mb-2 opacity-60">∅</div>
            <div className="text-purple-100 font-semibold">No placed order found for PO {searchedPo}</div>
            <div className="text-purple-300/70 text-xs mt-1">Only non-draft orders are searchable.</div>
          </div>
        )}

        {!searchError && !searchedPo && !searching && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-10 text-center">
            <div className="text-3xl mb-2 opacity-60">⌕</div>
            <div className="text-purple-100 font-semibold">Search a PO number to begin</div>
            <div className="text-purple-300/70 text-xs mt-1">Details and actions appear once a PO is found.</div>
          </div>
        )}

        {data && (() => {
          const badge = STATUS_BADGE[data.status] || { cls: 'bg-white/5 text-white/70 border-white/10', dot: 'bg-white/50' };
          const itemTotals = (items || []).reduce(
            (acc, it) => ({ qty: acc.qty + (it.quantity || 0), discount: acc.discount + (it.discount || 0), total: acc.total + (it.total || 0) }),
            { qty: 0, discount: 0, total: 0 },
          );
          const discountRow = (label: string, v: number | null | undefined) => (
            <Row label={label} value={rupee(v)} mono valueClass={v && v > 0 ? 'text-emerald-300' : 'text-white/85'} />
          );
          return (
          <>
            {/* Hero header */}
            <div className="mb-6 orc-fade-up relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-600/15 via-purple-600/10 to-indigo-600/15 px-6 py-5 shadow-[0_24px_70px_-32px_rgba(217,70,239,0.5)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="absolute -top-12 -right-10 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-3xl pointer-events-none orc-float" />
              <div className="absolute -bottom-16 left-1/4 w-56 h-56 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none orc-float-slow" />
              <div className="relative flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-5 flex-wrap">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-white/50">Purchase Order</div>
                    <div className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-tight bg-gradient-to-br from-white to-purple-200/80 bg-clip-text text-transparent">{data.poNumber}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${badge.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {data.status}
                    </span>
                    <span className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${data.pushedStatus === 'Pushed' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' : 'bg-white/5 text-white/60 border-white/10'}`}>
                      {data.pushedStatus}
                    </span>
                  </div>
                  <div className="pl-1">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Marked Pending</div>
                    <div className="text-sm text-white/90 font-medium">{fmtDateTime(data.markedPendingTime)}</div>
                  </div>
                </div>
                {isTerminal ? (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-white/60">
                    Order already {data.status.toLowerCase()}
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openModal('reject')}
                      className="orc-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-rose-500 to-red-600 ring-1 ring-white/15 shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)] hover:shadow-[0_12px_34px_-6px_rgba(244,63,94,0.9)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
                    >
                      <span className="text-base leading-none">⊘</span> Reject
                    </button>
                    <button
                      onClick={() => openModal('cancel')}
                      className="orc-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-amber-500 to-orange-600 ring-1 ring-white/15 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)] hover:shadow-[0_12px_34px_-6px_rgba(245,158,11,0.9)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
                    >
                      <span className="text-base leading-none">✕</span> Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Existing reason / audit, when terminal */}
            {isTerminal && (
              <div className={`mb-6 px-5 py-4 rounded-2xl border text-sm space-y-1.5 ${data.status === 'REJECTED' ? 'bg-rose-500/[0.07] border-rose-400/20' : 'bg-slate-500/[0.07] border-slate-400/20'}`}>
                {data.status === 'REJECTED' && (
                  <>
                    <div><span className="text-white/45">Reject reason:</span> <span className="text-white/90 font-medium">{data.rejectReason || '—'}</span></div>
                    <div><span className="text-white/45">Rejected by:</span> <span className="text-white/90">{data.rejectedBy || '—'}</span></div>
                    <div><span className="text-white/45">Marked rejected:</span> <span className="text-white/90">{fmtDateTime(data.markedRejectedTime)}</span></div>
                  </>
                )}
                {data.status === 'CANCELLED' && (
                  <>
                    <div><span className="text-white/45">Cancel reason:</span> <span className="text-white/90 font-medium">{data.cancelReason || '—'}</span></div>
                    <div><span className="text-white/45">Marked cancelled:</span> <span className="text-white/90">{fmtDateTime(data.markedCancelledTime)}</span></div>
                  </>
                )}
              </div>
            )}

            {/* Five cards — four info cards in one row on wide screens, items full-width below */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
              {/* 1. Parties */}
              <Card accent={ACCENTS.fuchsia} title="Seller & Buyer" icon="🤝" delay={60}>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/40 to-purple-600/40 border border-fuchsia-400/30 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {initials(data.seller.businessName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-fuchsia-300/80">Seller</div>
                      <div className="text-sm font-semibold text-white truncate">{data.seller.businessName || '—'}</div>
                      <div className="text-xs text-white/55 mt-0.5 flex items-center gap-1.5">
                        <span>📞 {data.seller.phone || '—'}</span>
                      </div>
                      {data.seller.location && <div className="text-xs text-white/45 mt-0.5">📍 {data.seller.location}</div>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/40 to-blue-600/40 border border-indigo-400/30 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {initials(data.buyer.businessName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-indigo-300/80">Buyer</div>
                      <div className="text-sm font-semibold text-white truncate">{data.buyer.businessName || '—'}</div>
                      <div className="text-xs text-white/55 mt-0.5">📞 {data.buyer.phone || '—'}</div>
                      <div className="text-xs text-white/45 mt-1 leading-relaxed">📍 {data.buyer.address || '—'}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 2. Delivery & Ticket */}
              <Card
                accent={ACCENTS.cyan}
                title="Delivery & Ticket"
                icon="🚚"
                delay={120}
                action={data.delivery.status ? (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${DELIVERY_BADGE[data.delivery.status] || 'bg-white/5 text-white/60 border-white/10'}`}>
                    {data.delivery.status}
                  </span>
                ) : null}
              >
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-sky-500/10 to-transparent border border-sky-400/15 mb-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-sky-300/70">AWB Number</div>
                    <div className="text-base font-bold text-white tabular-nums truncate">{data.delivery.awbNumber || '—'}</div>
                  </div>
                  {data.delivery.trackingUrl && (
                    <a
                      href={data.delivery.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-100 transition-colors"
                    >
                      Track ↗
                    </a>
                  )}
                </div>
                <Row label="Delivery Number" value={data.delivery.deliveryId} mono />
                <Row label="Courier" value={[data.delivery.courierName, data.delivery.partner].filter(Boolean).join(' · ') || '—'} />
                <div className="mt-2 pt-2 border-t border-white/[0.08]">
                  {data.ticket ? (
                    <>
                      <Row label="Ticket Ref" value={data.ticket.reference} mono />
                      <Row label="Ticket Status" value={data.ticket.status} />
                      <Row label="Ticket Type" value={[data.ticket.type, data.ticket.category, data.ticket.subcategory].filter(Boolean).join(' · ') || '—'} />
                      <Row label="Raised" value={fmtDateTime(data.ticket.createdAt)} />
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-white/40 italic py-1.5">
                      <span>🎫</span> No support ticket on this delivery
                    </div>
                  )}
                </div>
              </Card>

              {/* 3. Amount breakup */}
              <Card accent={ACCENTS.emerald} title="Amount Breakup" icon="🧾" delay={180}>
                <div className="flex items-end justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-400/15 mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-300/70">Gross Amount</div>
                    <div className="text-2xl font-extrabold text-white tabular-nums">{rupee(a?.grossAmount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-white/40">Item Total</div>
                    <div className="text-sm font-semibold text-white/85 tabular-nums">{rupee(a?.itemTotal)}</div>
                  </div>
                </div>
                {discountRow('Item Discount', a?.orderMarginDiscount)}
                {discountRow('Coupon Applied', a?.couponAmount)}
                {discountRow('Applied Wallet Amount', a?.appliedWalletAmount)}
                {discountRow('Seller Discount', a?.sellerDiscount)}
                {discountRow('Payment-Option Badho Discount', a?.paymentOptionBadhoDiscount)}
              </Card>

              {/* 5. Payment option */}
              <Card accent={ACCENTS.amber} title="Payment" icon="💳" delay={240}>
                <div className="flex items-end justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-400/15 mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-300/70">Paid Amount</div>
                    <div className="text-2xl font-extrabold text-white tabular-nums">{rupee(data.payment.paidAmount)}</div>
                  </div>
                  {data.payment.option && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-100 border border-amber-400/25">
                      {data.payment.option}
                    </span>
                  )}
                </div>
                <Row label="Payment Event" value={data.payment.event} />
                <Row label="Payment Date" value={fmtDateTime(data.payment.paymentDate)} />
              </Card>

              {/* Order timeline — full width chronological stepper */}
              <div className="md:col-span-2 xl:col-span-4">
                <Card accent={ACCENTS.cyan} title="Order Timeline" icon="🕒" delay={270}>
                  {(() => {
                    const steps = [
                      { key: 'pending', label: 'Pending', t: data.timeline?.pending ?? data.markedPendingTime },
                      { key: 'inProgress', label: 'In Progress', t: data.timeline?.inProgress ?? null },
                      { key: 'dispatched', label: 'Dispatched', t: data.timeline?.dispatched ?? null },
                      { key: 'delivered', label: 'Delivered', t: data.timeline?.delivered ?? null },
                      { key: 'completed', label: 'Completed', t: data.timeline?.completed ?? null },
                    ];
                    const lastReached = steps.reduce((acc, s, i) => (s.t ? i : acc), -1);
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-0 pt-1">
                        {steps.map((s, i) => {
                          const reached = !!s.t;
                          // Gap shown on the connector leaving this step: from the
                          // last reached step at-or-before i to the next reached
                          // step (bridges skipped milestones like Dispatched).
                          let gap: string | null = null;
                          if (i < steps.length - 1 && s.t) {
                            const next = steps.slice(i + 1).find((n) => n.t);
                            if (next) gap = fmtGap(s.t, next.t);
                          }
                          return (
                            <div key={s.key} className="relative flex sm:flex-col sm:items-center sm:text-center flex-1 items-center gap-3 sm:gap-0">
                              {i < steps.length - 1 && (
                                <span className="hidden sm:block absolute top-[11px] left-1/2 w-full h-[2px]">
                                  <span className={`block w-full h-full ${i < lastReached ? 'bg-gradient-to-r from-cyan-400/70 to-cyan-400/30' : 'bg-white/10'}`} />
                                  {gap && (
                                    <span className="absolute left-1/2 -translate-x-1/2 -top-[9px] px-1.5 py-[1px] rounded-full bg-slate-900 border border-cyan-400/25 text-[9px] font-medium text-cyan-200/80 whitespace-nowrap leading-none">
                                      {gap}
                                    </span>
                                  )}
                                </span>
                              )}
                              <span className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${reached ? 'bg-cyan-500/30 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]' : 'bg-white/[0.04] border-white/15'}`}>
                                <span className={`w-2 h-2 rounded-full ${reached ? 'bg-cyan-300' : 'bg-white/25'}`} />
                              </span>
                              <div className="sm:mt-2.5 min-w-0">
                                <div className={`text-[12px] font-semibold ${reached ? 'text-white' : 'text-white/40'}`}>{s.label}</div>
                                <div className={`text-[11px] mt-0.5 tabular-nums ${reached ? 'text-cyan-200/80' : 'text-white/30'}`}>{fmtDateTime(s.t)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Card>
              </div>

              {/* 4. Item breakup — full width */}
              <div className="md:col-span-2 xl:col-span-4">
                <Card
                  accent={ACCENTS.indigo}
                  title="Item Breakup"
                  icon="📦"
                  delay={300}
                  action={items && items.length > 0 ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-200 border border-indigo-400/25">
                      {items.length} item{items.length > 1 ? 's' : ''}
                    </span>
                  ) : null}
                >
                  {items === null ? (
                    <div className="text-sm text-white/50 py-2">Loading items…</div>
                  ) : items.length === 0 ? (
                    <div className="text-sm text-white/40 italic py-2">No items found for this PO</div>
                  ) : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left bg-white/[0.04]">
                            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90 rounded-l-lg">Product</th>
                            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90">Status</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90">Qty</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90">Unit Price</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90">Discount</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-indigo-200/90 rounded-r-lg">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={it.id} className={`border-b border-white/[0.05] hover:bg-white/[0.04] transition-colors ${i % 2 ? 'bg-white/[0.015]' : ''}`}>
                              <td className="px-3 py-3 text-white/90">
                                <div className="font-medium">{it.skuLabel || it.brandSKUId || '—'}</div>
                                {it.brandLabel && <div className="text-[11px] text-white/45">{it.brandLabel}</div>}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${it.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-200 border-rose-400/30' : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'}`}>
                                  {it.status || '—'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-white/90">{it.quantity ?? '—'}{it.quantityUnit ? ` ${it.quantityUnit}` : ''}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-white/90">{rupee(it.unitPrice)}</td>
                              <td className={`px-3 py-3 text-right tabular-nums ${it.discount && it.discount > 0 ? 'text-emerald-300' : 'text-white/90'}`}>{rupee(it.discount)}</td>
                              <td className="px-3 py-3 text-right tabular-nums font-semibold text-white">{rupee(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-indigo-400/20 bg-indigo-500/[0.08]">
                            <td className="px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-indigo-100" colSpan={2}>Total</td>
                            <td className="px-3 py-3 text-right tabular-nums font-bold text-white">{itemTotals.qty}</td>
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-300">{rupee(itemTotals.discount)}</td>
                            <td className="px-3 py-3 text-right tabular-nums font-bold text-white">{rupee(itemTotals.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
          );
        })()}
      </div>

      {/* Reason modal */}
      {modalAction && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md orc-fade-up" onClick={closeModal}>
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/15 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${modalAction === 'reject' ? 'from-rose-400/80 via-red-400/40 to-transparent' : 'from-amber-400/80 via-orange-400/40 to-transparent'}`} />
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {modalStep === 'remark'
                    ? 'Add a remark'
                    : `${modalAction === 'reject' ? 'Reject' : 'Cancel'} order ${data.poNumber}`}
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  {modalStep === 'remark' ? 'Optional note for this order — then confirm' : 'Select a reason to continue'}
                </p>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white text-xl leading-none px-2" aria-label="Close">×</button>
            </div>

            {modalStep === 'reason' ? (
              <div key="reason" className="orc-fade-up overflow-y-auto px-3 py-3 space-y-1.5">
                {REASONS.map((r) => {
                  const active = selectedReason === r.title;
                  return (
                    <button
                      key={r.title}
                      onClick={() => pickReason(r.title)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        active
                          ? 'bg-fuchsia-500/20 border-fuchsia-400/50 shadow-[0_0_18px_rgba(217,70,239,0.25)]'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 ${active ? 'border-fuchsia-400 bg-fuchsia-400' : 'border-white/30'}`} />
                        <div>
                          <div className="text-sm font-semibold text-white">{r.title}</div>
                          <div className="text-xs text-white/60 mt-0.5">{r.blurb}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div key="remark" className="orc-fade-up overflow-y-auto px-6 py-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-white/45">Reason:</span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-100 font-medium">
                    {selectedReason}
                  </span>
                  <button
                    onClick={() => setModalStep('reason')}
                    disabled={submitting}
                    className="text-xs text-white/50 hover:text-white underline underline-offset-2 disabled:opacity-50"
                  >
                    change
                  </button>
                </div>
                <div>
                  <label htmlFor="po-remark" className="block text-xs font-medium text-white/55 mb-1.5">
                    Remark <span className="text-white/35">(optional)</span>
                  </label>
                  <textarea
                    id="po-remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={4}
                    autoFocus
                    maxLength={1000}
                    placeholder="Add any extra context for this order…"
                    className="w-full resize-none rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:bg-white/[0.07] focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/25 transition-all"
                  />
                  <div className="mt-1 text-right text-[11px] text-white/30 tabular-nums">{remark.length}/1000</div>
                </div>
              </div>
            )}

            {actionError && (
              <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-200 text-xs">
                {actionError}
              </div>
            )}

            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                onClick={modalStep === 'remark' ? () => setModalStep('reason') : closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {modalStep === 'remark' ? 'Back' : 'Close'}
              </button>
              {modalStep === 'remark' && (
                <button
                  onClick={confirmAction}
                  disabled={!selectedReason || submitting}
                  className={`orc-shine px-5 py-2 rounded-xl text-sm font-semibold text-white ring-1 ring-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 active:translate-y-0 ${
                    modalAction === 'reject'
                      ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)]'
                      : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)]'
                  }`}
                >
                  {submitting ? 'Saving…' : modalAction === 'reject' ? 'Confirm Reject' : 'Confirm Cancel'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes orcFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(24px, -32px) scale(1.08); }
        }
        .orc-float { animation: orcFloat 16s ease-in-out infinite; }
        .orc-float-slow { animation: orcFloat 24s ease-in-out infinite reverse; }

        .orc-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px);
          background-size: 46px 46px;
          -webkit-mask-image: radial-gradient(ellipse 75% 60% at 50% 35%, black, transparent 78%);
          mask-image: radial-gradient(ellipse 75% 60% at 50% 35%, black, transparent 78%);
        }

        @keyframes orcFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .orc-fade-up { animation: orcFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes orcShimmer { to { background-position: 200% center; } }
        .orc-text-shimmer {
          background-size: 200% auto;
          animation: orcShimmer 5s linear infinite;
        }

        .orc-shine { position: relative; overflow: hidden; isolation: isolate; }
        .orc-shine::after {
          content: '';
          position: absolute;
          top: 0; left: -120%;
          width: 60%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.45), transparent);
          transform: skewX(-20deg);
          transition: left 0.7s ease;
        }
        .orc-shine:hover::after { left: 140%; }

        @media (prefers-reduced-motion: reduce) {
          .orc-float, .orc-float-slow, .orc-text-shimmer, .orc-fade-up { animation: none !important; }
          .orc-shine::after { display: none; }
        }
      `}</style>
    </div>
  );
}
