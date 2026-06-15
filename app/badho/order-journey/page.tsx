'use client';

/**
 * Order Journey (D2R) — the whole lifecycle of one PO, stitched from order
 * milestones, the courier (Delhivery/Shiprocket) scan trail, PO-linked calls
 * (driver / buyer / seller), the driver's buyer-location QR scan, and phone-
 * matched smartFlo calls (duration + recording) — all merged into a single
 * chronological timeline. Restricted to D2R orders; non-D2R POs show a notice.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  markedPendingTime: string | null;
  markedInProgressTime: string | null;
  markedInTransitTime: string | null;
  markedDeliveredTime: string | null;
  markedCompletedTime: string | null;
  markedRejectedTime: string | null;
  markedCancelledTime: string | null;
  createdAt: string | null;
}
interface Modification { skuLabel: string | null; changeType: string | null; }
interface Qps { monthStart: string | null; qualifiedAmount: number; }

interface ListRow {
  poNumber: number | null; placed: string | null; status: string | null; deliveryStatus: string | null;
  amount: number | null; seller: string | null; buyer: string | null;
  buyerCity: string | null; buyerState: string | null; partner: string | null; awb: string | null;
}
interface ListResp {
  data: ListRow[]; total: number; page: number; pageSize: number; pageCount: number;
  from: string; to: string | null; statuses: string[];
  facets: { status: string; count: number }[];
  delivery: string[];
  deliveryFacets: { status: string; count: number }[];
  error?: string;
}
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
/** Time-only (IST), e.g. "01:26 pm". */
function fmtTime(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true });
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
  if (['PENDING', 'IN_PROGRESS', 'INPROGRESS', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PROCESSING', 'PARTIAL', 'DISPATCHED', 'COURIER_ASSIGNED'].includes(s))
    return 'bg-amber-500/20 text-amber-200 border-amber-400/30';
  return 'bg-white/10 text-purple-100 border-white/20';
}

// PO-status tone for the filter chips + status column, matching the PO Modified
// dashboard's filled-pill bar: completed=green, in-motion=sky, pending=amber,
// rejected/cancelled=rose.
function poStatusTone(status: string | null): string {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'DELIVERED') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  if (s === 'INPROGRESS' || s === 'DISPATCHED' || s === 'IN_PROGRESS') return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
  if (s === 'PENDING') return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
  if (s.startsWith('REJECTED') || s === 'CANCELLED') return 'bg-rose-500/15 text-rose-200 border-rose-400/30';
  return 'bg-white/5 text-purple-200/70 border-white/15';
}

// Friendly chip labels for the split REJECTED sub-buckets.
function poStatusLabel(key: string): string {
  switch (key) {
    case 'REJECTED_RTO': return 'Rejected · RTO';
    case 'REJECTED_SLA': return 'Rejected · SLA';
    case 'REJECTED_OTHER': return 'Rejected · Other';
    default: return key;
  }
}

// ── Merged event model ───────────────────────────────────────────────────────
type EvType = 'order' | 'exception' | 'scan' | 'call' | 'qr' | 'phone';
interface Ev { ms: number; type: EvType; icon: string; title: string; lines: string[]; href?: string; audioSec?: number; }

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

// ── Inline call-recording player ─────────────────────────────────────────────
function fmtClock(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
const PLAYBACK_RATES = [1, 1.25, 1.5, 2];
/** Call-recording player: play/pause, ±10s skip, draggable seek, speed, volume/mute, download. */
function AudioPlayer({ src, hintSec }: { src: string; hintSec?: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(hintSec && hintSec > 0 ? hintSec : 0);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [err, setErr] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null); // non-null while dragging the seek bar

  // Same-origin, range-capable proxy → makes the recording seekable.
  const playSrc = `/api/order-journey/recording?u=${encodeURIComponent(src)}`;

  const toggle = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) {
      // Only one recording plays at a time — pause every other audio element.
      document.querySelectorAll('audio').forEach((o) => { if (o !== a) o.pause(); });
      a.play().catch(() => setErr(true));
    } else a.pause();
  };
  const skip = (delta: number) => {
    const a = ref.current; if (!a) return;
    const max = Number.isFinite(a.duration) ? a.duration : dur || 0;
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), max || a.currentTime + delta);
    setCur(a.currentTime);
  };
  const cycleRate = () => {
    const a = ref.current; if (!a) return;
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    a.playbackRate = next; setRate(next);
  };
  const changeVol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = ref.current; if (!a) return;
    const v = parseFloat(e.target.value); a.volume = v; a.muted = v === 0;
    setVol(v); setMuted(v === 0);
  };
  const toggleMute = () => {
    const a = ref.current; if (!a) return;
    const m = !a.muted; a.muted = m; setMuted(m);
  };

  if (err) {
    return <a href={src} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-indigo-300 hover:text-indigo-200 underline">▶ open recording</a>;
  }
  const btn = 'flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition-colors shrink-0';
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/25 border border-white/10 px-2.5 py-1.5 max-w-2xl flex-wrap">
      <audio
        ref={ref} src={playSrc} preload="none"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); e.currentTarget.playbackRate = rate; }}
        onTimeUpdate={(e) => { if (scrub === null) setCur(e.currentTarget.currentTime); }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }} onError={() => setErr(true)}
        onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)} onSeeked={() => setBuffering(false)} onStalled={() => setBuffering(true)}
      />
      <button type="button" onClick={() => skip(-10)} className={btn} title="Back 10s">«10</button>
      <button type="button" onClick={toggle} className={`${btn} !bg-fuchsia-500/40 hover:!bg-fuchsia-500/60`} title={playing ? 'Pause' : 'Play'}>
        {buffering ? <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : playing ? '❚❚' : '▶'}
      </button>
      <button type="button" onClick={() => skip(10)} className={btn} title="Forward 10s">10»</button>
      <span className="text-[10px] tabular-nums text-purple-200/70 w-9 text-right">{fmtClock(cur)}</span>
      <input
        type="range" min={0} max={dur || 0} step={0.1}
        value={scrub ?? (cur > (dur || 0) ? dur : cur)}
        onChange={(e) => { const v = parseFloat(e.target.value); setScrub(v); if (ref.current) ref.current.currentTime = v; }}
        onPointerUp={() => setScrub(null)} onMouseUp={() => setScrub(null)} onTouchEnd={() => setScrub(null)} onBlur={() => setScrub(null)}
        className="flex-1 min-w-[120px] h-1 accent-fuchsia-400 cursor-pointer" aria-label="Seek"
      />
      <span className="text-[10px] tabular-nums text-purple-200/70 w-9">{fmtClock(dur)}</span>
      <button type="button" onClick={cycleRate} className={`${btn} !w-9 tabular-nums`} title="Playback speed">{rate}×</button>
      <button type="button" onClick={toggleMute} className={btn} title={muted ? 'Unmute' : 'Mute'}>{muted || vol === 0 ? '🔇' : '🔊'}</button>
      <input
        type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={changeVol}
        className="w-14 h-1 accent-fuchsia-400 cursor-pointer shrink-0" aria-label="Volume"
      />
      <a href={src} download target="_blank" rel="noopener noreferrer" className={btn} title="Download recording">⬇</a>
    </div>
  );
}

// ── Calendar helpers ─────────────────────────────────────────────────────────
const DAY_MS = 86400000;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOT_COLOR: Record<EvType, string> = {
  order: 'bg-fuchsia-400', exception: 'bg-rose-400', scan: 'bg-cyan-400',
  call: 'bg-amber-400', qr: 'bg-emerald-400', phone: 'bg-indigo-400',
};
const EV_EMOJI: Record<EvType, string> = {
  order: '📦', exception: '⚠️', scan: '🚚', call: '📞', qr: '📍', phone: '☎️',
};

/**
 * Tint for the calendar's in-journey boxes, driven by the order's current state.
 * Checks the most-advanced state first: RTO (dark red, through RTO-delivered) →
 * delivered/completed (green) → undelivered (light red) → out-for-delivery
 * (violet) → dispatched (blue) → in-progress (yellow) → pending (orange).
 */
function journeyCalTone(poStatus: string | null, deliveryStatus: string | null): { box: string; hover: string; swatch: string; label: string } {
  const ps = (poStatus || '').toUpperCase();
  const ds = (deliveryStatus || '').toUpperCase();
  if (ds.includes('RTO')) return { box: 'bg-red-800/55 border border-red-500/60', hover: 'hover:bg-red-800/70', swatch: 'bg-red-700', label: 'RTO' };
  if (ds === 'DELIVERED' || ps === 'COMPLETED') return { box: 'bg-emerald-500/30 border border-emerald-400/60', hover: 'hover:bg-emerald-500/45', swatch: 'bg-emerald-500', label: ds === 'DELIVERED' ? 'Delivered' : 'Completed' };
  if (ds === 'UNDELIVERED') return { box: 'bg-rose-400/35 border border-rose-300/60', hover: 'hover:bg-rose-400/50', swatch: 'bg-rose-400', label: 'Undelivered' };
  if (ds === 'OUT_FOR_DELIVERY') return { box: 'bg-violet-500/40 border border-violet-400/60', hover: 'hover:bg-violet-500/55', swatch: 'bg-violet-500', label: 'Out for delivery' };
  if (ps === 'DISPATCHED') return { box: 'bg-blue-500/35 border border-blue-400/60', hover: 'hover:bg-blue-500/50', swatch: 'bg-blue-500', label: 'Dispatched' };
  if (ps === 'INPROGRESS' || ps === 'IN_PROGRESS') return { box: 'bg-yellow-400/30 border border-yellow-300/60', hover: 'hover:bg-yellow-400/45', swatch: 'bg-yellow-400', label: 'In progress' };
  if (ps === 'PENDING') return { box: 'bg-orange-500/35 border border-orange-400/60', hover: 'hover:bg-orange-500/50', swatch: 'bg-orange-500', label: 'Pending' };
  return { box: 'bg-fuchsia-500/25 border border-fuchsia-400/50', hover: 'hover:bg-fuchsia-500/40', swatch: 'bg-fuchsia-500/50', label: ps ? ps.replace(/_/g, ' ') : 'In journey' };
}
// ── Per-day proportional state fill ──────────────────────────────────────────
type CalState = 'pending' | 'inprogress' | 'dispatched' | 'ofd' | 'undelivered' | 'delivered' | 'rto';
interface StateSeg { start: number; end: number; state: CalState; }
const STATE_FILL: Record<CalState, string> = {
  pending: 'rgba(249,115,22,0.60)',     // orange
  inprogress: 'rgba(250,204,21,0.55)',  // yellow
  dispatched: 'rgba(59,130,246,0.60)',  // blue
  ofd: 'rgba(139,92,246,0.65)',         // violet
  undelivered: 'rgba(251,113,133,0.60)',// light red
  delivered: 'rgba(16,185,129,0.60)',   // green
  rto: 'rgba(153,27,27,0.80)',          // dark red
};
const STATE_ORDER: CalState[] = ['pending', 'inprogress', 'dispatched', 'ofd', 'undelivered', 'rto', 'delivered'];
const STATE_LABEL: Record<CalState, string> = {
  pending: 'Pending', inprogress: 'In progress', dispatched: 'Dispatched', ofd: 'Out for delivery',
  undelivered: 'Undelivered', delivered: 'Delivered', rto: 'RTO',
};
/** Map a courier scan status string to a calendar state. */
function scanState(status: string | null): CalState {
  const s = (status || '').toUpperCase();
  if (s.includes('RTO') || s.includes('RETURN')) return 'rto';
  if (s.includes('UNDELIV') || s.includes('FAIL')) return 'undelivered';
  if (s.includes('OUT FOR DELIVERY') || s.includes('OUT_FOR')) return 'ofd';
  if (s.includes('DELIVERED')) return 'delivered';
  return 'dispatched'; // in transit / picked / manifested / reached
}
/** IST-midnight epoch for a 'YYYY-MM-DD' key (IST has no DST → fixed +05:30). */
function istDayStartMs(key: string): number {
  return new Date(`${key}T00:00:00+05:30`).getTime();
}

/** Calendar day (IST) for an epoch ms, as 'YYYY-MM-DD'. */
function istKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
/** 'YYYY-MM-DD' → UTC-midnight epoch (used only for grid math, tz-stable). */
function keyToUTC(k: string): number {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function utcKey(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function fmtKey(k: string): string {
  return new Date(keyToUTC(k)).toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

interface CalCell { key: string; day: number; inSpan: boolean; isStart: boolean; isEnd: boolean; types: EvType[]; }
interface CalPanel { label: string; weeks: (CalCell | null)[][]; }

/**
 * Calendar overview of a journey: highlights the placed→last-event span and
 * marks each day with colored dots per event type. Multi-month spans render as
 * separate month panels, each trimmed to only the weeks the journey touches
 * (the "partial / adjusted" view). Clicking a marked day calls onSelectDay.
 */
function JourneyCalendar({
  events, selectedDay, onSelectDay, poStatus, deliveryStatus, segments,
}: { events: Ev[]; selectedDay: string | null; onSelectDay: (k: string) => void; poStatus: string | null; deliveryStatus: string | null; segments: StateSeg[] }) {
  const tone = journeyCalTone(poStatus, deliveryStatus);
  // Proportional state fill for a day: split 24h by time spent in each state.
  const dayFill = (key: string): string | null => {
    if (segments.length === 0) return null;
    const dayStart = istDayStartMs(key), dayEnd = dayStart + DAY_MS;
    const acc: Partial<Record<CalState, number>> = {};
    let total = 0;
    for (const sg of segments) {
      const s = Math.max(sg.start, dayStart), e = Math.min(sg.end, dayEnd);
      if (e > s) { acc[sg.state] = (acc[sg.state] || 0) + (e - s); total += e - s; }
    }
    if (total <= 0) return null;
    let cum = 0; const stops: string[] = [];
    for (const st of STATE_ORDER) {
      const v = acc[st]; if (!v) continue;
      const frac = (v / total) * 100;
      stops.push(`${STATE_FILL[st]} ${cum.toFixed(1)}%`, `${STATE_FILL[st]} ${(cum + frac).toFixed(1)}%`);
      cum += frac;
    }
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
  };
  const { panels, startKey, endKey, spanDays } = useMemo(() => {
    const dayTypes = new Map<string, Set<EvType>>();
    for (const e of events) {
      const k = istKey(e.ms);
      (dayTypes.get(k) ?? dayTypes.set(k, new Set()).get(k)!).add(e.type);
    }
    const sKey = istKey(events[0].ms);
    const eKey = istKey(events[events.length - 1].ms);
    const startUTC = keyToUTC(sKey), endUTC = keyToUTC(eKey);
    const span = Math.round((endUTC - startUTC) / DAY_MS) + 1;

    const out: CalPanel[] = [];
    const ed = new Date(endUTC);
    let y = new Date(startUTC).getUTCFullYear();
    let mon = new Date(startUTC).getUTCMonth();
    const endY = ed.getUTCFullYear(), endMon = ed.getUTCMonth();
    while (y < endY || (y === endY && mon <= endMon)) {
      // Render the FULL month (padded to whole weeks), with the journey days
      // highlighted within it.
      const monthFirst = Date.UTC(y, mon, 1), monthLast = Date.UTC(y, mon + 1, 0);
      const gridFrom = monthFirst - new Date(monthFirst).getUTCDay() * DAY_MS;
      const gridTo = monthLast + (6 - new Date(monthLast).getUTCDay()) * DAY_MS;
      const weeks: (CalCell | null)[][] = [];
      for (let cur = gridFrom; cur <= gridTo; ) {
        const week: (CalCell | null)[] = [];
        for (let i = 0; i < 7; i++, cur += DAY_MS) {
          const dt = new Date(cur);
          if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mon) { week.push(null); continue; }
          const k = utcKey(cur);
          week.push({
            key: k, day: dt.getUTCDate(),
            inSpan: cur >= startUTC && cur <= endUTC,
            isStart: cur === startUTC, isEnd: cur === endUTC,
            types: [...(dayTypes.get(k) ?? [])],
          });
        }
        weeks.push(week);
      }
      out.push({ label: new Date(Date.UTC(y, mon, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric' }), weeks });
      mon++; if (mon > 11) { mon = 0; y++; }
    }
    return { panels: out, startKey: sKey, endKey: eKey, spanDays: span };
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">Journey Calendar</h2>
        <div className="text-xs text-purple-300/80">
          <span className="text-emerald-300 font-semibold">{fmtKey(startKey)}</span>
          <span className="text-purple-300/50"> → </span>
          <span className="text-fuchsia-300 font-semibold">{fmtKey(endKey)}</span>
          <span className="text-purple-300/50"> · {spanDays} day{spanDays > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {panels.map((panel, pi) => (
          <div key={pi} className="min-w-[320px] flex-1 max-w-[680px]">
            <div className="text-base font-semibold text-fuchsia-200 mb-2 text-center">{panel.label}</div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((w, i) => <div key={i} className="text-[11px] text-purple-300/40 text-center font-semibold">{w}</div>)}
            </div>
            <div className="space-y-1.5">
              {panel.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((cell, ci) => {
                    if (!cell) return <div key={ci} />;
                    const has = cell.types.length > 0;
                    const sel = selectedDay === cell.key;
                    const fill = cell.inSpan ? dayFill(cell.key) : null;
                    return (
                      <button
                        key={ci} type="button" disabled={!has}
                        onClick={() => has && onSelectDay(cell.key)}
                        style={fill ? { background: fill } : undefined}
                        title={has ? `${fmtKey(cell.key)} · ${cell.types.join(', ')} — click to jump` : fmtKey(cell.key)}
                        className={[
                          'relative min-h-[62px] rounded-lg flex flex-col items-center gap-1 pt-1.5 pb-1 px-1 transition-colors overflow-hidden',
                          fill ? 'border border-white/20 text-white' : cell.inSpan ? `${tone.box} text-white` : 'bg-white/[0.025] border border-transparent text-purple-300/40',
                          has ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
                          cell.isStart ? 'ring-2 ring-emerald-400/80' : '',
                          cell.isEnd && !cell.isStart ? 'ring-2 ring-fuchsia-400/80' : '',
                          sel ? 'ring-2 ring-white' : '',
                        ].join(' ')}
                      >
                        <span className={`text-sm leading-none ${cell.inSpan ? 'font-bold' : 'font-medium'}`}>{cell.day}</span>
                        {has && (
                          <span className="flex flex-wrap gap-x-1 gap-y-0.5 justify-center leading-none text-xs">
                            {cell.types.map((t, ti) => <span key={ti} title={t}>{EV_EMOJI[t]}</span>)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-purple-300/70">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-1 ring-emerald-400/70 inline-block" /> Start</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-1 ring-fuchsia-400/70 inline-block" /> End</span>
        {STATE_ORDER.filter((st) => segments.some((s) => s.state === st)).map((st) => (
          <span key={st} className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: STATE_FILL[st] }} /> {STATE_LABEL[st]}</span>
        ))}
        <span className="text-purple-300/50">·</span>
        <span className="flex items-center gap-2">
          {(['order', 'scan', 'call', 'qr', 'phone'] as EvType[]).map((t) => (
            <span key={t} className="flex items-center gap-0.5">{EV_EMOJI[t]} {t}</span>
          ))}
        </span>
        <span className="w-full text-purple-300/50">Each day is split by time spent in each state (24h proportional) · click a marked day to jump to its events ↓</span>
      </div>
    </div>
  );
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

  const poParam = searchParams.get('po');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resp, setResp] = useState<JourneyResp | null>(null);
  const [queriedPo, setQueriedPo] = useState('');
  const [searchError, setSearchError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // List view state
  const [list, setList] = useState<ListResp | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [listPage, setListPage] = useState(1);
  const [fromDate, setFromDate] = useState('2026-01-15');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [preset, setPreset] = useState<'all' | '7' | '30' | '90' | 'ytd' | 'custom'>('all');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [jumpInput, setJumpInput] = useState('');

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
    setLoading(true); setError(''); setResp(null); setQueriedPo(trimmed); setSelectedDay(null);
    try {
      const r = await fetch(`/api/order-journey?poNumber=${encodeURIComponent(trimmed)}`);
      const j: JourneyResp = await r.json();
      if (!r.ok) setError(j.error || 'Failed to load journey.');
      else setResp(j);
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }, []);

  // Journey mode: load when ?po is present.
  useEffect(() => {
    if (!authChecked) return;
    if (poParam && /^\d+$/.test(poParam)) { setInput(poParam); fetchJourney(poParam); }
  }, [authChecked, poParam, fetchJourney]);

  // List mode: load the orders table when no ?po.
  useEffect(() => {
    if (!authChecked || poParam) return;
    let cancelled = false;
    setListLoading(true); setListError('');
    const qs = new URLSearchParams({ page: String(listPage), pageSize: String(pageSize), from: fromDate });
    if (toDate) qs.set('to', toDate);
    if (statusFilter.length) qs.set('status', statusFilter.join(','));
    if (deliveryFilter.length) qs.set('delivery', deliveryFilter.join(','));
    fetch(`/api/order-journey/list?${qs.toString()}`)
      .then((r) => r.json())
      .then((j: ListResp) => { if (!cancelled) { if (j.error) setListError(j.error); else { setList(j); setLastUpdated(Date.now()); } } })
      .catch(() => { if (!cancelled) setListError('Failed to load orders.'); })
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [authChecked, poParam, listPage, pageSize, fromDate, toDate, statusFilter, deliveryFilter, refreshKey]);

  const FLOOR = '2026-01-15';
  const applyPreset = (p: typeof preset) => {
    setPreset(p); setListPage(1);
    if (p === 'custom') return; // reveal the From/To inputs, keep current range
    const clamp = (s: string) => (s < FLOOR ? FLOOR : s);
    const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (p === 'all') { setFromDate(FLOOR); setToDate(''); return; }
    const today = new Date();
    if (p === 'ytd') { setFromDate(clamp(`${today.getFullYear()}-01-01`)); setToDate(''); return; }
    const days = p === '7' ? 7 : p === '30' ? 30 : 90;
    const f = new Date(today); f.setDate(f.getDate() - days);
    setFromDate(clamp(isoOf(f))); setToDate('');
  };

  const exportCsv = () => {
    const qs = new URLSearchParams({ format: 'csv', from: fromDate });
    if (toDate) qs.set('to', toDate);
    if (statusFilter.length) qs.set('status', statusFilter.join(','));
    if (deliveryFilter.length) qs.set('delivery', deliveryFilter.join(','));
    window.open(`/api/order-journey/list?${qs.toString()}`, '_blank');
  };

  const goToPage = () => {
    const n = parseInt(jumpInput, 10);
    if (list && Number.isFinite(n) && n >= 1 && n <= list.pageCount) setListPage(n);
    setJumpInput('');
  };

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setListPage(1);
  };
  const toggleDelivery = (s: string) => {
    setDeliveryFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setListPage(1);
  };

  // Search resolves a PO Number OR an AWB, then opens that order's journey.
  const onSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = input.trim();
    if (!term) return;
    setResolving(true); setSearchError('');
    try {
      const r = await fetch(`/api/order-journey/resolve?q=${encodeURIComponent(term)}`);
      const j = await r.json();
      if (j.found && j.poNumber) router.push(`/badho/order-journey?po=${j.poNumber}`);
      else setSearchError(`No order found for “${term}”. Enter a PO Number or AWB.`);
    } catch { setSearchError('Search failed — please try again.'); }
    finally { setResolving(false); }
  };

  const openPo = (pn: number | null) => { if (pn != null) router.push(`/badho/order-journey?po=${pn}`); };

  // Calendar day click → toggle selection + scroll the first event of that day into view.
  const handleSelectDay = (key: string) => {
    setSelectedDay((prev) => (prev === key ? null : key));
    const idx = events.findIndex((e) => istKey(e.ms) === key);
    if (idx >= 0) setTimeout(() => document.getElementById(`oj-ev-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
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
      const clInbound = (cl.callType || '').toUpperCase() === 'INBOUND';
      if (cl.agentName) lines.push(`${clInbound ? '🎧 Answered in support by' : '📤 Placed by'} ${cl.agentName}`);
      if (cl.entity === 'RIDER' && cl.riderPhone) lines.push(`Driver: ${cl.riderPhone}`);
      lines.push(fmtTime(ms));
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
      const inbound = dir === 'inbound';
      const title = `${inbound ? 'Inbound' : 'Outbound'} call · ${partyLabel}`;
      const lines: string[] = [];
      const durSec = pc.duration != null ? Number(pc.duration) : null;
      const dur = durSec != null ? fmtClock(durSec) : '';
      lines.push([pc.callStatus, dur].filter(Boolean).join(' · ') || 'phone-matched');
      const agent = pc.agentName?.trim();
      if (agent) lines.push(`${inbound ? '🎧 Answered in support by' : '📤 Placed by'} ${agent}`);
      if (durSec != null && durSec > 0) lines.push(`${fmtTime(ms)} → ${fmtTime(ms + durSec * 1000)}`);
      else lines.push(fmtTime(ms));
      lines.push('via smartFlo (phone-matched)');
      out.push({ ms, type: 'phone', icon: '☎️', title, lines, href: pc.recordingUrl || undefined, audioSec: durSec ?? undefined });
    }

    out.sort((a, b) => a.ms - b.ms);
    return out;
  }, [resp]);

  const totalGap = events.length >= 2 ? fmtGap(events[0].ms, events[events.length - 1].ms) : '';

  // State intervals for the per-day proportional calendar fill: milestone times
  // + courier scan statuses → ordered segments, each running to the next change.
  const stateSegments = useMemo<StateSeg[]>(() => {
    const po = resp?.po;
    if (!po || events.length === 0) return [];
    const pts: { ms: number; state: CalState }[] = [];
    const add = (t: string | null | undefined, state: CalState) => { const ms = toMs(t ?? null); if (ms != null) pts.push({ ms, state }); };
    add(po.markedPendingTime, 'pending');
    add(po.markedInProgressTime, 'inprogress');
    add(po.markedDispatchedTime, 'dispatched');
    add(po.markedInTransitTime, 'dispatched');
    for (const sc of resp?.scans ?? []) { const ms = toMs(sc.date); if (ms != null) pts.push({ ms, state: scanState(sc.status) }); }
    add(po.markedDeliveredTime, 'delivered');
    add(po.markedCompletedTime, 'delivered');
    const ds = (po.deliveryStatus || '').toUpperCase();
    if (ds.includes('RTO')) add(po.markedRejectedTime ?? po.markedCancelledTime, 'rto');
    else if (ds === 'UNDELIVERED') add(po.markedRejectedTime, 'undelivered');
    if (pts.length === 0) return [];
    pts.sort((a, b) => a.ms - b.ms);
    const lastMs = events[events.length - 1].ms;
    const segs: StateSeg[] = [];
    for (let i = 0; i < pts.length; i++) {
      const start = pts[i].ms;
      const end = i + 1 < pts.length ? pts[i + 1].ms : lastMs;
      if (end > start) segs.push({ start, end, state: pts[i].state });
    }
    return segs;
  }, [resp, events]);

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

      <div className="mx-auto relative z-10 max-w-[1700px]">
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

        {/* Search (PO Number or AWB) */}
        <form onSubmit={onSearch} className="mb-3 flex items-center gap-3 flex-wrap">
          {poParam && (
            <button type="button" onClick={() => router.push('/badho/order-journey')} className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors whitespace-nowrap">
              ← All orders
            </button>
          )}
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <input
              type="text" value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
              placeholder="Search by PO Number or AWB…"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60 text-sm">⌕</span>
            {input && (
              <button type="button" onClick={() => setInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded text-purple-300/70 hover:text-white hover:bg-white/10" title="Clear">×</button>
            )}
          </div>
          <button type="submit" disabled={resolving || !input.trim()} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
            {resolving ? 'Finding…' : 'Track'}
          </button>
        </form>
        {searchError && <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100 text-sm">{searchError}</div>}
        {!searchError && <div className="mb-6" />}

        {poParam && error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">{error}</div>}

        {poParam && !loading && !error && resp && !resp.found && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <div className="text-4xl mb-3 opacity-60">🔍</div>
            <div className="text-purple-100 font-semibold mb-1">No order found for PO #{queriedPo}</div>
            <div className="text-purple-300/70 text-xs">Double-check the PO Number and try again.</div>
          </div>
        )}

        {poParam && !loading && !error && resp?.found && po && (
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

            {/* Detail grid — supporting cards beside the full timeline */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* Left column — courier · calendar */}
              <div className="space-y-6">
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

            {/* Calendar overview */}
            {events.length > 0 && (
              <JourneyCalendar events={events} selectedDay={selectedDay} onSelectDay={handleSelectDay} poStatus={po.status} deliveryStatus={po.deliveryStatus} segments={stateSegments} />
            )}
              </div>

            {/* Merged timeline — right column */}
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
                    const isSelDay = selectedDay != null && istKey(e.ms) === selectedDay;
                    return (
                      <li id={`oj-ev-${i}`} key={i} className={`relative pl-11 pb-5 last:pb-0 rounded-lg transition-colors ${isSelDay ? 'bg-white/[0.07] ring-1 ring-white/25' : ''}`}>
                        {!isLast && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/10" />}
                        <span className={`absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-sm ${st.node}`}>{e.icon}</span>
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div className={`text-sm font-semibold ${st.text}`}>
                            {e.title}
                          </div>
                          {gap && <span className="text-[11px] text-purple-300/50 font-medium">+{gap}</span>}
                        </div>
                        <div className="text-xs text-purple-300/80 mt-0.5">{fmtMs(e.ms)}</div>
                        {e.lines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {e.lines.map((ln, k) => <div key={k} className={`text-[11px] ${st.chip}`}>{ln}</div>)}
                          </div>
                        )}
                        {e.href && <AudioPlayer src={e.href} hintSec={e.audioSec} />}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
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

        {/* Journey loading */}
        {poParam && loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <div className="inline-block w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
            <div className="text-purple-300/70 text-sm mt-3">Loading journey for PO #{queriedPo}…</div>
          </div>
        )}

        {/* ─── LIST VIEW (default — all D2R orders) ─────────────────────────── */}
        {!poParam && (
          <div className="space-y-4">
            {/* Controls — date presets · CSV · rows-per-page */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {([['all', 'All'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['ytd', 'YTD'], ['custom', 'Custom']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => applyPreset(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${preset === k ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="flex items-end gap-2">
                  <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value || FLOOR); setListPage(1); }}
                    className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:border-fuchsia-400/50 focus:outline-none [color-scheme:dark]" />
                  <span className="text-purple-300/50 text-sm self-center">→</span>
                  <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setListPage(1); }}
                    className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:border-fuchsia-400/50 focus:outline-none [color-scheme:dark]" />
                </div>
              )}

              <button onClick={exportCsv} disabled={!list || list.total === 0}
                className="px-3 py-2 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-100 text-xs font-bold disabled:opacity-40 transition-colors">
                ↓ CSV
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/60">Rows per page</span>
                <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                  {[25, 50, 75, 100].map((n) => (
                    <button key={n} onClick={() => { setPageSize(n); setListPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pageSize === n ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Status filter — filled pills (active = ringed, others dimmed) */}
            {list && list.facets.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70 mr-1">PO Status</span>
                  {list.facets.map((f) => {
                    const active = statusFilter.includes(f.status);
                    const dimmed = statusFilter.length > 0 && !active;
                    return (
                      <button
                        key={f.status} onClick={() => toggleStatus(f.status)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${poStatusTone(f.status)} ${active ? 'ring-2 ring-fuchsia-400/60' : ''} ${dimmed ? 'opacity-40 hover:opacity-75' : 'hover:opacity-90'}`}
                      >
                        {poStatusLabel(f.status)} <span className="font-normal opacity-70">({f.count.toLocaleString('en-IN')})</span>
                      </button>
                    );
                  })}
                  {statusFilter.length > 0 && (
                    <button onClick={() => { setStatusFilter([]); setListPage(1); }} className="px-2 py-0.5 rounded-md text-[11px] text-purple-300 hover:text-white hover:bg-white/10 border border-white/10">clear</button>
                  )}
                </div>

                {list.deliveryFacets.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70 mr-1">Shipment Status</span>
                    {list.deliveryFacets.map((f) => {
                      const active = deliveryFilter.includes(f.status);
                      const dimmed = deliveryFilter.length > 0 && !active;
                      const label = f.status.replace(/_/g, ' ');
                      return (
                        <button
                          key={f.status} onClick={() => toggleDelivery(f.status)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${statusTone(f.status)} ${active ? 'ring-2 ring-fuchsia-400/60' : ''} ${dimmed ? 'opacity-40 hover:opacity-75' : 'hover:opacity-90'}`}
                        >
                          {label} <span className="font-normal opacity-70">({f.count.toLocaleString('en-IN')})</span>
                        </button>
                      );
                    })}
                    {deliveryFilter.length > 0 && (
                      <button onClick={() => { setDeliveryFilter([]); setListPage(1); }} className="px-2 py-0.5 rounded-md text-[11px] text-purple-300 hover:text-white hover:bg-white/10 border border-white/10">clear</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {listError && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">{listError}</div>}

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-violet-300/25 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 text-[12px] font-bold uppercase tracking-wider text-white">
                      <th className="px-3 py-3 text-center">#</th>
                      <th className="px-3 py-3 text-center">PO #</th>
                      <th className="px-3 py-3 text-center">Placed</th>
                      <th className="px-3 py-3 text-center">Seller</th>
                      <th className="px-3 py-3 text-center">Buyer</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-3 py-3 text-center">Shipment</th>
                      <th className="px-3 py-3 text-center">Amount</th>
                      <th className="px-3 py-3 text-center">Courier</th>
                      <th className="px-3 py-3 text-center">AWB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listLoading ? (
                      <tr><td colSpan={10} className="px-4 py-16 text-center text-purple-300/70">
                        <div className="inline-block w-7 h-7 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                        <div className="text-sm mt-2">Loading orders…</div>
                      </td></tr>
                    ) : list && list.data.length > 0 ? (
                      list.data.map((r, i) => (
                        <tr key={r.poNumber ?? i} onClick={() => openPo(r.poNumber)}
                          className={`border-t border-white/5 cursor-pointer transition-colors hover:bg-fuchsia-500/[0.08] ${i % 2 === 1 ? 'bg-white/[0.025]' : ''}`}>
                          <td className="px-3 py-2.5 text-center tabular-nums text-purple-300/60 text-xs">{(list.page - 1) * list.pageSize + i + 1}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-fuchsia-200 font-semibold">#{r.poNumber}</td>
                          <td className="px-3 py-2.5 text-center text-purple-200/90 whitespace-nowrap text-xs">{fmtMs(toMs(r.placed))}</td>
                          <td className="px-3 py-2.5 text-center text-white max-w-[260px] truncate" title={r.seller || ''}>{r.seller || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-purple-100 max-w-[220px] truncate" title={r.buyer || ''}>
                            {r.buyer || '—'}
                            <div className="text-[10px] text-purple-300/60">{[r.buyerCity, r.buyerState].filter(Boolean).join(', ')}</div>
                          </td>
                          <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${poStatusTone(r.status)}`}>{r.status || '—'}</span></td>
                          <td className="px-3 py-2.5 text-center">{r.deliveryStatus ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusTone(r.deliveryStatus)}`}>{r.deliveryStatus}</span> : <span className="text-purple-300/40">—</span>}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-white whitespace-nowrap">{inr(r.amount)}</td>
                          <td className="px-3 py-2.5 text-center text-cyan-200/90 text-xs">{r.partner || '—'}</td>
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-purple-200/80">{r.awb || '—'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={10} className="px-4 py-16 text-center text-purple-300/70 text-sm">No D2R orders in this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer — last updated · refresh · row count */}
              {list && (
                <div className="border-t border-white/10 bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap text-xs text-purple-300/70">
                    <div className="flex items-center gap-3">
                      <span>Last updated {lastUpdated != null ? fmtMs(lastUpdated) : '—'}</span>
                      <button onClick={() => setRefreshKey((k) => k + 1)} disabled={listLoading}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10 hover:text-white font-semibold disabled:opacity-50 transition-colors">
                        <span className={listLoading ? 'inline-block animate-spin' : 'inline-block'}>↻</span> Refresh
                      </button>
                    </div>
                    <div>
                      <span className="text-fuchsia-300 font-bold tabular-nums">{list.total.toLocaleString('en-IN')}</span> rows · page <span className="tabular-nums">{list.page}/{list.pageCount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Pagination — first · prev · page · next · last · jump */}
                  {list.pageCount > 1 && (() => {
                    const pgBtn = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
                    return (
                      <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/5 flex-wrap">
                        <button disabled={list.page <= 1 || listLoading} onClick={() => setListPage(1)} className={pgBtn} title="First">«</button>
                        <button disabled={list.page <= 1 || listLoading} onClick={() => setListPage((p) => Math.max(1, p - 1))} className={pgBtn}>‹ Prev</button>
                        <span className="px-3 py-1.5 rounded-lg bg-fuchsia-500/30 border border-fuchsia-400/50 text-white text-xs font-bold tabular-nums">{list.page}</span>
                        <button disabled={list.page >= list.pageCount || listLoading} onClick={() => setListPage((p) => p + 1)} className={pgBtn}>Next ›</button>
                        <button disabled={list.page >= list.pageCount || listLoading} onClick={() => setListPage(list.pageCount)} className={pgBtn} title="Last">»</button>
                        <input
                          value={jumpInput} onChange={(e) => setJumpInput(e.target.value.replace(/[^\d]/g, ''))}
                          onKeyDown={(e) => { if (e.key === 'Enter') goToPage(); }}
                          placeholder={String(list.page)} aria-label="Jump to page"
                          className="w-16 px-2 py-1.5 text-xs text-center rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/40 focus:border-fuchsia-400/50 focus:outline-none tabular-nums" />
                        <button onClick={goToPage} className="px-3 py-1.5 rounded-lg bg-fuchsia-500/30 border border-fuchsia-400/50 text-white text-xs font-bold hover:bg-fuchsia-500/40 transition-colors">Go</button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="text-center text-purple-300/50 text-xs">Click any row to open that order&apos;s full journey · or search a PO Number / AWB above.</div>
          </div>
        )}
      </div>

      <style jsx>{`.animation-delay-2000 { animation-delay: 2s; }`}</style>
    </div>
  );
}
