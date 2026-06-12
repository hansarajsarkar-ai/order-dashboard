'use client';

/**
 * Order Journey (D2R) — the whole lifecycle of one PO, stitched from order
 * milestones, the courier (Delhivery/Shiprocket) scan trail, PO-linked calls
 * (driver / buyer / seller), the driver's buyer-location QR scan, and phone-
 * matched smartFlo calls (duration + recording) — all merged into a single
 * chronological timeline. Restricted to D2R orders; non-D2R POs show a notice.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// ── Types (mirror the API response) ─────────────────────────────────────────
interface Po {
  status: string | null;
  deliveryStatus: string | null;
  sellerName: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  sellerPhone: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  buyerCity: string | null;
  buyerState: string | null;
  amount: number | null;
  itemTotal: number | null;
  totalDiscount: number | null;
  distance: number | null;
  poRatingFromBuyer: number | null;
  poRatingFromSeller: number | null;
  isFalseOrder: boolean | null;
  isRTOReceived: boolean | null;
  cancelReason: string | null;
  rejectReason: string | null;
  settledAmountToSeller: number | null;
  isSettledToSeller: boolean | null;
  isReadyForSettlement: boolean | null;
  remainingDueAmount: number | null;
  refundableAmount: number | null;
  originalPOAmount: number | null;
  poModifiedBuyerInformed: string | null;
  plannedDispatchTime: string | null;
  markedDispatchedTime: string | null;
  createdAt: string | null;
}
interface Modification { skuLabel: string | null; changeType: string | null; }
interface Qps { monthStart: string | null; qualifiedAmount: number; }
interface Courier {
  status: string | null;
  partner: string | null;
  awb: string | null;
  networkRef: string | null;
  trackingUrl: string | null;
  courierName: string | null;
  labelUrl: string | null;
  codAmount: number | null;
  pickupScheduledForDate: string | null;
  rtoClaimStatus: string | null;
  pickupAddressName: string | null;
  pickupPincode: string | null;
  dropName: string | null;
  dropPhone: string | null;
  dropCity: string | null;
  dropState: string | null;
  dropPincode: string | null;
  dropLat: number | null;
  dropLng: number | null;
}
interface Stage { key: string; label: string; kind: 'step' | 'exception'; time: string | null; }
interface Scan { location: string | null; date: string | null; status: string | null; activity: string | null; }
interface Call {
  callType: string | null; entity: string | null; agentName: string | null; riderPhone: string | null;
  callPlacedAt: string | null; callRemarks: string | null; callCount: number | null; whatsappStatus: string | null;
}
interface QrScan {
  createdAt: string | null; outcome: string | null; dropLat: number | null; dropLng: number | null;
  riderLat: number | null; riderLng: number | null; matchedByPoNumber: boolean | null;
}
interface PhoneCall {
  direction: string | null; callStatus: string | null; duration: number | null; startStamp: string | null;
  recordingUrl: string | null; agentName: string | null; party: string | null;
}
interface Item {
  skuLabel: string | null; brandLabel: string | null; status: string | null;
  quantity: number | null; quantityUnit: string | null; total: number | null; isRejected: boolean | null;
}
interface JourneyResp {
  found: boolean; isD2R?: boolean; poNumber?: number; po?: Po; courier?: Courier | null;
  stages?: Stage[]; scans?: Scan[]; calls?: Call[]; qrScans?: QrScan[]; phoneCalls?: PhoneCall[];
  modifications?: Modification[]; qps?: Qps | null; items?: Item[];
  error?: string;
}

// QPS tier → level + gift, by qualifying spend in the PO's month (May 2026+ has
// 5 tiers; earlier months 3). Mirrors the QPS dashboard thresholds.
function qpsStage(amount: number, monthStart: string | null) {
  const mayPlus = (monthStart ?? '') >= '2026-05-01';
  const tiers: [number, string, string][] = mayPlus
    ? [
        [30000, 'Level 5', 'Airfryer / Mixer (₹3000)'],
        [20000, 'Level 4', 'CCTV / Iron (₹2000)'],
        [10000, 'Level 3', 'Speaker (₹1000)'],
        [5000, 'Level 2', 'Mini table fan (₹500)'],
        [3000, 'Level 1', 'Vastu tortoise (₹300)'],
      ]
    : [
        [10000, 'Level 3', 'Speaker (₹1000)'],
        [5000, 'Level 2', 'Mini table fan (₹500)'],
        [3000, 'Level 1', 'Vastu tortoise (₹300)'],
      ];
  const asc = [...tiers].reverse(); // low → high
  for (let i = 0; i < asc.length; i++) {
    const [thr, level, gift] = asc[i];
    if (amount < thr) {
      return { qualified: i > 0, level: i > 0 ? asc[i - 1][1] : null, gift: i > 0 ? asc[i - 1][2] : null,
               nextLevel: level, toNext: thr - amount };
    }
  }
  const top = tiers[0];
  return { qualified: true, level: top[1], gift: top[2], nextLevel: null, toNext: 0 };
}

// ── Time helpers ─────────────────────────────────────────────────────────────
const IST = 'Asia/Kolkata';
/** Parse a DB timestamp to epoch ms. `istNaive` appends +05:30 for offset-less smartFlo stamps. */
function toMs(s: string | null, istNaive = false): number | null {
  if (!s) return null;
  let str = s.trim().replace(' ', 'T');
  if (istNaive && !/[+-]\d\d:?\d\d$/.test(str)) str += '+05:30';
  const t = new Date(str).getTime();
  return Number.isNaN(t) ? null : t;
}
function fmtMs(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: IST, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
/** Human gap, e.g. "1d 4h 12m". */
function fmtGap(fromMs: number | null, toMs2: number | null): string {
  if (fromMs == null || toMs2 == null || toMs2 < fromMs) return '';
  let s = Math.floor((toMs2 - fromMs) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
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
  if (['REJECTED', 'CANCELLED', 'RTO', 'UNDELIVERED'].includes(s)) return 'bg-rose-500/20 text-rose-200 border-rose-400/30';
  if (['PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PROCESSING', 'PARTIAL', 'DISPATCHED', 'COURIER_ASSIGNED'].includes(s))
    return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
  return 'bg-white/10 text-purple-100 border-white/20';
}

// ── Merged event model ───────────────────────────────────────────────────────
type EvType = 'order' | 'exception' | 'scan' | 'call' | 'qr' | 'phone';
interface Ev { ms: number; type: EvType; icon: string; title: string; lines: string[]; href?: string; }

const EV_STYLE: Record<EvType, { node: string; text: string; chip: string }> = {
  order:     { node: 'bg-gradient-to-br from-fuchsia-500/50 to-purple-600/50 border-fuchsia-400/50', text: 'text-white', chip: 'text-fuchsia-200' },
  exception: { node: 'bg-rose-500/30 border-rose-400/60', text: 'text-rose-200', chip: 'text-rose-300' },
  scan:      { node: 'bg-cyan-500/25 border-cyan-400/50', text: 'text-cyan-100', chip: 'text-cyan-300' },
  call:      { node: 'bg-amber-500/25 border-amber-400/50', text: 'text-amber-100', chip: 'text-amber-300' },
  qr:        { node: 'bg-emerald-500/25 border-emerald-400/50', text: 'text-emerald-100', chip: 'text-emerald-300' },
  phone:     { node: 'bg-indigo-500/25 border-indigo-400/50', text: 'text-indigo-100', chip: 'text-indigo-300' },
};

function callTitle(callType: string | null, entity: string | null): string {
  const inbound = (callType || '').toUpperCase() === 'INBOUND';
  const who = (entity || '').toUpperCase();
  const role = who === 'RIDER' ? 'Driver' : who === 'BUYER' ? 'Buyer' : who === 'SELLER' ? 'Seller' : 'Party';
  return inbound ? `${role} called support` : `Support called ${role.toLowerCase()}`;
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
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    ['authToken', 'employeeId', 'employeeName', 'employeeEmail'].forEach((k) => localStorage.removeItem(k));
    router.replace('/login');
  };

  const fetchJourney = useCallback(async (po: string) => {
    const trimmed = po.trim();
    if (!/^\d+$/.test(trimmed)) { setError('Enter a numeric PO Number.'); setResp(null); return; }
    setLoading(true); setError(''); setResp(null); setQueriedPo(trimmed);
    try {
      const r = await fetch(`/api/order-journey?poNumber=${encodeURIComponent(trimmed)}`);
      const j: JourneyResp = await r.json();
      if (!r.ok) setError(j.error || 'Failed to load journey.');
      else setResp(j);
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const po = searchParams.get('po');
    if (po && /^\d+$/.test(po)) { setInput(po); fetchJourney(po); }
  }, [authChecked, searchParams, fetchJourney]);

  const onSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    router.replace(`/badho/order-journey?po=${encodeURIComponent(trimmed)}`);
    fetchJourney(trimmed);
  };

  // ── Build the merged timeline ──────────────────────────────────────────────
  const events: Ev[] = useMemo(() => {
    if (!resp?.found) return [];
    const out: Ev[] = [];

    for (const s of resp.stages ?? []) {
      const ms = toMs(s.time);
      if (ms == null) continue;
      const icon = s.label.includes('Delivered') ? '📍'
        : s.label.includes('Completed') ? '✅'
        : s.label.includes('Dispatched') ? '🚀'
        : s.label.includes('Placed') ? '🛒'
        : s.kind === 'exception' ? '⛔' : '📦';
      out.push({ ms, type: s.kind === 'exception' ? 'exception' : 'order', icon, title: s.label, lines: [] });
    }
    for (const sc of resp.scans ?? []) {
      const ms = toMs(sc.date);
      if (ms == null) continue;
      const lines = [sc.location, sc.status].filter(Boolean) as string[];
      out.push({ ms, type: 'scan', icon: '🚚', title: sc.activity || sc.status || 'Courier scan', lines });
    }
    for (const cl of resp.calls ?? []) {
      const ms = toMs(cl.callPlacedAt);
      if (ms == null) continue;
      const lines: string[] = [];
      if (cl.agentName) lines.push(`Agent: ${cl.agentName}`);
      if (cl.entity === 'RIDER' && cl.riderPhone) lines.push(`Driver: ${cl.riderPhone}`);
      if (cl.callRemarks && cl.callRemarks.trim()) lines.push(`“${cl.callRemarks.trim()}”`);
      if (cl.callCount && cl.callCount > 1) lines.push(`Attempt #${cl.callCount}`);
      if (cl.whatsappStatus) lines.push(`WhatsApp: ${cl.whatsappStatus}`);
      out.push({ ms, type: 'call', icon: '📞', title: callTitle(cl.callType, cl.entity), lines });
    }
    for (const q of resp.qrScans ?? []) {
      const ms = toMs(q.createdAt);
      if (ms == null) continue;
      const lines: string[] = [];
      lines.push(q.outcome === 'ok' ? 'Scan successful' : `Outcome: ${q.outcome || '—'}`);
      if (q.dropLat != null && q.dropLng != null) lines.push(`Buyer GPS: ${q.dropLat.toFixed(4)}, ${q.dropLng.toFixed(4)}`);
      if (q.riderLat != null && q.riderLng != null) lines.push(`Driver GPS: ${q.riderLat.toFixed(4)}, ${q.riderLng.toFixed(4)}`);
      out.push({ ms, type: 'qr', icon: '📍', title: 'Driver scanned buyer-location QR', lines });
    }
    for (const pc of resp.phoneCalls ?? []) {
      const ms = toMs(pc.startStamp, true);
      if (ms == null) continue;
      const partyLabel = pc.party === 'BUYER' ? 'buyer' : pc.party === 'SELLER' ? 'seller' : 'contact';
      const dir = (pc.direction || '').toLowerCase();
      const title = `${dir === 'inbound' ? 'Inbound' : 'Outbound'} call · ${partyLabel}`;
      const lines: string[] = [];
      const dur = pc.duration != null ? `${pc.duration}s` : '';
      lines.push([pc.callStatus, dur].filter(Boolean).join(' · ') || 'phone-matched');
      lines.push('via smartFlo (phone-matched)');
      out.push({ ms, type: 'phone', icon: '☎️', title, lines, href: pc.recordingUrl || undefined });
    }

    out.sort((a, b) => a.ms - b.ms);
    return out;
  }, [resp]);

  const totalGap = events.length >= 2 ? fmtGap(events[0].ms, events[events.length - 1].ms) : '';

  // Brand dispatch SLA badge
  const brandSla = useMemo(() => {
    const planned = toMs(resp?.po?.plannedDispatchTime ?? null);
    const actual = toMs(resp?.po?.markedDispatchedTime ?? null);
    if (planned == null || actual == null) return null;
    const late = actual > planned;
    return { late, label: late ? `Late by ${fmtGap(planned, actual)}` : `On time (${fmtGap(actual, planned)} early)` };
  }, [resp]);

  // Courier transit time (first scan → delivered milestone, else last scan)
  const transit = useMemo(() => {
    const scans = resp?.scans ?? [];
    if (scans.length === 0) return '';
    const first = toMs(scans[0].date);
    const deliveredStage = toMs(resp?.stages?.find((s) => s.label.includes('Delivered'))?.time ?? null);
    const lastScan = toMs(scans[scans.length - 1].date);
    return fmtGap(first, deliveredStage ?? lastScan);
  }, [resp]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const po = resp?.po;
  const courier = resp?.courier;
  const mods = resp?.modifications ?? [];
  const qpsInfo = resp?.qps ? qpsStage(resp.qps.qualifiedAmount, resp.qps.monthStart) : null;
  const qpsMonth = resp?.qps?.monthStart
    ? new Date(resp.qps.monthStart + 'T00:00:00+05:30').toLocaleString('en-IN', { timeZone: IST, month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-5xl mx-auto relative z-10">
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

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            🧭 Order Journey
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            Every step of a D2R order, PO-wise — milestones, courier scans, driver &amp; buyer calls, QR scans and SLA, on one timeline.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={onSearch} className="mb-8 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <input
              type="text" inputMode="numeric" value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Enter PO Number…"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60 text-sm">⌕</span>
            {input && (
              <button type="button" onClick={() => setInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded text-purple-300/70 hover:text-white hover:bg-white/10" title="Clear">×</button>
            )}
          </div>
          <button type="submit" disabled={loading || !input.trim()} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
            {loading ? 'Loading…' : 'Track'}
          </button>
        </form>

        {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">{error}</div>}

        {!loading && !error && resp && !resp.found && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <div className="text-4xl mb-3 opacity-60">🔍</div>
            <div className="text-purple-100 font-semibold mb-1">No order found for PO #{queriedPo}</div>
            <div className="text-purple-300/70 text-xs">Double-check the PO Number and try again.</div>
          </div>
        )}

        {!loading && !error && resp?.found && po && (
          <div className="space-y-6">
            {!resp.isD2R && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100 text-sm">
                ⚠️ PO #{resp.poNumber} is <strong>not a D2R order</strong> (D2R = INTERCITY orders from D2R brand sellers). Showing its journey anyway.
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
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusTone(po.status)}`}>{po.status || '—'}</span>
                  {po.deliveryStatus && <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusTone(po.deliveryStatus)}`}>📦 {po.deliveryStatus}</span>}
                  {po.isRTOReceived && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/20 text-rose-200 border-rose-400/30">RTO Received</span>}
                  {po.isFalseOrder && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/20 text-rose-200 border-rose-400/30">False Order</span>}
                  {mods.length > 0 && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-orange-500/20 text-orange-200 border-orange-400/30">✏️ PO Edited</span>}
                  {po.isSettledToSeller && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/30">💰 Settled</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Seller</div>
                  <div className="text-sm text-white font-medium">{po.sellerName || '—'}</div>
                  <div className="text-xs text-purple-300/70">{[po.sellerCity, po.sellerState].filter(Boolean).join(', ') || '—'}</div>
                  {po.sellerPhone && <div className="text-xs text-purple-300/50 font-mono">{po.sellerPhone}</div>}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Buyer</div>
                  <div className="text-sm text-white font-medium">{po.buyerName || '—'}</div>
                  <div className="text-xs text-purple-300/70">{[po.buyerCity, po.buyerState].filter(Boolean).join(', ') || '—'}</div>
                  {po.buyerPhone && <div className="text-xs text-purple-300/50 font-mono">{po.buyerPhone}</div>}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Order Amount</div>
                  <div className="text-sm text-white font-medium tabular-nums">{inr(po.amount)}</div>
                  {po.totalDiscount != null && po.totalDiscount > 0 && <div className="text-xs text-purple-300/70 tabular-nums">disc {inr(po.totalDiscount)}</div>}
                  {courier?.codAmount != null && courier.codAmount > 0 && <div className="text-xs text-amber-300/80 tabular-nums">COD {inr(courier.codAmount)}</div>}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Total Journey</div>
                  <div className="text-sm text-white font-medium">{totalGap || '—'}</div>
                  {po.distance != null && <div className="text-xs text-purple-300/70 tabular-nums">{po.distance.toFixed(0)} km</div>}
                </div>
              </div>

              {/* SLA + ratings + settlement strip */}
              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-xs items-center">
                {brandSla && (
                  <span className={brandSla.late ? 'text-rose-200' : 'text-emerald-200'}>
                    <span className="text-purple-300/60">Brand dispatch SLA:</span> {brandSla.label}
                  </span>
                )}
                {transit && <span className="text-cyan-200"><span className="text-purple-300/60">Courier transit:</span> {transit}</span>}
                {po.poRatingFromBuyer != null && <span className="text-purple-200"><span className="text-purple-300/60">Buyer rating:</span> ⭐ {po.poRatingFromBuyer}</span>}
                {po.isReadyForSettlement && !po.isSettledToSeller && <span className="text-amber-200">Ready for settlement</span>}
                {po.settledAmountToSeller != null && <span className="text-emerald-200"><span className="text-purple-300/60">Settled to seller:</span> {inr(po.settledAmountToSeller)}</span>}
                {po.remainingDueAmount != null && po.remainingDueAmount > 0 && <span className="text-amber-200"><span className="text-purple-300/60">Due:</span> {inr(po.remainingDueAmount)}</span>}
                {po.cancelReason && <span className="text-rose-200"><span className="text-rose-300/60">Cancel:</span> {po.cancelReason}</span>}
                {po.rejectReason && <span className="text-rose-200"><span className="text-rose-300/60">Reject:</span> {po.rejectReason}</span>}
              </div>

              {/* QPS buyer stage + PO edit detail */}
              {(qpsInfo || mods.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {qpsInfo && (
                    <div className="flex-1 min-w-[240px] rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.07] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wider text-fuchsia-300/70 font-semibold mb-1">
                        🎁 QPS Buyer Stage {qpsMonth && <span className="text-purple-300/50 normal-case">· {qpsMonth}</span>}
                      </div>
                      {qpsInfo.qualified ? (
                        <div className="text-sm text-white font-medium">
                          <span className="text-fuchsia-200 font-bold">{qpsInfo.level}</span> · {qpsInfo.gift}
                          <span className="text-purple-300/70 font-normal"> · {inr(resp!.qps!.qualifiedAmount)} qualified</span>
                          {qpsInfo.nextLevel && (
                            <div className="text-[11px] text-purple-300/60 mt-0.5">{inr(qpsInfo.toNext)} more → {qpsInfo.nextLevel}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-white font-medium">
                          <span className="text-amber-200">Not yet qualified</span>
                          <span className="text-purple-300/70 font-normal"> · {inr(resp!.qps!.qualifiedAmount)} spent</span>
                          <div className="text-[11px] text-purple-300/60 mt-0.5">{inr(qpsInfo.toNext)} more → {qpsInfo.nextLevel}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {mods.length > 0 && (
                    <div className="flex-1 min-w-[240px] rounded-xl border border-orange-400/20 bg-orange-500/[0.07] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wider text-orange-300/70 font-semibold mb-1">
                        ✏️ PO Edited by Seller
                      </div>
                      <div className="text-sm text-white font-medium">
                        {po.originalPOAmount != null && (
                          <span className="tabular-nums">{inr(po.originalPOAmount)} → {inr(po.amount)}</span>
                        )}
                        {po.originalPOAmount != null && po.amount != null && po.originalPOAmount > po.amount && (
                          <span className="text-orange-200 font-normal"> · {inr(po.originalPOAmount - po.amount)} lost</span>
                        )}
                      </div>
                      <div className="text-[11px] text-orange-200/80 mt-0.5">
                        {mods.map((m, i) => (
                          <span key={i}>{i > 0 ? ' · ' : ''}{m.changeType}{m.skuLabel ? `: ${m.skuLabel}` : ''}</span>
                        ))}
                      </div>
                      {po.poModifiedBuyerInformed && (
                        <div className="text-[11px] text-purple-300/60 mt-0.5">Buyer informed: {po.poModifiedBuyerInformed}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Courier card */}
            {courier && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <h2 className="text-lg font-bold text-white">🚚 Courier</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {courier.courierName && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-cyan-500/15 text-cyan-200 border-cyan-400/30">{courier.courierName}</span>}
                    {courier.status && <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusTone(courier.status)}`}>{courier.status}</span>}
                    {courier.rtoClaimStatus && <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/15 text-rose-200 border-rose-400/30">RTO {courier.rtoClaimStatus}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">AWB</div>
                    {courier.trackingUrl && courier.awb ? (
                      <a href={courier.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline font-mono break-all">{courier.awb}</a>
                    ) : (
                      <div className="text-white font-mono break-all">{courier.awb || '—'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Pickup</div>
                    <div className="text-white">{courier.pickupAddressName || '—'}</div>
                    <div className="text-purple-300/70">{courier.pickupPincode || ''}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Drop</div>
                    <div className="text-white">{courier.dropName || '—'}</div>
                    <div className="text-purple-300/70">{[courier.dropCity, courier.dropState].filter(Boolean).join(', ')} {courier.dropPincode || ''}</div>
                    {courier.dropPhone && <div className="text-purple-300/50 font-mono">{courier.dropPhone}</div>}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-purple-300/60 font-semibold mb-0.5">Label</div>
                    {courier.labelUrl ? (
                      <a href={courier.labelUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline">Shipping label ↗</a>
                    ) : <div className="text-purple-300/50">—</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Merged timeline */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-white">Journey Timeline</h2>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-fuchsia-300">📦 Order</span>
                  <span className="text-cyan-300">🚚 Courier</span>
                  <span className="text-amber-300">📞 Call</span>
                  <span className="text-emerald-300">📍 QR</span>
                  <span className="text-indigo-300">☎️ Phone</span>
                </div>
              </div>
              {events.length === 0 ? (
                <div className="text-sm text-purple-300/70">No timeline events recorded for this order yet.</div>
              ) : (
                <ol className="relative">
                  {events.map((e, i) => {
                    const prev = i > 0 ? events[i - 1] : null;
                    const gap = prev ? fmtGap(prev.ms, e.ms) : '';
                    const isLast = i === events.length - 1;
                    const st = EV_STYLE[e.type];
                    return (
                      <li key={i} className="relative pl-11 pb-5 last:pb-0">
                        {!isLast && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/10" />}
                        <span className={`absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-sm ${st.node}`}>{e.icon}</span>
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div className={`text-sm font-semibold ${st.text}`}>
                            {e.title}
                            {e.href && <a href={e.href} target="_blank" rel="noopener noreferrer" className="ml-2 text-[11px] font-normal text-indigo-300 hover:text-indigo-200 underline">▶ recording</a>}
                          </div>
                          {gap && <span className="text-[11px] text-purple-300/50 font-medium">+{gap}</span>}
                        </div>
                        <div className="text-xs text-purple-300/80 mt-0.5">{fmtMs(e.ms)}</div>
                        {e.lines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {e.lines.map((ln, k) => <div key={k} className={`text-[11px] ${st.chip}`}>{ln}</div>)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Items */}
            {resp.items && resp.items.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Items <span className="text-purple-300/60 text-sm font-normal">({resp.items.length})</span></h2>
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
                        <tr key={i} className={`border-t border-white/5 transition-colors hover:bg-white/[0.07] ${i % 2 === 1 ? 'bg-white/[0.025]' : ''} ${it.isRejected ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-2.5 text-center text-white">{it.skuLabel || '—'}</td>
                          <td className="px-4 py-2.5 text-center text-purple-200">{it.brandLabel || '—'}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-purple-100">{it.quantity ?? '—'} {it.quantityUnit || ''}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusTone(it.status)}`}>{it.isRejected ? 'REJECTED' : it.status || '—'}</span>
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

        {!loading && !error && !resp && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <div className="text-4xl mb-3 opacity-60">🧭</div>
            <div className="text-purple-100 font-semibold mb-1">Track a D2R order&apos;s full journey</div>
            <div className="text-purple-300/70 text-sm">Enter a PO Number above to see every milestone, scan, call and QR event on one timeline.</div>
          </div>
        )}
      </div>

      <style jsx>{`.animation-delay-2000 { animation-delay: 2s; }`}</style>
    </div>
  );
}
