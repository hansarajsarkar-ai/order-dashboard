'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  ORDER REJECTED / CANCELLED DASHBOARD
 * ─────────────────────────────────────────────────────────────────────
 *  Index-style lookup: nothing renders until the operator searches a PO
 *  number. The matched PO shows its full financial breakdown plus Reject
 *  and Cancel actions. Both actions open a reason picker; on confirm we
 *  write status + reason + timestamp to purchaseOrder via the dashboard's
 *  guarded API routes (see app/api/order-rejected-cancelled/*).
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrderRow {
  poNumber: string;
  markedPendingTime: string | null;
  status: string;
  pushedStatus: string;
  awbNumber: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  itemTotal: number | null;
  grossAmount: number | null;
  itemDiscount: number | null;
  couponAmount: number | null;
  appliedWalletAmount: number | null;
  sellerDiscount: number | null;
  paymentOptionBadhoDiscount: number | null;
  paymentOption: string | null;
  cancelReason: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  markedCancelledTime: string | null;
  markedRejectedTime: string | null;
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

// Full class names so Tailwind's JIT keeps them (no dynamic `text-${x}`).
const alignClass = (align?: string) =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

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

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30',
  DELIVERED: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  PENDING: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
  REJECTED: 'bg-red-500/20 text-red-200 border-red-400/30',
  CANCELLED: 'bg-gray-500/20 text-gray-200 border-gray-400/30',
};

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
  const [row, setRow] = useState<OrderRow | null>(null);
  const [searchedPo, setSearchedPo] = useState<string | null>(null);

  // Reason modal state. action = which write we'll perform on confirm.
  const [modalAction, setModalAction] = useState<'reject' | 'cancel' | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
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
      setRow(null);
      setSearchedPo(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setRow(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/order-rejected-cancelled/lookup?poNumber=${encodeURIComponent(po)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      setSearchedPo(po);
      if (!json.found) {
        setRow(null);
      } else {
        setRow(json.data);
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
    setSelectedReason(null);
    setActionError(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalAction(null);
    setSelectedReason(null);
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!modalAction || !row || !selectedReason) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/order-rejected-cancelled/${modalAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: row.poNumber,
          reason: selectedReason,
          employeeId,
          employeeEmail,
          employeeName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `${modalAction} failed`);
      setToast(`PO ${row.poNumber} ${modalAction === 'reject' ? 'rejected' : 'cancelled'} successfully`);
      setModalAction(null);
      setSelectedReason(null);
      // Re-fetch the row so the table reflects the new status + reason.
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

  const isTerminal = row ? TERMINAL.has(row.status) : false;

  const COLS: { key: string; label: string; render: (r: OrderRow) => React.ReactNode; align?: string }[] = [
    { key: 'marked', label: 'Marked Pending', render: (r) => fmtDateTime(r.markedPendingTime) },
    {
      key: 'pushed',
      label: 'Pushed',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${r.pushedStatus === 'Pushed' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-white/5 text-white/60 border-white/10'}`}>
          {r.pushedStatus}
        </span>
      ),
    },
    {
      key: 'po',
      label: 'PO Number',
      render: (r) => (
        <div>
          <div className="font-semibold text-white">{r.poNumber}</div>
          {r.awbNumber && <div className="text-[11px] text-white/50">AWB: {r.awbNumber}</div>}
        </div>
      ),
    },
    {
      key: 'seller',
      label: 'Seller',
      render: (r) => (
        <div>
          <div className="text-white/90">{r.sellerBusinessName || '—'}</div>
          {r.sellerPhone && <div className="text-[11px] text-white/50">{r.sellerPhone}</div>}
        </div>
      ),
    },
    {
      key: 'buyer',
      label: 'Buyer',
      render: (r) => (
        <div>
          <div className="text-white/90">{r.buyerBusinessName || '—'}</div>
          {r.buyerPhone && <div className="text-[11px] text-white/50">{r.buyerPhone}</div>}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Order Status',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[r.status] || 'bg-white/5 text-white/70 border-white/10'}`}>
          {r.status}
        </span>
      ),
    },
    { key: 'itemTotal', label: 'Item Total', align: 'right', render: (r) => rupee(r.itemTotal) },
    { key: 'gross', label: 'Gross Amount', align: 'right', render: (r) => rupee(r.grossAmount) },
    { key: 'itemDiscount', label: 'Item Discount', align: 'right', render: (r) => rupee(r.itemDiscount) },
    { key: 'coupon', label: 'Coupon Amount', align: 'right', render: (r) => rupee(r.couponAmount) },
    { key: 'wallet', label: 'Applied Wallet Amount', align: 'right', render: (r) => rupee(r.appliedWalletAmount) },
    { key: 'sellerDisc', label: 'Seller Discount', align: 'right', render: (r) => rupee(r.sellerDiscount) },
    { key: 'badhoDisc', label: 'Payment Option Badho Discount', align: 'right', render: (r) => rupee(r.paymentOptionBadhoDiscount) },
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

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Order Rejected / Cancelled
          </h1>
          <p className="text-purple-200/80 text-sm mt-1">
            Search a PO number to load its details, then reject or cancel it with a reason.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={runSearch} className="mb-6 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-[420px]">
            <input
              type="text"
              inputMode="numeric"
              value={poInput}
              onChange={(e) => setPoInput(e.target.value)}
              placeholder="Search by PO number…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60 text-sm">⌕</span>
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.4)] hover:shadow-[0_0_32px_rgba(217,70,239,0.6)] disabled:opacity-50 transition-all"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {toast && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-sm">
            {toast}
          </div>
        )}

        {/* Results */}
        {searchError && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
            {searchError}
          </div>
        )}

        {!searchError && searchedPo && !row && (
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

        {row && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        className={`px-4 py-3 ${alignClass(c.align)} text-[11px] font-semibold uppercase tracking-wide text-purple-200 whitespace-nowrap`}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-purple-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    {COLS.map((c) => (
                      <td key={c.key} className={`px-4 py-4 ${alignClass(c.align)} text-white/90 whitespace-nowrap tabular-nums`}>
                        {c.render(row)}
                      </td>
                    ))}
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      {isTerminal ? (
                        <span className="text-xs text-white/50">No action</span>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openModal('reject')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-100 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => openModal('cancel')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Existing reason / audit footer when already terminal */}
            {isTerminal && (
              <div className="px-4 py-3 border-t border-white/10 text-xs text-white/70 space-y-1">
                {row.status === 'REJECTED' && (
                  <>
                    <div><span className="text-white/50">Reject reason:</span> {row.rejectReason || '—'}</div>
                    <div><span className="text-white/50">Rejected by:</span> {row.rejectedBy || '—'}</div>
                    <div><span className="text-white/50">Marked rejected:</span> {fmtDateTime(row.markedRejectedTime)}</div>
                  </>
                )}
                {row.status === 'CANCELLED' && (
                  <>
                    <div><span className="text-white/50">Cancel reason:</span> {row.cancelReason || '—'}</div>
                    <div><span className="text-white/50">Marked cancelled:</span> {fmtDateTime(row.markedCancelledTime)}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reason modal */}
      {modalAction && row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {modalAction === 'reject' ? 'Reject' : 'Cancel'} order {row.poNumber}
                </h2>
                <p className="text-xs text-white/50 mt-0.5">Select a reason to continue</p>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white text-xl leading-none px-2" aria-label="Close">×</button>
            </div>

            <div className="overflow-y-auto px-3 py-3 space-y-1.5">
              {REASONS.map((r) => {
                const active = selectedReason === r.title;
                return (
                  <button
                    key={r.title}
                    onClick={() => setSelectedReason(r.title)}
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

            {actionError && (
              <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-200 text-xs">
                {actionError}
              </div>
            )}

            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={!selectedReason || submitting}
                className={`px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all ${
                  modalAction === 'reject'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {submitting ? 'Saving…' : modalAction === 'reject' ? 'Confirm Reject' : 'Confirm Cancel'}
              </button>
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
