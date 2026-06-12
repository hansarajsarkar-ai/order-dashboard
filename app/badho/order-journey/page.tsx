'use client';

/**
 * Order Journey (D2R) — search a PO Number and see its whole lifecycle as a
 * vertical timeline: every milestone it reached, when, and how long it spent
 * between stages. Restricted to D2R orders (isD2RBrandSeller + INTERCITY).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Stage {
  key: string;
  label: string;
  kind: 'step' | 'exception';
  time: string | null;
}

interface Po {
  status: string | null;
  deliveryStatus: string | null;
  deliveryType: string | null;
  deliveryNetwork: string | null;
  sellerName: string | null;
  buyerName: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  buyerCity: string | null;
  buyerState: string | null;
  amount: number | null;
  itemTotal: number | null;
  discount: number | null;
  totalDiscount: number | null;
  distance: number | null;
  awb: string | null;
  lastMileInvoiceNumber: string | null;
  firstMileDeliveryId: string | null;
  lastMileDeliveryId: string | null;
  poRatingFromBuyer: number | null;
  poRatingFromSeller: number | null;
  isFalseOrder: boolean | null;
  isAutoRejected: boolean | null;
  isRTOReceived: boolean | null;
  cancelReason: string | null;
  rejectReason: string | null;
  createdAt: string | null;
  plannedDispatchTime: string | null;
}

interface Item {
  skuLabel: string | null;
  brandLabel: string | null;
  status: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  total: number | null;
  isRejected: boolean | null;
  rejectedComment: string | null;
}

interface JourneyResp {
  found: boolean;
  isD2R?: boolean;
  poNumber?: number;
  po?: Po;
  stages?: Stage[];
  items?: Item[];
  error?: string;
}

const IST = 'Asia/Kolkata';

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Human duration between two ISO timestamps, e.g. "1d 4h 12m".
function fmtDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '';
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return '';
  let s = Math.floor((b - a) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

const inr = (n: number | null | undefined) =>
  n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function statusTone(status: string | null): string {
  const s = (status || '').toUpperCase();
  if (['COMPLETED', 'DELIVERED'].includes(s)) return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30';
  if (['REJECTED', 'CANCELLED', 'RTO'].includes(s)) return 'bg-rose-500/20 text-rose-200 border-rose-400/30';
  if (['PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PROCESSING', 'PARTIAL'].includes(s))
    return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
  return 'bg-white/10 text-purple-100 border-white/20';
}

export default function OrderJourneyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-purple-200 text-sm">Loading…</div>
        </div>
      }
    >
      <OrderJourneyDashboard />
    </Suspense>
  );
}

function OrderJourneyDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resp, setResp] = useState<JourneyResp | null>(null);
  const [queriedPo, setQueriedPo] = useState('');

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

  const fetchJourney = useCallback(async (po: string) => {
    const trimmed = po.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError('Enter a numeric PO Number.');
      setResp(null);
      return;
    }
    setLoading(true);
    setError('');
    setResp(null);
    setQueriedPo(trimmed);
    try {
      const r = await fetch(`/api/order-journey?poNumber=${encodeURIComponent(trimmed)}`);
      const j: JourneyResp = await r.json();
      if (!r.ok) {
        setError(j.error || 'Failed to load journey.');
      } else {
        setResp(j);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Allow deep-linking ?po=123 (also lets the search persist on refresh).
  useEffect(() => {
    if (!authChecked) return;
    const po = searchParams.get('po');
    if (po && /^\d+$/.test(po)) {
      setInput(po);
      fetchJourney(po);
    }
  }, [authChecked, searchParams, fetchJourney]);

  const onSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    router.replace(`/badho/order-journey?po=${encodeURIComponent(trimmed)}`);
    fetchJourney(trimmed);
  };

  // Reached stages, chronologically — drives the timeline rendering.
  const reached = useMemo(() => {
    if (!resp?.stages) return [];
    return resp.stages
      .filter((s) => s.time != null)
      .sort((a, b) => new Date(a.time!).getTime() - new Date(b.time!).getTime());
  }, [resp]);

  const totalDuration = useMemo(() => {
    if (reached.length < 2) return '';
    return fmtDuration(reached[0].time, reached[reached.length - 1].time);
  }, [reached]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-5xl mx-auto relative z-10">
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

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            🧭 Order Journey
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            The whole lifecycle of a D2R order, PO Number-wise — every milestone, when it happened, and the time in between.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={onSearch} className="mb-8 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <input
              type="text"
              inputMode="numeric"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Enter PO Number…"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60 text-sm">⌕</span>
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded text-purple-300/70 hover:text-white hover:bg-white/10"
                title="Clear"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {loading ? 'Loading…' : 'Track'}
          </button>
        </form>

        {/* States */}
        {error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && resp && !resp.found && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <div className="text-4xl mb-3 opacity-60">🔍</div>
            <div className="text-purple-100 font-semibold mb-1">No order found for PO #{queriedPo}</div>
            <div className="text-purple-300/70 text-xs">Double-check the PO Number and try again.</div>
          </div>
        )}

        {!loading && !error && resp?.found && resp.po && (
          <div className="space-y-6">
            {/* D2R notice */}
            {!resp.isD2R && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100 text-sm">
                ⚠️ PO #{resp.poNumber} is <strong>not a D2R order</strong> (this dashboard is scoped to D2R —
                INTERCITY orders from D2R brand sellers). Showing its journey anyway.
              </div>
            )}

            {/* Header card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wider text-purple-300/70 font-semibold">PO Number</div>
                  <div className="text-2xl font-bold text-white font-mono">#{resp.poNumber}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusTone(resp.po.status)}`}>
                    {resp.po.status || '—'}
                  </span>
                  {resp.po.deliveryStatus && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusTone(resp.po.deliveryStatus)}`}>
                      📦 {resp.po.deliveryStatus}
                    </span>
                  )}
                  {resp.po.isRTOReceived && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/20 text-rose-200 border-rose-400/30">
                      RTO Received
                    </span>
                  )}
                  {resp.po.isFalseOrder && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/20 text-rose-200 border-rose-400/30">
                      False Order
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Seller</div>
                  <div className="text-sm text-white font-medium">{resp.po.sellerName || '—'}</div>
                  <div className="text-xs text-purple-300/70">
                    {[resp.po.sellerCity, resp.po.sellerState].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Buyer</div>
                  <div className="text-sm text-white font-medium">{resp.po.buyerName || '—'}</div>
                  <div className="text-xs text-purple-300/70">
                    {[resp.po.buyerCity, resp.po.buyerState].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Order Amount</div>
                  <div className="text-sm text-white font-medium tabular-nums">{inr(resp.po.amount)}</div>
                  {resp.po.totalDiscount != null && resp.po.totalDiscount > 0 && (
                    <div className="text-xs text-purple-300/70 tabular-nums">disc {inr(resp.po.totalDiscount)}</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">
                    Total Journey
                  </div>
                  <div className="text-sm text-white font-medium">{totalDuration || '—'}</div>
                  {resp.po.distance != null && (
                    <div className="text-xs text-purple-300/70 tabular-nums">{resp.po.distance.toFixed(0)} km</div>
                  )}
                </div>
              </div>

              {/* Secondary details */}
              {(resp.po.awb ||
                resp.po.lastMileInvoiceNumber ||
                resp.po.poRatingFromBuyer != null ||
                resp.po.cancelReason ||
                resp.po.rejectReason) && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  {resp.po.awb && (
                    <span className="text-purple-200">
                      <span className="text-purple-300/60">AWB:</span> <span className="font-mono">{resp.po.awb}</span>
                    </span>
                  )}
                  {resp.po.lastMileInvoiceNumber && (
                    <span className="text-purple-200">
                      <span className="text-purple-300/60">Invoice:</span>{' '}
                      <span className="font-mono">{resp.po.lastMileInvoiceNumber}</span>
                    </span>
                  )}
                  {resp.po.poRatingFromBuyer != null && (
                    <span className="text-purple-200">
                      <span className="text-purple-300/60">Buyer rating:</span> ⭐ {resp.po.poRatingFromBuyer}
                    </span>
                  )}
                  {resp.po.poRatingFromSeller != null && (
                    <span className="text-purple-200">
                      <span className="text-purple-300/60">Seller rating:</span> ⭐ {resp.po.poRatingFromSeller}
                    </span>
                  )}
                  {resp.po.cancelReason && (
                    <span className="text-rose-200">
                      <span className="text-rose-300/60">Cancel reason:</span> {resp.po.cancelReason}
                    </span>
                  )}
                  {resp.po.rejectReason && (
                    <span className="text-rose-200">
                      <span className="text-rose-300/60">Reject reason:</span> {resp.po.rejectReason}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <h2 className="text-lg font-bold text-white mb-5">Journey Timeline</h2>
              {reached.length === 0 ? (
                <div className="text-sm text-purple-300/70">No milestone timestamps recorded for this order yet.</div>
              ) : (
                <ol className="relative">
                  {reached.map((s, i) => {
                    const prev = i > 0 ? reached[i - 1] : null;
                    const gap = prev ? fmtDuration(prev.time, s.time) : '';
                    const isException = s.kind === 'exception';
                    const isLast = i === reached.length - 1;
                    return (
                      <li key={s.key} className="relative pl-10 pb-6 last:pb-0">
                        {/* connector line */}
                        {!isLast && (
                          <span className="absolute left-[14px] top-7 bottom-0 w-px bg-gradient-to-b from-fuchsia-400/50 to-purple-500/20" />
                        )}
                        {/* node */}
                        <span
                          className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                            isException
                              ? 'bg-rose-500/25 border-rose-400/50 text-rose-100'
                              : 'bg-gradient-to-br from-fuchsia-500/40 to-purple-600/40 border-fuchsia-400/40 text-white'
                          }`}
                        >
                          {isException ? '!' : i + 1}
                        </span>
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div
                            className={`text-sm font-semibold ${isException ? 'text-rose-200' : 'text-white'}`}
                          >
                            {s.label}
                          </div>
                          {gap && (
                            <span className="text-[11px] text-purple-300/60 font-medium">+{gap} from previous</span>
                          )}
                        </div>
                        <div className="text-xs text-purple-300/80 mt-0.5">{fmtDateTime(s.time)}</div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Items */}
            {resp.items && resp.items.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">
                  Items <span className="text-purple-300/60 text-sm font-normal">({resp.items.length})</span>
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-violet-300/25 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 text-[13px] font-bold uppercase tracking-wider text-white">
                        <th className="px-4 py-3 text-center">SKU</th>
                        <th className="px-4 py-3 text-center">Brand</th>
                        <th className="px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resp.items.map((it, i) => (
                        <tr
                          key={i}
                          className={`border-t border-white/5 transition-colors hover:bg-white/[0.07] ${
                            i % 2 === 1 ? 'bg-white/[0.025]' : ''
                          } ${it.isRejected ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-2.5 text-center text-white">{it.skuLabel || '—'}</td>
                          <td className="px-4 py-2.5 text-center text-purple-200">{it.brandLabel || '—'}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-purple-100">
                            {it.quantity ?? '—'} {it.quantityUnit || ''}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusTone(it.status)}`}
                            >
                              {it.isRejected ? 'REJECTED' : it.status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-white">{inr(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty initial state */}
        {!loading && !error && !resp && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <div className="text-4xl mb-3 opacity-60">🧭</div>
            <div className="text-purple-100 font-semibold mb-1">Track a D2R order&apos;s full journey</div>
            <div className="text-purple-300/70 text-sm">
              Enter a PO Number above to see every milestone from placed to completed.
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
