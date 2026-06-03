'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, ComposedChart, ScatterChart, Scatter, ZAxis, Cell, LabelList,
} from 'recharts';
import { KPICard } from './components/KPICard';
import { ChartCard, type Insight } from './components/InsightPanel';
import { Funnel } from './components/Funnel';
import { Heatmap } from './components/Heatmap';
import { MultiSelect } from './components/MultiSelect';

// ───────────────────────── helpers ─────────────────────────

const fmtInt = (n: number) => (n || 0).toLocaleString('en-IN');
const fmtPct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;
const fmtCompact = (n: number) => {
  if (!n || !Number.isFinite(n)) return '0';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toString();
};
const fmtDuration = (sec: number) => {
  if (!sec || !Number.isFinite(sec)) return '0s';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
};
const fmtTalkTime = (sec: number) => {
  if (!sec || !Number.isFinite(sec)) return '0h';
  const h = sec / 3600;
  if (h < 1) return `${Math.round(sec / 60)}m`;
  if (h < 100) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
};
const fmtDay = (s: string) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '';
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return String(s);
  return dt.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};
const fmtMoney = (n: number | null | undefined) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null;

// One order row in the Daily-Orders drill-down (order detail + the attributing call).
interface DrillOrderRow {
  poNumber: string;
  MarkedpendingTime: string | null;
  markedPendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: number | null;
  poAmount: number | null;
  CoupanAmount: number | null;
  orderStatus: string;
  status: string;
  discountBySeller: number;
  PaymentOptionDiscountByBadho: number;
  appliedWalletAmount: number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: number | null;
  codAmountToBeCollected: number | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callTs: string | null;
}

// ───────────────────────── types ─────────────────────────

interface Overview {
  totalCalls: number; uniqueCustomers: number; uniqueAgents: number;
  connectedCalls: number; missedCalls: number; noAnswerCalls: number; rejectedCalls: number;
  shortCalls: number; meaningfulCalls: number;
  answerRate: number; connectionRate: number; missRate: number;
  avgDuration: number; avgDurationConnected: number; totalTalkTimeSec: number;
  avgCallsPerCustomer: number; avgCallsPerAgent: number;
  repeatContactRate: number; firstContactSuccessRate: number;
}
interface TrendPoint {
  day: string; total: number; connected: number; missed: number; noAnswer: number; rejected: number;
  avgDuration: number; totalTalkTime: number; sma7: number; growthWoW: number | null;
}
interface HeatCell { dow: number; hour: number; total: number; connected: number; connectionRate: number; }
interface HourTotal { hour: number; total: number; connected: number; connectionRate: number; }
interface WeekdayPerf { dow: number; name: string; total: number; connected: number; connectionRate: number; }
interface FunnelStage { name: string; value: number; }
interface AgentRow {
  agentName: string; totalCalls: number; connectedCalls: number; meaningfulCalls: number;
  missedCalls: number; avgDuration: number; totalTalkTime: number; uniqueCustomers: number;
  connectionRate: number; meaningfulRate: number;
  // Same-day order conversion from called customers.
  usersCalled: number; sameDayUsers: number; sameDayRate: number;
  timeslotUsers: number; timeslotRate: number; orderCount: number; gmv: number;
}
interface AgentOrderRow {
  agentName: string; totalCalls: number; uniqueBuyerAttempt: number;
  connected: number; connectedRate: number; connectedUniqueBuyer: number;
  orderPlacedBuyer: number; orderCount: number; orderConvRate: number; avgHaltingMins: number;
  connectedGte15: number; connectedLt15: number; totalTalkHours: number;
}
interface DistBucket { bucket: string; customers: number; }
interface Reach { total: number; reachable: number; unreachable: number; frequentlyMissed: number; }
interface DurBucket { bucket: string; calls: number; }
interface DispoRow { name: string; code: string; calls: number; }
interface OppLoss {
  total: number; missed: number; noAnswer: number; shortCalls: number; notConnected: number;
  missedRate: number; noAnswerRate: number; shortRate: number; notConnectedRate: number;
}
interface FilterOpts {
  agents: { value: string; calls: number }[];
  campaigns: { value: string; calls: number }[];
  statuses: { value: string; calls: number }[];
}

// ───────────────────────── filters bar ─────────────────────────

type Tab = 'dashboard' | 'analytics' | 'daily' | 'table' | 'orders' | 'orders-daily';

// Per-day types used by the Daily Trend tab.
export interface DailyDetailedRow {
  day: string;
  dow: number;
  dowName: string;
  total: number;
  connected: number;
  missed: number;
  noAnswer: number;
  meaningful: number;
  shortCalls: number;
  avgDuration: number;
  totalTalkTime: number;
  uniqueCustomers: number;
  uniqueAgents: number;
  connectionRate: number;
  meaningfulRate: number;
  notConnected: number;
  deltaPrevTotal: number | null;
  deltaPrevPct: number | null;
  wowDeltaPct: number | null;
  wowConnectDelta: number | null;
}
interface DowAggRow { dow: number; name: string; avgCalls: number; avgConnected: number; avgMeaningful: number; connectionRate: number; days: number; }
interface DailySummary {
  todayCalls: number; todayConnectRate: number;
  yesterdayCalls: number; yesterdayConnectRate: number;
  last7Avg: number; prev7Avg: number;
  last7ConnectRate: number; prev7ConnectRate: number;
  windowAvg: number; windowConnectRate: number;
  bestDay: DailyDetailedRow | null;
  worstDay: DailyDetailedRow | null;
  bestConnect: DailyDetailedRow | null;
}
interface DayHourly { hour: number; total: number; connected: number; missed: number; noAnswer: number; avgDuration: number; connectionRate: number; }
interface DailyResp { series: DailyDetailedRow[]; dowAgg: DowAggRow[]; summary: DailySummary; dayHourly?: DayHourly[]; }

export interface MomRow {
  monthKey: string;
  totalAttempts: number;
  uniqueAttempts: number;
  totalConnected: number;
  uniqueConnected: number;
  connectedPct: number;
  connectedUnder15: number;
  connected15Plus: number;
  avgConnectedDuration: number;
  activeAgents: number;
  totalTalkTime: number;
}

export interface BuyerAttemptRow {
  bucket: string;
  totalAtcBuyer: number;
  attemptedSameDay: number;
  attemptRateSameDay: number;
  attemptedNextDayOnly: number;
  totalAttemptedByNextDay: number;
  cumulativeAttemptRate: number;
}
export type BuyerAttemptGrain = 'day' | 'week' | 'month';

interface Filters {
  startDate: string;
  endDate: string;
  agent: string[];
  campaign: string[];
  status: string[];
  direction: string[];
  customer: string;
  minDuration: string;
  maxDuration: string;
  hour: string;
  weekday: string;
}

function defaultFilters(): Filters {
  const today = new Date();
  // Default to the full current calendar year (Jan 1 – Dec 31).
  const year = today.getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  return {
    startDate, endDate,
    agent: [], campaign: [],
    status: [], direction: [], customer: '',
    minDuration: '', maxDuration: '', hour: '', weekday: '',
  };
}

function buildQs(f: Filters): string {
  const p = new URLSearchParams();
  p.set('startDate', f.startDate);
  p.set('endDate', f.endDate);
  if (f.agent.length) p.set('agent', f.agent.join(','));
  if (f.campaign.length) p.set('campaign', f.campaign.join(','));
  if (f.status.length) p.set('status', f.status.join(','));
  if (f.direction.length) p.set('direction', f.direction.join(','));
  if (f.customer) p.set('customer', f.customer);
  if (f.minDuration) p.set('minDuration', f.minDuration);
  if (f.maxDuration) p.set('maxDuration', f.maxDuration);
  if (f.hour) p.set('hour', f.hour);
  if (f.weekday) p.set('weekday', f.weekday);
  return p.toString();
}

// Agent Table period toggle — calendar-to-date windows.
type AgentPeriod = 'day' | 'week' | 'month';

const AGENT_PERIOD_LABEL: Record<AgentPeriod, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
};

function agentPeriodRange(period: AgentPeriod): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const endDate = fmt(today);
  if (period === 'day') return { startDate: endDate, endDate };
  if (period === 'week') {
    // Week starts Monday.
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - mondayOffset);
    return { startDate: fmt(start), endDate };
  }
  // month — 1st of the current calendar month through today.
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: fmt(start), endDate };
}

type DatePreset =
  | { label: string; days: number }
  | { label: 'YTD'; ytd: true }
  | { label: string; fullYear: true };

const CURRENT_YEAR = new Date().getFullYear();

const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', days: 0 },
  { label: '7d',    days: 6 },
  { label: '30d',   days: 29 },
  { label: '90d',   days: 89 },
  { label: 'YTD',   ytd: true },
  { label: String(CURRENT_YEAR), fullYear: true },
];

function presetRange(p: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  if ('fullYear' in p) {
    const y = today.getFullYear();
    return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  }
  if ('ytd' in p) {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  const start = new Date(today.getTime() - p.days * 86400000);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

// Inclusive list of 'YYYY-MM-DD' days between start and end (capped for sanity).
function daysInRange(start: string, end: string, max = 92): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return out;
  for (const d = new Date(s); d <= e && out.length < max; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

// ───────────────────────── insights generators ─────────────────────────

function trendInsights(series: TrendPoint[]): Insight[] {
  const out: Insight[] = [];
  if (!series.length) return out;
  const last = series[series.length - 1];
  const first = series[0];
  const totalSum = series.reduce((a, b) => a + b.total, 0);
  const connSum = series.reduce((a, b) => a + b.connected, 0);
  const missSum = series.reduce((a, b) => a + b.missed + b.noAnswer + b.rejected, 0);
  const avg = totalSum / series.length;
  const growth = first.total > 0 ? ((last.total - first.total) / first.total) * 100 : 0;
  out.push({
    tone: growth > 5 ? 'positive' : growth < -5 ? 'danger' : 'neutral',
    label: 'TREND',
    text: `Call volume ${growth >= 0 ? 'up' : 'down'} ${Math.abs(growth).toFixed(1)}% across the window (avg ${fmtCompact(avg)} calls/day).`,
  });
  if (totalSum > 0) {
    out.push({
      tone: missSum / totalSum > 0.4 ? 'warning' : 'opportunity',
      label: 'LOSS',
      text: `${fmtCompact(missSum)} calls did not connect (${fmtPct(missSum / totalSum)}). Recovering even 20% of these would add ${fmtCompact(missSum * 0.2)} connected interactions.`,
    });
  }
  // peak/trough
  const peak = series.reduce((a, b) => (b.total > a.total ? b : a), series[0]);
  const trough = series.reduce((a, b) => (b.total < a.total ? b : a), series[0]);
  out.push({
    tone: 'neutral',
    label: 'PEAK',
    text: `Peak day was ${fmtDay(peak.day)} (${fmtInt(peak.total)} calls); lowest was ${fmtDay(trough.day)} (${fmtInt(trough.total)}). Investigate the gap.`,
  });
  return out;
}

function durationInsights(series: TrendPoint[]): Insight[] {
  if (!series.length) return [];
  const out: Insight[] = [];
  const avg = series.reduce((a, b) => a + b.avgDuration, 0) / series.length;
  const first7 = series.slice(0, 7);
  const last7 = series.slice(-7);
  const a1 = first7.length ? first7.reduce((a, b) => a + b.avgDuration, 0) / first7.length : 0;
  const a2 = last7.length ? last7.reduce((a, b) => a + b.avgDuration, 0) / last7.length : 0;
  const delta = a1 ? ((a2 - a1) / a1) * 100 : 0;
  out.push({
    tone: a2 < 30 ? 'warning' : a2 > 60 ? 'positive' : 'neutral',
    label: 'QUALITY',
    text: `Average connected call duration is ${fmtDuration(avg)}. ${a2 < 30 ? 'Most conversations are ending too quickly — possible script or pitch issue.' : 'Conversations are reaching meaningful length.'}`,
  });
  out.push({
    tone: delta > 5 ? 'positive' : delta < -5 ? 'warning' : 'neutral',
    label: 'CHANGE',
    text: `Recent 7-day average (${fmtDuration(a2)}) is ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}% vs the first 7 days.`,
  });
  return out;
}

function hourInsights(hours: HourTotal[]): Insight[] {
  if (!hours.length) return [];
  const top3 = [...hours].sort((a, b) => b.total - a.total).slice(0, 3);
  const sumTop3 = top3.reduce((a, b) => a + b.total, 0);
  const sumAll = hours.reduce((a, b) => a + b.total, 0);
  const lowConn = [...hours].filter((h) => h.total > 50).sort((a, b) => a.connectionRate - b.connectionRate)[0];
  return [
    {
      tone: 'opportunity',
      label: 'STAFFING',
      text: `${sumAll ? fmtPct(sumTop3 / sumAll) : '0%'} of call volume hits 3 peak hours: ${top3.map((h) => `${h.hour}:00`).join(', ')}. Concentrate manpower here.`,
    },
    lowConn ? {
      tone: 'warning',
      label: 'GAP',
      text: `Worst connect rate is at ${lowConn.hour}:00 (${fmtPct(lowConn.connectionRate)} of ${fmtInt(lowConn.total)} calls). Either shift volume away or investigate why customers aren't answering.`,
    } : { tone: 'neutral', label: 'GAP', text: 'Connection rate is steady across hours.' },
  ];
}

function weekdayInsights(weekday: WeekdayPerf[]): Insight[] {
  if (!weekday.length) return [];
  const valid = weekday.filter((w) => w.total > 0);
  if (!valid.length) return [];
  const best = valid.reduce((a, b) => (b.total > a.total ? b : a));
  const worst = valid.reduce((a, b) => (b.total < a.total ? b : a));
  const bestConn = valid.reduce((a, b) => (b.connectionRate > a.connectionRate ? b : a));
  return [
    { tone: 'positive', label: 'BEST', text: `${best.name} drives the highest volume (${fmtInt(best.total)}). Plan campaign launches on this day.` },
    { tone: 'warning', label: 'WEAK', text: `${worst.name} is the slowest (${fmtInt(worst.total)} calls). Consider deeper outreach or moving capacity.` },
    { tone: 'opportunity', label: 'CONNECT', text: `${bestConn.name} has the strongest connect rate (${fmtPct(bestConn.connectionRate)}) — ideal for high-priority follow-ups.` },
  ];
}

function funnelInsights(stages: FunnelStage[]): Insight[] {
  if (stages.length < 4) return [];
  const out: Insight[] = [];
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].value;
    const cur = stages[i].value;
    if (!prev) continue;
    const conv = (cur / prev) * 100;
    const drop = prev - cur;
    if (conv < 50 && drop > 0) {
      out.push({
        tone: 'danger',
        label: 'DROP-OFF',
        text: `${stages[i - 1].name} → ${stages[i].name}: only ${conv.toFixed(1)}% advance (${fmtInt(drop)} lost). Biggest leak to fix.`,
      });
    }
  }
  const overall = stages[stages.length - 1].value / (stages[1]?.value || 1);
  out.push({
    tone: overall > 0.05 ? 'positive' : 'opportunity',
    label: 'OUTCOME',
    text: `End-to-end conversion: ${fmtPct(overall)} of called customers reach a successful outcome.`,
  });
  return out.slice(0, 4);
}

function agentInsights(agents: AgentRow[]): Insight[] {
  if (!agents.length) return [];
  const totalCalls = agents.reduce((a, b) => a + b.totalCalls, 0);
  const top10 = [...agents].sort((a, b) => b.totalCalls - a.totalCalls).slice(0, 10);
  const top10Calls = top10.reduce((a, b) => a + b.totalCalls, 0);
  const concentrated = totalCalls ? top10Calls / totalCalls : 0;
  const lowPerformers = agents.filter((a) => a.totalCalls >= 50 && a.connectionRate < 0.25);
  const bestRate = [...agents].filter((a) => a.totalCalls >= 50).sort((a, b) => b.connectionRate - a.connectionRate)[0];
  return [
    {
      tone: concentrated > 0.6 ? 'warning' : 'neutral',
      label: 'CONC.',
      text: `Top 10 agents handle ${fmtPct(concentrated)} of volume. ${concentrated > 0.6 ? 'High concentration — risk if any leave.' : 'Workload is well-distributed.'}`,
    },
    lowPerformers.length ? {
      tone: 'danger',
      label: 'COACH',
      text: `${lowPerformers.length} agents have <25% connect rate on ≥50 calls. Highest impact: ${lowPerformers[0].agentName}.`,
    } : { tone: 'positive', label: 'COACH', text: 'No agents flagged below the 25% connect-rate threshold.' },
    bestRate ? {
      tone: 'positive',
      label: 'STAR',
      text: `${bestRate.agentName} leads on connect rate (${fmtPct(bestRate.connectionRate)} on ${fmtInt(bestRate.totalCalls)} calls). Use as benchmark for training.`,
    } : { tone: 'neutral', label: 'STAR', text: 'Insufficient volume to flag a top performer.' },
  ];
}

function repeatInsights(dist: DistBucket[]): Insight[] {
  if (!dist.length) return [];
  const total = dist.reduce((a, b) => a + b.customers, 0);
  if (!total) return [];
  const oneCall = dist.find((d) => d.bucket === '1 call')?.customers || 0;
  const five_plus = dist.filter((d) => ['5-9 calls', '10-19 calls', '20+ calls'].includes(d.bucket)).reduce((a, b) => a + b.customers, 0);
  return [
    { tone: 'neutral', label: 'EFFORT', text: `${fmtPct(oneCall / total)} of customers were reached in 1 call. Most engagement happens on first contact.` },
    {
      tone: five_plus / total > 0.1 ? 'warning' : 'positive',
      label: 'CHASE',
      text: `${fmtPct(five_plus / total)} of customers required 5+ attempts — wasted effort if not converting. Build alternate channels (WhatsApp/SMS) for repeaters.`,
    },
  ];
}

function reachInsights(r: Reach): Insight[] {
  if (!r.total) return [];
  const out: Insight[] = [];
  out.push({
    tone: r.unreachable / r.total > 0.5 ? 'danger' : 'opportunity',
    label: 'REACH',
    text: `${fmtPct(r.reachable / r.total)} of customers contacted reachable. ${fmtInt(r.unreachable)} could not be reached at all.`,
  });
  out.push({
    tone: 'warning',
    label: 'PERSISTENT',
    text: `${fmtInt(r.frequentlyMissed)} customers were dialed 3+ times without connecting. Move them to a non-voice channel.`,
  });
  return out;
}

function durationDistInsights(dist: DurBucket[]): Insight[] {
  if (!dist.length) return [];
  const total = dist.reduce((a, b) => a + b.calls, 0);
  if (!total) return [];
  const short = (dist.find((d) => d.bucket === '1-14 sec')?.calls || 0) + (dist.find((d) => d.bucket === '15-29 sec')?.calls || 0);
  const meaningful = ['30-59 sec', '1-2 min', '2-5 min', '5+ min'].reduce((a, b) => a + (dist.find((d) => d.bucket === b)?.calls || 0), 0);
  return [
    {
      tone: short / total > 0.2 ? 'warning' : 'neutral',
      label: 'CUT-OFF',
      text: `${fmtPct(short / total)} of calls ended in <30s. Likely pitch/script issue — review opening lines.`,
    },
    {
      tone: meaningful / total > 0.3 ? 'positive' : 'opportunity',
      label: 'DEEP',
      text: `${fmtPct(meaningful / total)} of calls reached meaningful length (30s+). Goal: push this above 35%.`,
    },
  ];
}

function dispoInsights(dispo: DispoRow[]): Insight[] {
  if (!dispo.length) return [];
  const total = dispo.reduce((a, b) => a + b.calls, 0);
  if (!total) return [];
  const top = dispo[0];
  return [
    { tone: 'neutral', label: 'TOP', text: `Most common outcome: ${top.name} (${fmtPct(top.calls / total)} of ${fmtInt(total)} tagged calls).` },
    { tone: 'opportunity', label: 'FOCUS', text: 'Use disposition codes to segment follow-ups — categorize each outcome into "convert / retry / drop" buckets.' },
  ];
}

function lossInsights(o: OppLoss): Insight[] {
  if (!o.total) return [];
  const lossPct = o.notConnectedRate;
  return [
    {
      tone: lossPct > 0.4 ? 'danger' : 'warning',
      label: 'LOSS',
      text: `${fmtPct(lossPct)} of dial attempts did not result in a connected call (${fmtInt(o.notConnected)} of ${fmtInt(o.total)}).`,
    },
    {
      tone: 'opportunity',
      label: 'RECOVER',
      text: `If 25% of unreached customers were retried successfully → +${fmtCompact(o.notConnected * 0.25)} connections.`,
    },
  ];
}

// ───────────────────────── page ─────────────────────────

export default function CallingTeamDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  // Order tabs default the global date range when opened (the top date presets
  // still re-scope it afterwards): Agent Wise Order → today, Daily Orders → 30d.
  useEffect(() => {
    if (tab === 'orders') {
      setFilters((prev) => ({ ...prev, ...presetRange({ label: 'Today', days: 0 }) }));
    } else if (tab === 'orders-daily') {
      setFilters((prev) => ({ ...prev, ...presetRange({ label: '30d', days: 29 }) }));
    }
  }, [tab]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [heatCells, setHeatCells] = useState<HeatCell[]>([]);
  const [hourTotals, setHourTotals] = useState<HourTotal[]>([]);
  const [weekdayPerf, setWeekdayPerf] = useState<WeekdayPerf[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [dist, setDist] = useState<DistBucket[]>([]);
  const [reach, setReach] = useState<Reach | null>(null);
  const [durBuckets, setDurBuckets] = useState<DurBucket[]>([]);
  const [dispositions, setDispositions] = useState<DispoRow[]>([]);
  const [oppLoss, setOppLoss] = useState<OppLoss | null>(null);

  const [filterOpts, setFilterOpts] = useState<FilterOpts>({ agents: [], campaigns: [], statuses: [] });


  const [dailyResp, setDailyResp] = useState<DailyResp | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyFocusDay, setDailyFocusDay] = useState<string | null>(null);

  const [momRows, setMomRows] = useState<MomRow[]>([]);
  const [momLoading, setMomLoading] = useState(false);

  const [buyerAttemptGrain, setBuyerAttemptGrain] = useState<BuyerAttemptGrain>('day');
  const [buyerAttemptRows, setBuyerAttemptRows] = useState<BuyerAttemptRow[]>([]);
  const [buyerAttemptLoading, setBuyerAttemptLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auth
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
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const qs = useMemo(() => buildQs(filters), [filters]);

  // Load filter options once date range changes.
  useEffect(() => {
    if (!authChecked) return;
    const p = new URLSearchParams();
    p.set('startDate', filters.startDate);
    p.set('endDate', filters.endDate);
    fetch(`/api/calling-team/filters?${p.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.agents) setFilterOpts(data);
      })
      .catch(() => {});
  }, [authChecked, filters.startDate, filters.endDate]);

  // Load analytics dataset (Tab 1).
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [ov, tr, hm, fn, ag, cu, oc] = await Promise.all([
        fetch(`/api/calling-team/overview?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/trends?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/heatmap?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/funnel?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/agents?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/customers?${qs}`).then((r) => r.json()),
        fetch(`/api/calling-team/outcomes?${qs}`).then((r) => r.json()),
      ]);
      if (ov.error || tr.error || hm.error || fn.error || ag.error || cu.error || oc.error) {
        throw new Error(ov.error || tr.error || hm.error || fn.error || ag.error || cu.error || oc.error);
      }
      setOverview(ov);
      setTrend(tr.series || []);
      setHeatCells(hm.cells || []);
      setHourTotals(hm.hourTotals || []);
      setWeekdayPerf(hm.weekday || []);
      setFunnelStages(fn.stages || []);
      setAgents(ag.agents || []);
      setDist(cu.distribution || []);
      setReach(cu.reachability || null);
      setDurBuckets(oc.durationBuckets || []);
      setDispositions(oc.dispositions || []);
      setOppLoss(oc.opportunityLoss || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'analytics' && tab !== 'dashboard' && tab !== 'table') return;
    loadAnalytics();
  }, [authChecked, tab, loadAnalytics]);

  // Daily Trend tab — loads per-day rich metrics and (optionally) hour breakdown for a focused day.
  const loadDaily = useCallback(async () => {
    setDailyLoading(true);
    try {
      const p = new URLSearchParams(qs);
      if (dailyFocusDay) p.set('day', dailyFocusDay);
      const r = await fetch(`/api/calling-team/daily-detailed?${p.toString()}`).then((r) => r.json());
      if (r?.series) setDailyResp(r);
    } finally {
      setDailyLoading(false);
    }
  }, [qs, dailyFocusDay]);

  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'daily') return;
    loadDaily();
  }, [authChecked, tab, loadDaily]);

  // MoM (Month-over-Month) — loaded on the Dashboard tab.
  const loadMom = useCallback(async () => {
    setMomLoading(true);
    try {
      const r = await fetch(`/api/calling-team/mom?${qs}`).then((r) => r.json());
      if (r?.months) setMomRows(r.months);
    } finally {
      setMomLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'dashboard') return;
    loadMom();
  }, [authChecked, tab, loadMom]);

  // Buyer-attempt section — driven by the global date range + granularity toggle.
  const loadBuyerAttempts = useCallback(async () => {
    setBuyerAttemptLoading(true);
    try {
      const p = new URLSearchParams();
      p.set('granularity', buyerAttemptGrain);
      p.set('startDate', filters.startDate);
      p.set('endDate', filters.endDate);
      const r = await fetch(`/api/calling-team/buyer-attempts?${p.toString()}`).then((r) => r.json());
      if (r?.rows) setBuyerAttemptRows(r.rows);
    } finally {
      setBuyerAttemptLoading(false);
    }
  }, [buyerAttemptGrain, filters.startDate, filters.endDate]);

  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'dashboard') return;
    loadBuyerAttempts();
  }, [authChecked, tab, loadBuyerAttempts]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  // KPI grid view-model (only computed when overview is loaded).
  const kpis = overview;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000 pointer-events-none" />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
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
            <button onClick={handleLogout} disabled={isLoggingOut} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50">
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Calling Team Dashboard
          </h1>
          <p className="text-purple-200/80 text-sm mt-1">
            Productivity, connect rate, customer engagement, and operational bottlenecks across the calling team.
          </p>
        </div>

        {/* Tabs + Filters bar */}
        <div className="mb-5 flex items-center justify-between gap-3 flex-nowrap overflow-x-auto">
          <div className="inline-flex p-0.5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-xl">
            <button
              onClick={() => setTab('dashboard')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'dashboard' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'analytics' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📊 Trends & Insights
            </button>
            <button
              onClick={() => setTab('daily')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'daily' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📅 Daily Trend
            </button>
            <button
              onClick={() => setTab('table')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'table' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📑 Agent Wise
            </button>
            <button
              onClick={() => setTab('orders')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'orders' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              🧾 Agent Wise Order
            </button>
            <button
              onClick={() => setTab('orders-daily')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${tab === 'orders-daily' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📆 Daily Orders
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            {DATE_PRESETS.map((p) => {
              const r = presetRange(p);
              const active = filters.startDate === r.startDate && filters.endDate === r.endDate;
              return (
                <button
                  key={p.label}
                  onClick={() => setFilters({ ...filters, ...r })}
                  aria-pressed={active}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 border-transparent text-white shadow-lg'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-purple-200'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 shrink-0">
              <input
                type="date"
                value={filters.startDate}
                max={filters.endDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="bg-transparent text-[11px] text-purple-100 focus:outline-none"
              />
              <span className="text-purple-300/60 text-[11px]">→</span>
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="bg-transparent text-[11px] text-purple-100 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-4 px-4 py-2 bg-rose-500/15 border border-rose-400/30 rounded-lg text-rose-200 text-sm">
            {err}
          </div>
        )}

        {/* Global filter row — applies across all tabs except the order tabs,
            which are self-scoped (outbound · Warm/Cold campaigns) and ignore them. */}
        {tab !== 'orders' && tab !== 'orders-daily' && (
        <div className="relative z-20 mb-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold">Global Filters</div>
            {(filters.campaign.length + filters.direction.length + filters.status.length) > 0 && (
              <>
                <span className="text-xs text-purple-300/60">
                  · {filters.campaign.length + filters.direction.length + filters.status.length} active
                </span>
                <button
                  onClick={() => setFilters({ ...filters, campaign: [], direction: [], status: [] })}
                  className="ml-auto text-[11px] text-rose-300 hover:text-rose-200"
                >
                  Clear global filters
                </button>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MultiSelect
              label="Direction"
              value={filters.direction}
              options={[
                { value: 'outbound', label: 'Outbound (incl. Manual)' },
                { value: 'inbound',  label: 'Inbound' },
              ]}
              onChange={(v) => setFilters({ ...filters, direction: v })}
            />
            <MultiSelect
              label="Campaign"
              value={filters.campaign}
              options={filterOpts.campaigns.map((c) => ({ value: c.value, count: c.calls }))}
              onChange={(v) => setFilters({ ...filters, campaign: v })}
            />
            <MultiSelect
              label="Call Status"
              value={filters.status}
              options={[
                { value: 'connected', label: 'Connected (bucket)' },
                { value: 'no_answer', label: 'No Answer (bucket)' },
                { value: 'missed',    label: 'Missed (bucket)' },
                ...filterOpts.statuses.map((s) => ({ value: s.value, label: s.value, count: s.calls })),
              ]}
              onChange={(v) => setFilters({ ...filters, status: v })}
            />
          </div>
        </div>
        )}

        {tab === 'dashboard' && (
          <DashboardTab
            loading={loading}
            overview={overview}
            momRows={momRows}
            momLoading={momLoading}
            buyerAttemptRows={buyerAttemptRows}
            buyerAttemptLoading={buyerAttemptLoading}
            buyerAttemptGrain={buyerAttemptGrain}
            setBuyerAttemptGrain={setBuyerAttemptGrain}
          />
        )}

        {tab === 'analytics' && (
          <AnalyticsTab
            loading={loading}
            overview={overview}
            trend={trend}
            heatCells={heatCells}
            hourTotals={hourTotals}
            weekdayPerf={weekdayPerf}
            funnelStages={funnelStages}
            agents={agents}
            dist={dist}
            reach={reach}
            durBuckets={durBuckets}
            dispositions={dispositions}
            oppLoss={oppLoss}
            kpis={kpis}
          />
        )}

        {tab === 'daily' && (
          <DailyTrendTab
            data={dailyResp}
            loading={dailyLoading}
            focusDay={dailyFocusDay}
            setFocusDay={setDailyFocusDay}
          />
        )}

        {tab === 'table' && (
          <TableTab filters={filters} />
        )}

        {tab === 'orders' && (
          <AgentOrdersTab filters={filters} />
        )}

        {tab === 'orders-daily' && (
          <AgentOrdersDailyTab filters={filters} />
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}

// ───────────────────────── Tab: Table (full agent table) ─────────────────────────

function TableTab({ filters }: { filters: Filters }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ col: keyof AgentRow; dir: 'asc' | 'desc' }>({ col: 'totalCalls', dir: 'desc' });

  // Period toggle re-scopes the table to a calendar-to-date window, overriding
  // the global date range for this table only. Other (non-date) global filters
  // — direction, campaign, call status, etc. — still apply.
  const [period, setPeriod] = useState<AgentPeriod>('month');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const range = agentPeriodRange(period);
  const qs = useMemo(
    () => buildQs({ ...filters, ...agentPeriodRange(period) }),
    [period, filters],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/calling-team/agents?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAgents(d.agents || []); })
      .catch(() => { if (!cancelled) setAgents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [qs]);

  const COLS: [keyof AgentRow, string][] = [
    ['totalCalls', 'Calls'],
    ['connectedCalls', 'Connected'],
    ['connectionRate', 'Connect %'],
    ['meaningfulCalls', 'Meaningful'],
    ['meaningfulRate', 'Meaningful %'],
    ['missedCalls', 'Missed'],
    ['avgDuration', 'Avg Dur'],
    ['totalTalkTime', 'Talk Time'],
    ['uniqueCustomers', 'Unique Cust'],
    ['usersCalled', 'Users Called'],
    ['sameDayUsers', 'Ordered (SD)'],
    ['sameDayRate', 'SD Conv %'],
    ['timeslotUsers', 'Ordered 10–7'],
    ['timeslotRate', '10–7 Conv %'],
    ['orderCount', 'Orders'],
    ['gmv', 'GMV'],
  ];

  const rows = agents
    .filter((a) => a.agentName.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.col], bv = b[sort.col];
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : Number(av) - Number(bv);
      return sort.dir === 'desc' ? -cmp : cmp;
    });

  const toggleSort = (col: keyof AgentRow) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    const header = ['Agent', ...COLS.map(([, label]) => label)];
    const lines = rows.map((a) => [
      `"${a.agentName.replace(/"/g, '""')}"`,
      a.totalCalls, a.connectedCalls, (a.connectionRate * 100).toFixed(1) + '%',
      a.meaningfulCalls, (a.meaningfulRate * 100).toFixed(1) + '%', a.missedCalls,
      a.avgDuration, a.totalTalkTime, a.uniqueCustomers,
      a.usersCalled, a.sameDayUsers, (a.sameDayRate * 100).toFixed(1) + '%',
      a.timeslotUsers, (a.timeslotRate * 100).toFixed(1) + '%', a.orderCount, Math.round(a.gmv),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calling-team-agents.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-purple-100">Agent Table</h2>
          <p className="text-purple-300/70 text-xs mt-0.5">
            {loading
              ? 'Loading…'
              : `${AGENT_PERIOD_LABEL[period]} (${range.startDate} → ${range.endDate}) · ${rows.length} of ${agents.length} agents — click a column to sort`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
            {(['day', 'week', 'month'] as AgentPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  period === p
                    ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow'
                    : 'text-purple-200 hover:bg-white/5'
                }`}
              >
                {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agent…"
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-purple-100 placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400/40"
          />
          <button
            onClick={exportCsv}
            disabled={!rows.length}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-400/30 text-fuchsia-200 disabled:opacity-40"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
            <tr>
              <th className="text-left py-2 pr-2">#</th>
              <th className="text-left py-2 pr-2">Agent</th>
              {COLS.map(([col, label]) => (
                <th
                  key={col}
                  className="text-right py-2 px-2 cursor-pointer hover:text-purple-100 select-none"
                  onClick={() => toggleSort(col)}
                >
                  {label} {sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.agentName} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 pr-2 text-purple-300/60">{i + 1}</td>
                <td className="py-2 pr-2 text-purple-100 font-medium">{a.agentName}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.totalCalls)}</td>
                <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(a.connectedCalls)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <span className={a.connectionRate >= 0.6 ? 'text-emerald-300' : a.connectionRate >= 0.4 ? 'text-amber-300' : 'text-rose-300'}>
                    {fmtPct(a.connectionRate, 1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.meaningfulCalls)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtPct(a.meaningfulRate, 1)}</td>
                <td className="py-2 px-2 text-right text-rose-200/80 tabular-nums">{fmtInt(a.missedCalls)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtDuration(a.avgDuration)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtTalkTime(a.totalTalkTime)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.uniqueCustomers)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.usersCalled)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.sameDayUsers)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <span className={a.sameDayRate >= 0.1 ? 'text-emerald-300' : a.sameDayRate >= 0.05 ? 'text-amber-300' : 'text-rose-300'}>
                    {fmtPct(a.sameDayRate, 1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.timeslotUsers)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <span className={a.timeslotRate >= 0.1 ? 'text-emerald-300' : a.timeslotRate >= 0.05 ? 'text-amber-300' : 'text-rose-300'}>
                    {fmtPct(a.timeslotRate, 1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.orderCount)}</td>
                <td className="py-2 px-2 text-right text-fuchsia-200 tabular-nums">₹{fmtCompact(a.gmv)}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={COLS.length + 2} className="py-8 text-center text-purple-300/50">
                  {agents.length ? 'No agents match your search.' : 'No agent data for this range.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Tab: Agent Wise Order ─────────────────────────

function AgentOrdersTab({ filters }: { filters: Filters }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ col: keyof AgentOrderRow; dir: 'asc' | 'desc' }>({ col: 'totalCalls', dir: 'desc' });
  const [agents, setAgents] = useState<AgentOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Driven by the global date-range picker; campaign/direction/status are fixed
  // server-side (outbound · Warm/Cold) so the rest of the global filter bar is
  // intentionally ignored here.
  const qs = useMemo(
    () => buildQs({ ...defaultFilters(), startDate: filters.startDate, endDate: filters.endDate }),
    [filters.startDate, filters.endDate],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/calling-team/agent-orders?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAgents(d.agents || []); })
      .catch(() => { if (!cancelled) setAgents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [qs]);

  const COLS: [keyof AgentOrderRow, string][] = [
    ['totalCalls', 'Total Calls Initiated'],
    ['uniqueBuyerAttempt', 'Unique Buyer Attempt'],
    ['connected', 'Connected'],
    ['connectedRate', 'Connected %'],
    ['connectedUniqueBuyer', 'Connected Unique Buyer'],
    ['orderPlacedBuyer', 'Order Placed Buyer'],
    ['orderCount', 'Order Count'],
    ['orderConvRate', 'Order Placed / Conn. Uniq.'],
    ['avgHaltingMins', 'Avg Halting Call (Mins)'],
    ['connectedGte15', '≥15s Connected'],
    ['connectedLt15', '<15s Connected'],
    ['totalTalkHours', 'Total Talk Time (Hrs)'],
  ];

  const rows = agents
    .filter((a) => a.agentName.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.col], bv = b[sort.col];
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : Number(av) - Number(bv);
      return sort.dir === 'desc' ? -cmp : cmp;
    });

  // Totals across the visible (search-filtered) rows. Counts sum; rates and the
  // avg are recomputed from the aggregates rather than summed.
  const t = rows.reduce(
    (acc, a) => {
      acc.totalCalls += a.totalCalls;
      acc.uniqueBuyerAttempt += a.uniqueBuyerAttempt;
      acc.connected += a.connected;
      acc.connectedUniqueBuyer += a.connectedUniqueBuyer;
      acc.orderPlacedBuyer += a.orderPlacedBuyer;
      acc.orderCount += a.orderCount;
      acc.connectedGte15 += a.connectedGte15;
      acc.connectedLt15 += a.connectedLt15;
      acc.totalTalkHours += a.totalTalkHours;
      acc.haltWeighted += a.avgHaltingMins * a.connected;
      return acc;
    },
    { totalCalls: 0, uniqueBuyerAttempt: 0, connected: 0, connectedUniqueBuyer: 0, orderPlacedBuyer: 0, orderCount: 0, connectedGte15: 0, connectedLt15: 0, totalTalkHours: 0, haltWeighted: 0 },
  );
  const totalConnectedRate = t.totalCalls ? t.connected / t.totalCalls : 0;
  const totalOrderConvRate = t.connectedUniqueBuyer ? t.orderPlacedBuyer / t.connectedUniqueBuyer : 0;
  const totalAvgHaltingMins = t.connected ? t.haltWeighted / t.connected : 0;

  const toggleSort = (col: keyof AgentOrderRow) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    const header = ['Agent', ...COLS.map(([, label]) => label)];
    const lines = rows.map((a) => [
      `"${a.agentName.replace(/"/g, '""')}"`,
      a.totalCalls, a.uniqueBuyerAttempt, a.connected, (a.connectedRate * 100).toFixed(1) + '%',
      a.connectedUniqueBuyer, a.orderPlacedBuyer, a.orderCount, (a.orderConvRate * 100).toFixed(1) + '%',
      a.avgHaltingMins.toFixed(2), a.connectedGte15, a.connectedLt15, a.totalTalkHours.toFixed(2),
    ].join(','));
    const totalLine = [
      'Total',
      t.totalCalls, t.uniqueBuyerAttempt, t.connected, (totalConnectedRate * 100).toFixed(1) + '%',
      t.connectedUniqueBuyer, t.orderPlacedBuyer, t.orderCount, (totalOrderConvRate * 100).toFixed(1) + '%',
      totalAvgHaltingMins.toFixed(2), t.connectedGte15, t.connectedLt15, t.totalTalkHours.toFixed(2),
    ].join(',');
    const csv = [header.join(','), ...lines, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calling-team-agent-orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-purple-100">Agent Wise Order</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agent…"
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-purple-100 placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400/40"
          />
          <button
            onClick={exportCsv}
            disabled={!rows.length}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-400/30 text-fuchsia-200 disabled:opacity-40"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
            <tr>
              <th className="text-left py-2 pr-2">#</th>
              <th className="text-left py-2 pr-2">Agent</th>
              {COLS.map(([col, label]) => (
                <th
                  key={col}
                  className="text-right py-2 px-2 cursor-pointer hover:text-purple-100 select-none"
                  onClick={() => toggleSort(col)}
                >
                  {label} {sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.agentName} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 pr-2 text-purple-300/60">{i + 1}</td>
                <td className="py-2 pr-2 text-purple-100 font-medium">{a.agentName}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.totalCalls)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.uniqueBuyerAttempt)}</td>
                <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(a.connected)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <span className={a.connectedRate >= 0.6 ? 'text-emerald-300' : a.connectedRate >= 0.4 ? 'text-amber-300' : 'text-rose-300'}>
                    {fmtPct(a.connectedRate, 1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.connectedUniqueBuyer)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.orderPlacedBuyer)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.orderCount)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  <span className={a.orderConvRate >= 0.1 ? 'text-emerald-300' : a.orderConvRate >= 0.05 ? 'text-amber-300' : 'text-rose-300'}>
                    {fmtPct(a.orderConvRate, 1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{a.avgHaltingMins.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.connectedGte15)}</td>
                <td className="py-2 px-2 text-right text-rose-200/80 tabular-nums">{fmtInt(a.connectedLt15)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{a.totalTalkHours.toFixed(2)}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={COLS.length + 2} className="py-8 text-center text-purple-300/50">
                  {agents.length ? 'No agents match your search.' : 'No agent data for this range.'}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-fuchsia-400/30 bg-fuchsia-500/10 text-purple-100 font-semibold">
              <tr>
                <td className="py-2 pr-2"></td>
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.totalCalls)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.uniqueBuyerAttempt)}</td>
                <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(t.connected)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtPct(totalConnectedRate, 1)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.connectedUniqueBuyer)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.orderPlacedBuyer)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.orderCount)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtPct(totalOrderConvRate, 1)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{totalAvgHaltingMins.toFixed(2)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.connectedGte15)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtInt(t.connectedLt15)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{t.totalTalkHours.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Tab: Daily Orders (agent × day matrix) ─────────────────────────

function AgentOrdersDailyTab({ filters }: { filters: Filters }) {
  const [query, setQuery] = useState('');
  const [cells, setCells] = useState<{ agentName: string; day: string; orderCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down: clicking a cell opens the underlying orders + attributing call.
  const [drill, setDrill] = useState<{ agentName: string; day: string; count: number } | null>(null);
  const [drillRows, setDrillRows] = useState<DrillOrderRow[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillSearch, setDrillSearch] = useState('');

  useEffect(() => {
    if (!drill) return;
    let cancelled = false;
    setDrillLoading(true);
    setDrillError(null);
    setDrillRows(null);
    setDrillSearch('');
    const p = new URLSearchParams({
      agentName: drill.agentName,
      day: drill.day,
      startDate: drill.day,
      endDate: drill.day,
    });
    fetch(`/api/calling-team/agent-orders-daily-drill?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) { setDrillError(d.error); setDrillRows([]); }
        else setDrillRows(d.data || []);
      })
      .catch((e) => { if (!cancelled) { setDrillError(String(e)); setDrillRows([]); } })
      .finally(() => { if (!cancelled) setDrillLoading(false); });
    return () => { cancelled = true; };
  }, [drill]);

  // Esc closes the drill.
  useEffect(() => {
    if (!drill) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrill(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drill]);

  const qs = useMemo(
    () => buildQs({ ...defaultFilters(), startDate: filters.startDate, endDate: filters.endDate }),
    [filters.startDate, filters.endDate],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/calling-team/agent-orders-daily?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCells(d.cells || []); })
      .catch(() => { if (!cancelled) setCells([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [qs]);

  const days = useMemo(() => daysInRange(filters.startDate, filters.endDate), [filters.startDate, filters.endDate]);
  const dayLabel = (d: string) => { const [, m, day] = d.split('-'); return `${+day}/${+m}`; };

  // Rich per-day metadata for the header (weekday, month, weekend flag).
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayMeta = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    return { dayNum: d, monthLabel: MONTHS[m - 1], weekday: WEEKDAYS[wd], isWeekend: wd === 0 || wd === 6 };
  };

  // Month-group spans for the top header row, and indices where a new month starts.
  const monthGroups = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = MONTHS[+d.slice(5, 7) - 1];
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.count++;
      else groups.push({ label, count: 1 });
    }
    return groups;
  }, [days]);
  const newMonthIdx = useMemo(() => {
    const set = new Set<number>();
    days.forEach((d, i) => { if (i > 0 && d.slice(5, 7) !== days[i - 1].slice(5, 7)) set.add(i); });
    return set;
  }, [days]);

  // Pivot: agent -> day -> count, plus per-agent and per-day totals.
  const { agents, dayTotals, grandTotal } = useMemo(() => {
    const byAgent = new Map<string, { total: number; days: Record<string, number> }>();
    const dayTotals: Record<string, number> = {};
    let grandTotal = 0;
    for (const c of cells) {
      if (!byAgent.has(c.agentName)) byAgent.set(c.agentName, { total: 0, days: {} });
      const a = byAgent.get(c.agentName)!;
      a.days[c.day] = (a.days[c.day] || 0) + c.orderCount;
      a.total += c.orderCount;
      dayTotals[c.day] = (dayTotals[c.day] || 0) + c.orderCount;
      grandTotal += c.orderCount;
    }
    const agents = [...byAgent.entries()]
      .map(([agentName, v]) => ({ agentName, ...v }))
      .sort((x, y) => y.total - x.total);
    return { agents, byAgent, dayTotals, grandTotal };
  }, [cells]);

  const rows = agents.filter((a) => a.agentName.toLowerCase().includes(query.trim().toLowerCase()));

  // Heatmap scales: brightest cell = the single busiest agent-day in the window.
  const maxCell = useMemo(() => cells.reduce((mx, c) => Math.max(mx, c.orderCount), 0), [cells]);
  const maxDayTotal = useMemo(() => Object.values(dayTotals).reduce((mx, v) => Math.max(mx, v), 0), [dayTotals]);
  const maxAgentTotal = agents.length ? agents[0].total : 0;

  // Per-cell heat style — fuchsia fill scaled to value, with the global peak ringed.
  const heat = (v: number, isWeekend: boolean) => {
    if (!v) return { bg: isWeekend ? 'rgba(255,255,255,0.02)' : 'transparent', cls: 'text-purple-300/20', peak: false };
    const t = maxCell ? v / maxCell : 0;
    return {
      bg: `rgba(232,121,249,${(0.05 + t * 0.5).toFixed(3)})`,
      cls: t > 0.66 ? 'text-white font-bold' : t > 0.33 ? 'text-purple-50 font-semibold' : 'text-purple-200',
      peak: v === maxCell && maxCell > 0,
    };
  };

  const exportCsv = () => {
    const header = ['Agent', ...days.map(dayLabel), 'Total'];
    const lines = rows.map((a) => [
      `"${a.agentName.replace(/"/g, '""')}"`,
      ...days.map((d) => a.days[d] || 0),
      a.total,
    ].join(','));
    const totalLine = ['Total', ...days.map((d) => dayTotals[d] || 0), grandTotal].join(',');
    const csv = [header.join(','), ...lines, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calling-team-daily-orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Drill rows filtered by the in-modal search box.
  const filteredDrillRows = useMemo(() => {
    if (!drillRows) return [];
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drillRows;
    return drillRows.filter((r) =>
      [r.poNumber, r.buyerBusinessName, r.buyerPhone, r.sellerBusinessName, r.sellerPhone, r.orderStatus, r.awbNumber, r.courierName]
        .some((v) => v != null && String(v).toLowerCase().includes(q)));
  }, [drillRows, drillSearch]);

  const exportDrillCsv = () => {
    if (!drill || !filteredDrillRows.length) return;
    const headers = [
      'Marked Pending', 'Pushed', 'PO Number', 'Call Duration (s)', 'Recording URL', 'Order Status',
      'PO Amount', 'Coupon Amount', 'Applied Wallet Amount', 'Seller Discount', 'Payment Option Badho Discount',
      'COD Amount', 'Delivery Status', 'Paid Amount', 'Payment Option', 'AWB Number', 'Courier Name',
      'Payment Date', 'Payment Event', 'Buyer Business', 'Buyer Phone', 'Buyer Address', 'Seller Business',
      'Seller Phone', 'Status Marked Time', 'Status Duration (s)', 'Refund Initiated', 'Refund Completed',
      'Refund Amount', 'Reject Reason', 'Rejected By', 'Reason Added By Badho Team',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filteredDrillRows.map((r) => [
      r.MarkedpendingTime ?? '', r.pushedStatus ?? '', r.poNumber, r.callDurationSec ?? '', r.callRecordingUrl ?? '',
      r.orderStatus ?? '', r.poAmount ?? '', r.CoupanAmount ?? '', r.appliedWalletAmount ?? '', r.discountBySeller ?? '',
      r.PaymentOptionDiscountByBadho ?? '', r.codAmountToBeCollected ?? '', r.deliveryStatus ?? '', r.paidAmount ?? '',
      r.PaymentOption ?? '', r.awbNumber ?? '', r.courierName ?? '', r.paymentDate ?? '', r.paymentEvent ?? '',
      r.buyerBusinessName ?? '', r.buyerPhone ?? '',
      [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join(', '),
      r.sellerBusinessName ?? '', r.sellerPhone ?? '', r.statusMarkedTime ?? '', r.statusDurationSec ?? '',
      r.RefundIntiatedTime ?? '', r.RefundCompletedTime ?? '', r.RefundAmount ?? '', r.rejectReason ?? '',
      r.rejectedBy ?? '', r.reasonAddedByBadhoTeam ?? '',
    ].map(esc).join(','));
    const csv = [headers.map(esc).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-orders-${drill.agentName.replace(/\s+/g, '-')}-${drill.day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const dash = <span className="text-slate-400">—</span>;

  return (
    <>
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-purple-100">Daily Orders — Agent × Day</h2>
          <p className="text-purple-300/70 text-xs mt-0.5">
            Order count per agent per day · outbound · Warm/Cold campaigns · {filters.startDate} → {filters.endDate}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agent…"
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-purple-100 placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400/40"
          />
          <button
            onClick={exportCsv}
            disabled={!rows.length}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-400/30 text-fuchsia-200 disabled:opacity-40"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0">
          <thead className="text-purple-300/70 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="sticky left-0 bg-[#1a0f2e] z-10" />
              {monthGroups.map((g, i) => (
                <th
                  key={`${g.label}-${i}`}
                  colSpan={g.count}
                  className={`text-left py-1 px-2 text-fuchsia-300/60 font-semibold ${i > 0 ? 'border-l border-l-white/10' : ''}`}
                >
                  {g.label}
                </th>
              ))}
              <th />
            </tr>
            <tr>
              <th className="text-left py-2 pr-3 sticky left-0 bg-[#1a0f2e] z-10 border-b border-white/10">Agent</th>
              {days.map((d, i) => {
                const m = dayMeta(d);
                return (
                  <th
                    key={d}
                    className={`py-2 px-2 border-b border-white/10 whitespace-nowrap ${newMonthIdx.has(i) ? 'border-l border-l-white/10' : ''} ${m.isWeekend ? 'bg-white/[0.02]' : ''}`}
                  >
                    <div className="flex flex-col items-end gap-0.5 leading-none">
                      <span className={`text-[9px] font-normal ${m.isWeekend ? 'text-fuchsia-300/45' : 'text-purple-300/40'}`}>{m.weekday}</span>
                      <span className="text-[12px] font-bold text-purple-100 tabular-nums normal-case tracking-normal">{m.dayNum}</span>
                    </div>
                  </th>
                );
              })}
              <th className="text-right py-2 pl-3 pr-1 border-b border-white/10 text-fuchsia-200">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              // Each agent's personal best single day — highlighted light green.
              const agentMax = Math.max(0, ...Object.values(a.days));
              return (
              <tr key={a.agentName} className="group hover:bg-white/[0.03]">
                <td className="py-1.5 pr-3 text-purple-100 font-medium sticky left-0 bg-[#1a0f2e] z-10 border-b border-white/5 whitespace-nowrap group-hover:text-white">{a.agentName}</td>
                {days.map((d, i) => {
                  const v = a.days[d] || 0;
                  const m = dayMeta(d);
                  const h = heat(v, m.isWeekend);
                  const isAgentPeak = v > 0 && v === agentMax;
                  return (
                    <td
                      key={d}
                      onClick={v ? () => setDrill({ agentName: a.agentName, day: d, count: v }) : undefined}
                      title={v ? `${v} order${v > 1 ? 's' : ''} · ${a.agentName} · ${dayLabel(d)} — click for details` : undefined}
                      style={{ backgroundColor: isAgentPeak ? 'rgba(134,239,172,0.22)' : h.bg }}
                      className={`py-1.5 px-2 text-right tabular-nums border-b border-white/5 ${isAgentPeak ? 'text-emerald-100 font-bold' : h.cls} ${newMonthIdx.has(i) ? 'border-l border-l-white/10' : ''} ${h.peak ? 'ring-1 ring-inset ring-emerald-200/80' : ''} ${v ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-fuchsia-300/70' : ''}`}
                    >
                      {v || '·'}
                    </td>
                  );
                })}
                <td className="relative py-1.5 pl-3 pr-2 text-right border-b border-white/5">
                  <span className="relative z-10 tabular-nums font-bold text-fuchsia-100">{fmtInt(a.total)}</span>
                  <div
                    className="absolute left-1 bottom-1 h-[3px] rounded-full bg-gradient-to-r from-fuchsia-500/40 to-fuchsia-300/80"
                    style={{ width: `calc(${maxAgentTotal ? Math.round((a.total / maxAgentTotal) * 100) : 0}% - 0.5rem)` }}
                  />
                </td>
              </tr>
              );
            })}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={days.length + 2} className="py-8 text-center text-purple-300/50">
                  {cells.length ? 'No agents match your search.' : 'No order data for this range.'}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-fuchsia-500/10 text-purple-100 font-semibold">
              <tr>
                <td className="py-2 pr-3 sticky left-0 bg-[#241338] z-10 border-t-2 border-fuchsia-400/30">Total</td>
                {days.map((d, i) => {
                  const v = dayTotals[d] || 0;
                  const isPeak = v === maxDayTotal && maxDayTotal > 0;
                  return (
                    <td
                      key={d}
                      className={`py-2 px-2 text-right tabular-nums border-t-2 border-fuchsia-400/30 ${newMonthIdx.has(i) ? 'border-l border-l-white/10' : ''} ${isPeak ? 'text-fuchsia-200 font-extrabold' : v ? 'text-purple-100' : 'text-purple-300/25'}`}
                    >
                      {v || '·'}
                    </td>
                  );
                })}
                <td className="py-2 pl-3 pr-1 text-right tabular-nums text-fuchsia-200 font-extrabold border-t-2 border-fuchsia-400/30">{fmtInt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>

    {drill && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md"
        onClick={() => setDrill(null)}
      >
        <div
          className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.7)] animate-pulse" />
                <span>{drill.agentName} · {fmtDay(drill.day)}</span>
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                Orders attributed to this agent on this day (last-touch) · call details + order details
                {' · '}
                {drillLoading
                  ? 'Loading…'
                  : drillRows
                  ? <span className="text-slate-900 font-semibold">{filteredDrillRows.length} of {drillRows.length} orders</span>
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-56 max-w-full">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="text"
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  placeholder="Search PO, buyer, seller…"
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                />
                {drillSearch && (
                  <button
                    type="button"
                    onClick={() => setDrillSearch('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!filteredDrillRows.length}
                onClick={exportDrillCsv}
              >
                ↓ CSV
              </button>
              <button
                onClick={() => setDrill(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="relative flex-1 overflow-auto">
            {drillLoading ? (
              <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
            ) : drillError ? (
              <div className="px-6 py-12 text-center text-rose-600">{drillError}</div>
            ) : !drillRows || drillRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
            ) : filteredDrillRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">No matches for &ldquo;{drillSearch}&rdquo;</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                  <tr className="border-b border-slate-200">
                    {[
                      ['Marked Pending', 'sticky top-0 left-0 z-30 bg-amber-50 text-amber-800 min-w-[150px]'],
                      ['Pushed', ''],
                      ['PO Number', ''],
                      ['Call Duration', 'bg-purple-50 text-purple-700'],
                      ['Recording', 'bg-purple-50 text-purple-700'],
                      ['Order Status', ''],
                      ['PO Amount', 'text-right'],
                      ['Coupon Amount', 'text-right'],
                      ['Applied Wallet Amount', 'text-right'],
                      ['Seller Discount', 'text-right'],
                      ['Payment Option Badho Discount', 'text-right'],
                      ['COD Amount', 'text-right'],
                      ['Delivery Status', ''],
                      ['Paid Amount', 'text-right'],
                      ['Payment Option', ''],
                      ['AWB Number', ''],
                      ['Courier Name', ''],
                      ['Payment Date', ''],
                      ['Payment Event', ''],
                      ['Buyer Business', ''],
                      ['Buyer Phone', ''],
                      ['Buyer Address', ''],
                      ['Seller Business', ''],
                      ['Seller Phone', ''],
                      ['Status Marked Time', 'bg-amber-50/60'],
                      ['Status Duration', 'bg-amber-50/60'],
                      ['Refund Initiated', ''],
                      ['Refund Completed', ''],
                      ['Refund Amount', 'text-right'],
                      ['Reject Reason', 'text-rose-700 bg-rose-50'],
                      ['Rejected By', 'text-rose-700 bg-rose-50'],
                      ['Reason Added By Badho Team', 'text-rose-700 bg-rose-50'],
                    ].map(([label, cls], i) => (
                      <th
                        key={i}
                        className={`sticky top-0 z-20 px-2.5 py-2.5 text-[11px] font-bold whitespace-nowrap uppercase tracking-wider ${(cls as string).includes('bg-') ? '' : 'bg-slate-100'} ${(cls as string).includes('text-') ? '' : 'text-slate-700'} ${(cls as string).includes('text-right') ? 'text-right' : 'text-left'} ${cls}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDrillRows.map((r, idx) => {
                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                    return (
                      <tr key={r.poNumber} className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}>
                        <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[150px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>{r.MarkedpendingTime ? fmtDateTime(r.MarkedpendingTime) : dash}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.pushedStatus === 'Pushed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.pushedStatus === 'Pushed' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {r.pushedStatus || 'Not Pushed'}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                            <a
                              href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all"
                              title="Open in D2R Support Dashboard"
                            >
                              Details ↗
                            </a>
                            <a
                              href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all"
                              title="Search Freshdesk tickets"
                            >
                              Ticket ↗
                            </a>
                          </div>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap bg-purple-50/40">
                          <div className="font-semibold text-purple-800 tabular-nums">{r.callDurationSec != null ? fmtDuration(r.callDurationSec) : dash}</div>
                          {r.callTs && <div className="text-[10px] text-slate-500 mt-0.5">{fmtDateTime(r.callTs)}</div>}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap bg-purple-50/40">
                          {r.callRecordingUrl ? (
                            <a
                              href={r.callRecordingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 text-[11px] font-bold border border-fuchsia-300 transition-all"
                              title="Play call recording"
                            >
                              ▶ Play
                            </a>
                          ) : dash}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus ?? r.status}</td>
                        <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{fmtMoney(r.poAmount) ?? dash}</td>
                        <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount ? fmtMoney(r.CoupanAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? fmtMoney(r.appliedWalletAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? fmtMoney(r.discountBySeller) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? fmtMoney(r.PaymentOptionDiscountByBadho) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null ? fmtMoney(r.codAmountToBeCollected) : dash}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.deliveryStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatus}</span> : dash}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? fmtMoney(r.paidAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap text-slate-700">{r.awbNumber || dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate ? fmtDateTime(r.paymentDate) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || dash}</td>
                        <td className="px-2.5 py-2 font-medium text-slate-800">{r.buyerBusinessName || dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap text-slate-700">{r.buyerPhone || dash}</td>
                        <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md">
                          {(() => {
                            const addr = [r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join(', ');
                            return addr ? <div className="whitespace-normal break-words">{addr}</div> : dash;
                          })()}
                        </td>
                        <td className="px-2.5 py-2 font-medium text-slate-800">{r.sellerBusinessName || dash}</td>
                        <td className="px-2.5 py-2 tabular-nums whitespace-nowrap text-slate-700">{r.sellerPhone || dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap bg-amber-50/40">{r.statusMarkedTime ? fmtDateTime(r.statusMarkedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium">{r.statusDurationSec != null ? fmtDuration(r.statusDurationSec) : dash}</td>
                        <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{r.RefundIntiatedTime ? fmtDateTime(r.RefundIntiatedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{r.RefundCompletedTime ? fmtDateTime(r.RefundCompletedTime) : dash}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? fmtMoney(r.RefundAmount) : dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || dash}</td>
                        <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : dash}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ───────────────────────── Tab 1: Analytics ─────────────────────────

function AnalyticsTab(props: {
  loading: boolean;
  overview: Overview | null;
  kpis: Overview | null;
  trend: TrendPoint[];
  heatCells: HeatCell[];
  hourTotals: HourTotal[];
  weekdayPerf: WeekdayPerf[];
  funnelStages: FunnelStage[];
  agents: AgentRow[];
  dist: DistBucket[];
  reach: Reach | null;
  durBuckets: DurBucket[];
  dispositions: DispoRow[];
  oppLoss: OppLoss | null;
}) {
  const { loading, kpis, trend, heatCells, hourTotals, weekdayPerf, funnelStages, agents, dist, reach, durBuckets, dispositions, oppLoss } = props;
  const [agentSort, setAgentSort] = useState<{ col: keyof AgentRow; dir: 'asc' | 'desc' }>({ col: 'totalCalls', dir: 'desc' });

  if (loading && !kpis) {
    return <div className="text-purple-200 py-16 text-center text-sm">Loading analytics…</div>;
  }
  if (!kpis) {
    return <div className="text-purple-200/70 py-16 text-center text-sm">No data.</div>;
  }

  const sortedAgents = [...agents].sort((a, b) => {
    const av = a[agentSort.col] as number;
    const bv = b[agentSort.col] as number;
    return agentSort.dir === 'asc' ? (av - bv) : (bv - av);
  });

  return (
    <div className="space-y-6">
      {/* Executive KPI section */}
      <section>
        <div className="text-xs uppercase tracking-wider text-purple-300/70 font-semibold mb-3">Executive Snapshot</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KPICard label="Total Calls"           value={fmtCompact(kpis.totalCalls)} sub={`${fmtInt(kpis.totalCalls)} attempts`} tone="fuchsia" icon="📞" />
          <KPICard label="Unique Customers"      value={fmtCompact(kpis.uniqueCustomers)} sub={`${kpis.avgCallsPerCustomer.toFixed(1)} calls / customer`} tone="purple" icon="👥" />
          <KPICard label="Connected"             value={fmtCompact(kpis.connectedCalls)} sub={fmtPct(kpis.connectionRate)} tone="emerald" icon="✓" />
          <KPICard label="Missed"                value={fmtCompact(kpis.missedCalls)} sub={`${fmtPct(kpis.missedCalls / Math.max(kpis.totalCalls, 1))} of total`} tone="amber" icon="↺" />
          <KPICard label="Rejected / No Answer"  value={fmtCompact(kpis.noAnswerCalls + kpis.rejectedCalls)} sub="business lost" tone="rose" icon="×" />
          <KPICard label="Answer Rate"           value={fmtPct(kpis.answerRate)} sub="connected ÷ total" tone="emerald" icon="📈" />
          <KPICard label="Connection Rate"       value={fmtPct(kpis.connectionRate)} sub="incl. talk-time" tone="sky" icon="🔗" />
          <KPICard label="Avg Call Duration"     value={fmtDuration(kpis.avgDurationConnected)} sub="connected calls" tone="indigo" icon="⏱" />
          <KPICard label="Total Talk Time"       value={fmtTalkTime(kpis.totalTalkTimeSec)} sub="across team" tone="purple" icon="🕓" />
          <KPICard label="Calls / Customer"      value={kpis.avgCallsPerCustomer.toFixed(2)} sub="dial-to-reach" tone="amber" icon="📲" />
          <KPICard label="Calls / Agent"         value={fmtCompact(kpis.avgCallsPerAgent)} sub={`across ${kpis.uniqueAgents} agents`} tone="indigo" icon="🧑‍💼" />
          <KPICard label="Repeat Contact Rate"   value={fmtPct(kpis.repeatContactRate)} sub="customers re-dialed" tone="fuchsia" icon="🔁" />
          <KPICard label="First-Touch Success"   value={fmtPct(kpis.firstContactSuccessRate)} sub="reached on 1st try" tone="emerald" icon="🎯" />
          <KPICard label="Meaningful Calls"      value={fmtCompact(kpis.meaningfulCalls)} sub="connected ≥30s" tone="sky" icon="💬" />
          <KPICard label="Short Calls"           value={fmtCompact(kpis.shortCalls)} sub="connected <15s" tone="rose" icon="⚡" />
          <KPICard label="Avg Duration (all)"    value={fmtDuration(kpis.avgDuration)} sub="weighted across attempts" tone="purple" icon="📊" />
        </div>
      </section>

      {/* Trend Analysis */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Daily Call Volume Trend"
          subtitle="Calls per day with 7-day moving average & week-over-week growth"
          question="Are customer interactions increasing or declining?"
          insights={trendInsights(trend)}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend.map((p) => ({ ...p, dayLabel: fmtDay(p.day) }))}>
                <defs>
                  <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d946ef" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                <Area type="monotone" dataKey="total" name="Calls" stroke="#d946ef" fill="url(#totalFill)" />
                <Line type="monotone" dataKey="sma7" name="7-day MA" stroke="#fbbf24" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Connected vs Missed vs Rejected"
          subtitle="Daily stacked breakdown — visualizing lost business opportunity"
          question="How much business opportunity is being lost each day?"
          insights={[
            ...(trend.length ? [{
              tone: 'warning' as const,
              label: 'LOST',
              text: `Across the window, ${fmtCompact(trend.reduce((a, b) => a + b.missed + b.noAnswer + b.rejected, 0))} potential customer touchpoints did not connect.`,
            }] : []),
          ]}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.map((p) => ({ ...p, dayLabel: fmtDay(p.day) }))} stackOffset="none">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                <Area type="monotone" dataKey="connected" name="Connected" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.7} />
                <Area type="monotone" dataKey="noAnswer"  name="No Answer" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.7} />
                <Area type="monotone" dataKey="missed"    name="Missed"    stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.7} />
                <Area type="monotone" dataKey="rejected"  name="Other"     stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.55} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Average Call Duration Trend"
          subtitle="Daily mean duration for connected calls"
          question="Are conversations becoming more meaningful or shorter?"
          insights={durationInsights(trend)}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.map((p) => ({ ...p, dayLabel: fmtDay(p.day) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => `${v}s`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                  formatter={(v: unknown) => fmtDuration(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                <Line type="monotone" dataKey="avgDuration" name="Avg duration" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Peak Calling Hours"
          subtitle="Volume distribution by hour of day"
          question="What are the highest traffic hours? When should manpower peak?"
          insights={hourInsights(hourTotals)}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourTotals.map((h) => ({ ...h, hourLabel: `${h.hour}:00` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hourLabel" tick={{ fill: '#c4b5fd', fontSize: 10 }} interval={1} />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }} />
                <Bar dataKey="total" name="Calls" radius={[4, 4, 0, 0]}>
                  {hourTotals.map((h, i) => {
                    const max = Math.max(...hourTotals.map((x) => x.total), 1);
                    const ratio = h.total / max;
                    const c = ratio > 0.85 ? '#d946ef' : ratio > 0.55 ? '#a855f7' : ratio > 0.3 ? '#7c3aed' : '#4c1d95';
                    return <Cell key={i} fill={c} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>

      <ChartCard
        title="Hourly Call Distribution Heatmap"
        subtitle="Day of week × Hour of day — call volume intensity"
        question="When exactly should manpower be allocated? Where are the dead zones?"
        insights={[
          ...(heatCells.length ? [{
            tone: 'opportunity' as const, label: 'PATTERN',
            text: (() => {
              const top = [...heatCells].sort((a, b) => b.total - a.total)[0];
              if (!top) return 'No clear hot-spot.';
              const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              return `Hottest cell: ${dn[top.dow]} ${top.hour}:00 with ${fmtInt(top.total)} calls. Lock this window for high-intent campaigns.`;
            })(),
          }] : []),
        ]}
      >
        <Heatmap cells={heatCells} mode="volume" />
      </ChartCard>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Weekday Performance"
          subtitle="Mon–Sun comparison: volume + connect rate"
          question="Which days generate maximum engagement?"
          insights={weekdayInsights(weekdayPerf)}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weekdayPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fbbf24', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                  formatter={(v, name) => (name === 'Connect Rate' ? `${(Number(v) * 100).toFixed(1)}%` : fmtInt(Number(v)))} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                <Bar yAxisId="l" dataKey="total"     name="Calls"        fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="l" dataKey="connected" name="Connected"    fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="connectionRate" name="Connect Rate" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Customer Reachability Funnel"
          subtitle="Calls → Customers → Connected → Meaningful → Successful"
          question="Where are we losing customers in the engagement funnel?"
          insights={funnelInsights(funnelStages)}
        >
          <Funnel stages={funnelStages} />
        </ChartCard>
      </section>

      {/* Agent Performance Intelligence */}
      <ChartCard
        title="Agent Leaderboard"
        subtitle={`Top ${Math.min(sortedAgents.length, 100)} agents — sortable across all KPIs`}
        question="Who are the top-performing agents and who needs coaching?"
        insights={agentInsights(agents)}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
              <tr>
                <th className="text-left py-2 pr-2">#</th>
                <th className="text-left py-2 pr-2">Agent</th>
                {[
                  ['totalCalls', 'Calls'],
                  ['connectedCalls', 'Connected'],
                  ['connectionRate', 'Connect %'],
                  ['meaningfulCalls', 'Meaningful'],
                  ['meaningfulRate', 'Meaningful %'],
                  ['avgDuration', 'Avg Dur'],
                  ['totalTalkTime', 'Talk Time'],
                  ['uniqueCustomers', 'Unique Cust'],
                ].map(([col, label]) => (
                  <th
                    key={col as string}
                    className="text-right py-2 px-2 cursor-pointer hover:text-purple-100 select-none"
                    onClick={() => setAgentSort((s) => ({ col: col as keyof AgentRow, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
                  >
                    {label} {agentSort.col === col ? (agentSort.dir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAgents.slice(0, 30).map((a, i) => (
                <tr key={a.agentName} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-2 text-purple-300/60">{i + 1}</td>
                  <td className="py-2 pr-2 text-purple-100 font-medium">{a.agentName}</td>
                  <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.totalCalls)}</td>
                  <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(a.connectedCalls)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span className={a.connectionRate >= 0.6 ? 'text-emerald-300' : a.connectionRate >= 0.4 ? 'text-amber-300' : 'text-rose-300'}>
                      {fmtPct(a.connectionRate, 1)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(a.meaningfulCalls)}</td>
                  <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtPct(a.meaningfulRate, 1)}</td>
                  <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtDuration(a.avgDuration)}</td>
                  <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtTalkTime(a.totalTalkTime)}</td>
                  <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(a.uniqueCustomers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedAgents.length > 30 && (
            <div className="text-[10px] text-purple-300/60 text-center mt-2">Showing top 30 of {sortedAgents.length}</div>
          )}
        </div>
      </ChartCard>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Agent Efficiency Matrix"
          subtitle="Volume (x) vs Connection Rate (y) — 4 quadrants of performance"
          question="Which agents need coaching? Who's a stealth high-performer?"
          insights={[
            {
              tone: 'opportunity', label: 'MATRIX',
              text: 'Top-right = stars. Bottom-right = high volume, low connect → script/coaching. Top-left = stealth performers, give more volume. Bottom-left = underperforming.',
            },
          ]}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="totalCalls" name="Calls" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact}>
                </XAxis>
                <YAxis type="number" dataKey="connectionRate" name="Connect Rate" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <ZAxis type="number" dataKey="meaningfulCalls" range={[40, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const p = (payload?.[0]?.payload) as AgentRow | undefined;
                    if (!p) return null;
                    return (
                      <div className="bg-slate-900/95 border border-purple-400/30 rounded-lg px-3 py-2 text-xs text-white">
                        <div className="font-semibold">{p.agentName}</div>
                        <div>Calls: {fmtInt(p.totalCalls)}</div>
                        <div>Connect: {fmtPct(p.connectionRate)}</div>
                        <div>Meaningful: {fmtInt(p.meaningfulCalls)} ({fmtPct(p.meaningfulRate)})</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={agents.filter((a) => a.totalCalls >= 20)} fill="#d946ef" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Repeat Call Distribution"
          subtitle="How many attempts per unique customer"
          question="How many follow-ups are required before engagement?"
          insights={repeatInsights(dist)}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="bucket" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }} formatter={(v: unknown) => fmtInt(Number(v))} />
                <Bar dataKey="customers" name="Customers" fill="#a855f7" radius={[4, 4, 0, 0]}>
                  {dist.map((d, i) => {
                    const isHigh = ['5-9 calls', '10-19 calls', '20+ calls'].includes(d.bucket);
                    return <Cell key={i} fill={isHigh ? '#ef4444' : i === 0 ? '#10b981' : '#a855f7'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Customer Reachability"
          subtitle="Reachable vs Unreachable segments"
          question="Which customer segments need an alternative engagement channel?"
          insights={reach ? reachInsights(reach) : []}
        >
          {reach ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-400/10 border border-emerald-400/30 rounded-xl p-4">
                <div className="text-[10px] uppercase text-emerald-300 font-semibold">Reachable</div>
                <div className="text-2xl font-bold text-emerald-100 mt-1">{fmtCompact(reach.reachable)}</div>
                <div className="text-[11px] text-emerald-200/70 mt-1">{reach.total ? fmtPct(reach.reachable / reach.total) : '—'} of contacted</div>
              </div>
              <div className="bg-rose-400/10 border border-rose-400/30 rounded-xl p-4">
                <div className="text-[10px] uppercase text-rose-300 font-semibold">Unreachable</div>
                <div className="text-2xl font-bold text-rose-100 mt-1">{fmtCompact(reach.unreachable)}</div>
                <div className="text-[11px] text-rose-200/70 mt-1">never connected</div>
              </div>
              <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl p-4">
                <div className="text-[10px] uppercase text-amber-300 font-semibold">Frequently Missed</div>
                <div className="text-2xl font-bold text-amber-100 mt-1">{fmtCompact(reach.frequentlyMissed)}</div>
                <div className="text-[11px] text-amber-200/70 mt-1">3+ tries, no connect</div>
              </div>
            </div>
          ) : <div className="text-purple-200/60 text-sm">No reachability data.</div>}
        </ChartCard>

        <ChartCard
          title="Call Duration Distribution"
          subtitle="Bucketed call lengths across the period"
          question="How many calls are ending too quickly to be useful?"
          insights={durationDistInsights(durBuckets)}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="bucket" tick={{ fill: '#c4b5fd', fontSize: 10 }} interval={0} angle={-20} dy={8} height={50} />
                <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }} formatter={(v: unknown) => fmtInt(Number(v))} />
                <Bar dataKey="calls" name="Calls" radius={[4, 4, 0, 0]}>
                  {durBuckets.map((b, i) => {
                    const danger = b.bucket.includes('0 sec') || b.bucket.includes('1-14');
                    const warn = b.bucket.includes('15-29');
                    const good = b.bucket.includes('1-2 min') || b.bucket.includes('2-5 min') || b.bucket.includes('5+');
                    return <Cell key={i} fill={danger ? '#ef4444' : warn ? '#f59e0b' : good ? '#10b981' : '#a855f7'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Call Outcome Analysis"
          subtitle="Top 15 dispositions logged by agents"
          question="What outcomes are dominating operations?"
          insights={dispoInsights(dispositions)}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-2">#</th>
                  <th className="text-left py-2 pr-2">Disposition</th>
                  <th className="text-left py-2 pr-2">Code</th>
                  <th className="text-right py-2 pl-2">Calls</th>
                  <th className="text-right py-2 pl-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const total = dispositions.reduce((a, b) => a + b.calls, 0) || 1;
                  return dispositions.map((d, i) => (
                    <tr key={`${d.name}-${d.code}-${i}`} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 pr-2 text-purple-300/60">{i + 1}</td>
                      <td className="py-2 pr-2 text-purple-100">{d.name}</td>
                      <td className="py-2 pr-2 text-purple-300/70 text-[10px] uppercase tracking-wider">{d.code}</td>
                      <td className="py-2 pl-2 text-right text-purple-100 tabular-nums">{fmtInt(d.calls)}</td>
                      <td className="py-2 pl-2 text-right text-purple-200/70 tabular-nums">{fmtPct(d.calls / total)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="Business Opportunity Loss"
          subtitle="Where call attempts fail to convert into engagement"
          question="What's the financial cost of dropped calls? What's recoverable?"
          insights={oppLoss ? lossInsights(oppLoss) : []}
        >
          {oppLoss ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <KPICard label="Missed" value={fmtCompact(oppLoss.missed)} sub={fmtPct(oppLoss.missedRate)} tone="rose" />
                <KPICard label="No Answer" value={fmtCompact(oppLoss.noAnswer)} sub={fmtPct(oppLoss.noAnswerRate)} tone="amber" />
                <KPICard label="Short Calls (<15s)" value={fmtCompact(oppLoss.shortCalls)} sub={fmtPct(oppLoss.shortRate)} tone="rose" />
                <KPICard label="Not Connected" value={fmtCompact(oppLoss.notConnected)} sub={fmtPct(oppLoss.notConnectedRate)} tone="rose" />
              </div>
              <div className="bg-gradient-to-r from-rose-500/15 to-amber-500/10 border border-rose-400/30 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-rose-200 font-semibold">Recoverable Opportunity</div>
                <div className="text-xl font-bold text-white mt-1">
                  ~{fmtCompact(Math.round(oppLoss.notConnected * 0.25))} interactions
                </div>
                <div className="text-[11px] text-rose-200/80 mt-1">
                  Estimated if 25% of unreached attempts were retried successfully.
                </div>
              </div>
            </div>
          ) : <div className="text-purple-200/60 text-sm">No data.</div>}
        </ChartCard>
      </section>
    </div>
  );
}

// ───────────────────────── Tab: Dashboard (overview landing) ─────────────────────────

function DashboardTab(props: {
  loading: boolean;
  overview: Overview | null;
  momRows: MomRow[];
  momLoading: boolean;
  buyerAttemptRows: BuyerAttemptRow[];
  buyerAttemptLoading: boolean;
  buyerAttemptGrain: BuyerAttemptGrain;
  setBuyerAttemptGrain: (g: BuyerAttemptGrain) => void;
}) {
  const { loading, overview, momRows, momLoading, buyerAttemptRows, buyerAttemptLoading, buyerAttemptGrain, setBuyerAttemptGrain } = props;

  if (loading && !overview) {
    return <div className="text-purple-200 py-16 text-center text-sm">Loading dashboard…</div>;
  }
  if (!overview) {
    return <div className="text-purple-200/70 py-16 text-center text-sm">No data for this window.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Hero KPIs */}
      <section>
        <div className="text-xs uppercase tracking-wider text-purple-300/70 font-semibold mb-3">At a glance</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="Total Calls"        value={fmtCompact(overview.totalCalls)}              sub={`${fmtInt(overview.totalCalls)} attempts`} tone="fuchsia" icon="📞" />
          <KPICard label="Connected"          value={fmtCompact(overview.connectedCalls)}          sub={fmtPct(overview.connectionRate)}            tone="emerald" icon="✓" />
          <KPICard label="Unique Customers"   value={fmtCompact(overview.uniqueCustomers)}         sub={`${overview.avgCallsPerCustomer.toFixed(1)} calls / cust`} tone="purple" icon="👥" />
          <KPICard label="Avg Duration"       value={fmtDuration(overview.avgDurationConnected)}   sub="connected calls" tone="indigo" icon="⏱" />
          <KPICard label="Total Talk Time"    value={fmtTalkTime(overview.totalTalkTimeSec)}        sub={`${overview.uniqueAgents} agents`} tone="sky" icon="🕓" />
          <KPICard label="Missed + No Ans"    value={fmtCompact(overview.missedCalls + overview.noAnswerCalls)} sub={fmtPct((overview.missedCalls + overview.noAnswerCalls) / Math.max(overview.totalCalls, 1))} tone="rose" icon="↺" />
        </div>
      </section>

      {/* Month-over-Month rollup */}
      <MomSection rows={momRows} loading={momLoading} />

      {/* ATC Buyer Attempt Rate (last 3 months) */}
      <BuyerAttemptsSection
        rows={buyerAttemptRows}
        loading={buyerAttemptLoading}
        grain={buyerAttemptGrain}
        setGrain={setBuyerAttemptGrain}
      />
    </div>
  );
}

// ───────────────────────── Buyer Attempts Section ─────────────────────────

function BuyerAttemptsSection({ rows, loading, grain, setGrain }: {
  rows: BuyerAttemptRow[];
  loading: boolean;
  grain: BuyerAttemptGrain;
  setGrain: (g: BuyerAttemptGrain) => void;
}) {
  const bucketLabel = (b: string): string => {
    if (!b) return b;
    const [y, m, d] = b.split('-').map(Number);
    if (!y || !m || !d) return b;
    const date = new Date(y, m - 1, d);
    if (grain === 'month') {
      return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
    if (grain === 'week') {
      const end = new Date(date.getTime() + 6 * 86400000);
      const s = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const e = end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `${s} – ${e}`;
    }
    const weekday = date.toLocaleDateString('en-IN', { weekday: 'short' });
    const dayMonth = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return `${dayMonth} · ${weekday}`;
  };

  // Footer totals (weighted rates across buckets).
  const totals = rows.reduce(
    (a, r) => ({
      totalAtcBuyer: a.totalAtcBuyer + r.totalAtcBuyer,
      attemptedSameDay: a.attemptedSameDay + r.attemptedSameDay,
      attemptedNextDayOnly: a.attemptedNextDayOnly + r.attemptedNextDayOnly,
      totalAttemptedByNextDay: a.totalAttemptedByNextDay + r.totalAttemptedByNextDay,
    }),
    { totalAtcBuyer: 0, attemptedSameDay: 0, attemptedNextDayOnly: 0, totalAttemptedByNextDay: 0 },
  );
  const wSameDayRate = totals.totalAtcBuyer ? (totals.attemptedSameDay * 100) / totals.totalAtcBuyer : 0;
  const wCumulativeRate = totals.totalAtcBuyer ? (totals.totalAttemptedByNextDay * 100) / totals.totalAtcBuyer : 0;

  const rateColor = (pct: number) =>
    pct >= 80 ? 'text-emerald-300' :
    pct >= 50 ? 'text-amber-300' :
    'text-rose-300';

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="text-base font-semibold text-white">ATC Buyer Attempt Rate</div>
          <div className="text-xs text-purple-200/70 mt-0.5">
            D2R intercity orders (selected date range) — was the buyer called on order date or the next day?
            Campaigns: Cold Lead, Warm_Lead.
          </div>
        </div>
        <div className="inline-flex p-1 bg-white/5 border border-white/10 rounded-lg">
          {(['day', 'week', 'month'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGrain(g)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                grain === g
                  ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow'
                  : 'text-purple-200 hover:bg-white/5'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-purple-200 text-sm py-10 text-center">Loading buyer attempts…</div>
      ) : rows.length === 0 ? (
        <div className="text-purple-200/70 text-sm py-10 text-center">No ATC buyers in this window.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
              <tr>
                <th className="text-left py-2 pr-2">
                  {grain === 'day' ? 'Order Date' : grain === 'week' ? 'Order Week' : 'Order Month'}
                </th>
                <th className="text-right py-2 px-2">Total ATC Buyer</th>
                <th className="text-right py-2 px-2">Attempted Same Day</th>
                <th className="text-right py-2 px-2">Same-Day %</th>
                <th className="text-right py-2 px-2" title="Buyers called only on the next day (not same day)">Next-Day Only</th>
                <th className="text-right py-2 px-2">Total Attempted (by Next Day)</th>
                <th className="text-right py-2 px-2">Cumulative %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bucket} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-2 text-purple-100 font-semibold whitespace-nowrap">{bucketLabel(r.bucket)}</td>
                  <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(r.totalAtcBuyer)}</td>
                  <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(r.attemptedSameDay)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${rateColor(r.attemptRateSameDay)}`}>{r.attemptRateSameDay.toFixed(2)}%</td>
                  <td className="py-2 px-2 text-right text-amber-300 tabular-nums">{fmtInt(r.attemptedNextDayOnly)}</td>
                  <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(r.totalAttemptedByNextDay)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${rateColor(r.cumulativeAttemptRate)}`}>{r.cumulativeAttemptRate.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 font-semibold">
                <td className="py-2 pr-2 text-purple-100">Total / Weighted</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(totals.totalAtcBuyer)}</td>
                <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(totals.attemptedSameDay)}</td>
                <td className={`py-2 px-2 text-right tabular-nums ${rateColor(wSameDayRate)}`}>{wSameDayRate.toFixed(2)}%</td>
                <td className="py-2 px-2 text-right text-amber-300 tabular-nums">{fmtInt(totals.attemptedNextDayOnly)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(totals.totalAttemptedByNextDay)}</td>
                <td className={`py-2 px-2 text-right tabular-nums ${rateColor(wCumulativeRate)}`}>{wCumulativeRate.toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── MoM Section ─────────────────────────

function MomSection({ rows, loading }: { rows: MomRow[]; loading: boolean }) {
  const monthLabel = (k: string) => {
    if (!k) return k;
    const [y, m] = k.split('-').map(Number);
    if (!y || !m) return k;
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  };
  const totals = rows.reduce(
    (a, r) => ({
      totalAttempts: a.totalAttempts + r.totalAttempts,
      uniqueAttempts: a.uniqueAttempts + r.uniqueAttempts,
      totalConnected: a.totalConnected + r.totalConnected,
      uniqueConnected: a.uniqueConnected + r.uniqueConnected,
      connectedUnder15: a.connectedUnder15 + r.connectedUnder15,
      connected15Plus: a.connected15Plus + r.connected15Plus,
      totalTalkTime: a.totalTalkTime + r.totalTalkTime,
    }),
    { totalAttempts: 0, uniqueAttempts: 0, totalConnected: 0, uniqueConnected: 0, connectedUnder15: 0, connected15Plus: 0, totalTalkTime: 0 },
  );
  const overallConnectPct = totals.totalAttempts ? totals.totalConnected / totals.totalAttempts : 0;
  // Weighted average connected duration across all months.
  const weightedAvgDur = totals.totalConnected
    ? rows.reduce((a, r) => a + r.avgConnectedDuration * r.totalConnected, 0) / totals.totalConnected
    : 0;
  // Peak active agents in any single month.
  const maxActiveAgents = rows.reduce((a, r) => Math.max(a, r.activeAgents), 0);

  return (
    <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-base font-semibold text-white">Month-over-Month Summary</div>
          <div className="text-xs text-purple-200/70 mt-0.5">
            Calling activity rolled up by calendar month. Respects the date range and global filters above.
          </div>
        </div>
        {rows.length > 0 && (
          <div className="text-[11px] text-purple-300/70">{rows.length} {rows.length === 1 ? 'month' : 'months'} in window</div>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-purple-200 text-sm py-10 text-center">Loading MoM summary…</div>
      ) : rows.length === 0 ? (
        <div className="text-purple-200/70 text-sm py-10 text-center">
          No months in the selected window. Widen the date range to see month-by-month comparison.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10">
              <tr>
                <th className="text-left py-2 pr-2 sticky left-0 bg-slate-900/30 backdrop-blur z-10">Month</th>
                <th className="text-right py-2 px-2">Total Attempt Calls</th>
                <th className="text-right py-2 px-2">Unique Attempt</th>
                <th className="text-right py-2 px-2">Total Connected</th>
                <th className="text-right py-2 px-2">Unique Connected</th>
                <th className="text-right py-2 px-2">Connected %</th>
                <th className="text-right py-2 px-2" title="Connected calls shorter than 15 seconds">Connected &lt;15s</th>
                <th className="text-right py-2 px-2" title="Connected calls of 15 seconds or more">Connected &ge;15s</th>
                <th className="text-right py-2 px-2">Avg Connected Duration</th>
                <th className="text-right py-2 px-2">Active Agents</th>
                <th className="text-right py-2 px-2">Talk Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = i > 0 ? rows[i - 1] : null;
                const momPct = prev && prev.totalAttempts > 0
                  ? ((r.totalAttempts - prev.totalAttempts) / prev.totalAttempts) * 100
                  : null;
                return (
                  <tr key={r.monthKey} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-2 text-purple-100 font-semibold whitespace-nowrap sticky left-0 bg-slate-900/30 backdrop-blur">
                      <div>{monthLabel(r.monthKey)}</div>
                      {momPct !== null && (
                        <div className={`text-[10px] font-normal ${momPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {momPct >= 0 ? '↑' : '↓'} {Math.abs(momPct).toFixed(1)}% MoM
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(r.totalAttempts)}</td>
                    <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(r.uniqueAttempts)}</td>
                    <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(r.totalConnected)}</td>
                    <td className="py-2 px-2 text-right text-emerald-200 tabular-nums">{fmtInt(r.uniqueConnected)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <span className={r.connectedPct >= 0.5 ? 'text-emerald-300' : r.connectedPct >= 0.3 ? 'text-amber-300' : 'text-rose-300'}>
                        {fmtPct(r.connectedPct)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-rose-300 tabular-nums">{fmtInt(r.connectedUnder15)}</td>
                    <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(r.connected15Plus)}</td>
                    <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtDuration(r.avgConnectedDuration)}</td>
                    <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(r.activeAgents)}</td>
                    <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtTalkTime(r.totalTalkTime)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 font-semibold">
                <td className="py-2 pr-2 text-purple-100 sticky left-0 bg-slate-900/60 backdrop-blur">Total / Avg</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(totals.totalAttempts)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(totals.uniqueAttempts)}</td>
                <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(totals.totalConnected)}</td>
                <td className="py-2 px-2 text-right text-emerald-200 tabular-nums">{fmtInt(totals.uniqueConnected)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtPct(overallConnectPct)}</td>
                <td className="py-2 px-2 text-right text-rose-300 tabular-nums">{fmtInt(totals.connectedUnder15)}</td>
                <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(totals.connected15Plus)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtDuration(Math.round(weightedAvgDur))}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums" title="Peak active agents in any single month">{fmtInt(maxActiveAgents)}</td>
                <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtTalkTime(totals.totalTalkTime)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Tab 3: Daily Trend ─────────────────────────

function DailyTrendTab(props: {
  data: DailyResp | null;
  loading: boolean;
  focusDay: string | null;
  setFocusDay: (d: string | null) => void;
}) {
  const { data, loading, focusDay, setFocusDay } = props;
  const [sort, setSort] = useState<{ col: keyof DailyDetailedRow; dir: 'asc' | 'desc' }>({ col: 'day', dir: 'desc' });

  if (loading && !data) {
    return <div className="text-purple-200 py-16 text-center text-sm">Loading daily trend…</div>;
  }
  if (!data || !data.series.length) {
    return <div className="text-purple-200/70 py-16 text-center text-sm">No data for this window.</div>;
  }

  const { series, summary, dayHourly } = data;
  const sorted = [...series].sort((a, b) => {
    const av = a[sort.col];
    const bv = b[sort.col];
    if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
    const as = String(av ?? '');
    const bs = String(bv ?? '');
    return sort.dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
  });

  const maxTotal = Math.max(1, ...series.map((s) => s.total));
  const last7AvgDelta = summary.prev7Avg > 0 ? ((summary.last7Avg - summary.prev7Avg) / summary.prev7Avg) * 100 : null;
  const last7ConnectDelta = (summary.last7ConnectRate - summary.prev7ConnectRate) * 100;

  // Chart data: include cumulative connect rate per day for a secondary y-axis,
  // plus per-segment share-of-total so each stacked bar can show its own %.
  const chartData = series.map((s) => {
    const t = Math.max(1, s.total);
    return {
      ...s,
      dayLabel: fmtDay(s.day),
      connectedPct: s.connected / t,
      noAnswerPct: s.noAnswer / t,
      missedPct: s.missed / t,
    };
  });

  // Crisp, outlined % label drawn inside each stacked bar segment.
  // The connect-rate line runs along the connected/no-answer boundary, so we
  // anchor the bottom segment's label low and the top segment's label high to
  // keep both clear of the line. Hidden when the segment is too small to read.
  const makeBarPct = (anchor: 'top' | 'center' | 'bottom') => (props: any) => {
    const { x, y, width, height, value, index } = props;
    if (value == null || width == null || height == null) return null;
    if (height < 15 || width < 20 || value < 0.04) return <g key={`bp-${index}`} />;
    const ly = anchor === 'top' ? y + 12 : anchor === 'bottom' ? y + height - 12 : y + height / 2;
    return (
      <text
        key={`bp-${index}`}
        x={x + width / 2}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={2.4}
        paintOrder="stroke"
        fontSize={11}
        fontWeight={800}
      >
        {`${(value * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-5">
      {/* Period KPI strip */}
      <section>
        <div className="text-xs uppercase tracking-wider text-purple-300/70 font-semibold mb-3">Period Comparison</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KPICard
            label="Today"
            value={fmtCompact(summary.todayCalls)}
            sub={`${fmtPct(summary.todayConnectRate)} connect`}
            tone="fuchsia"
            icon="📞"
          />
          <KPICard
            label="Yesterday"
            value={fmtCompact(summary.yesterdayCalls)}
            sub={`${fmtPct(summary.yesterdayConnectRate)} connect`}
            tone="purple"
            icon="⏪"
          />
          <KPICard
            label="Day-over-Day"
            value={summary.yesterdayCalls > 0
              ? `${(((summary.todayCalls - summary.yesterdayCalls) / summary.yesterdayCalls) * 100).toFixed(1)}%`
              : '—'}
            sub={summary.todayCalls > summary.yesterdayCalls ? 'up vs yesterday' : 'down vs yesterday'}
            tone={summary.todayCalls >= summary.yesterdayCalls ? 'emerald' : 'rose'}
            icon={summary.todayCalls >= summary.yesterdayCalls ? '↑' : '↓'}
          />
          <KPICard
            label="Last 7d Avg"
            value={fmtCompact(summary.last7Avg)}
            sub={last7AvgDelta === null ? `${fmtPct(summary.last7ConnectRate)} connect` : `${last7AvgDelta >= 0 ? '+' : ''}${last7AvgDelta.toFixed(1)}% vs prev 7d`}
            tone="indigo"
            icon="📈"
          />
          <KPICard
            label="Window Avg"
            value={fmtCompact(summary.windowAvg)}
            sub={`${fmtPct(summary.windowConnectRate)} connect`}
            tone="sky"
            icon="📊"
          />
          <KPICard
            label="Connect Δ (7d)"
            value={`${last7ConnectDelta >= 0 ? '+' : ''}${last7ConnectDelta.toFixed(1)}pp`}
            sub="last 7 vs prior 7"
            tone={last7ConnectDelta >= 0 ? 'emerald' : 'amber'}
            icon="🔗"
          />
        </div>
      </section>

      {/* Daily breakdown chart */}
      <ChartCard
        title="Daily Stacked Breakdown"
        subtitle="Per-day connected / no-answer / missed bars + connect rate line"
        question="Day-by-day: where did volume spike or drop, and what happened to connect quality?"
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barConnected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="barNoAnswer" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="barMissed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#e11d48" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fcd34d', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
              <Tooltip
                cursor={{ fill: 'rgba(168,85,247,0.08)' }}
                contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                formatter={(v, name, item: any) => {
                  if (name === 'Connect Rate') return [`${(Number(v) * 100).toFixed(1)}%`, name];
                  const total = item?.payload?.total ?? 0;
                  const pct = total ? ` (${((Number(v) / total) * 100).toFixed(0)}%)` : '';
                  return [`${fmtInt(Number(v))}${pct}`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
              <Bar yAxisId="l" dataKey="connected" name="Connected" stackId="a" fill="url(#barConnected)">
                <LabelList dataKey="connectedPct" content={makeBarPct('bottom')} />
              </Bar>
              <Bar yAxisId="l" dataKey="noAnswer"  name="No Answer"  stackId="a" fill="url(#barNoAnswer)" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="noAnswerPct" content={makeBarPct('top')} />
              </Bar>
              <Bar yAxisId="l" dataKey="missed"    name="Missed"    stackId="a" fill="url(#barMissed)" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="missedPct" content={makeBarPct('center')} />
              </Bar>
              <Line
                yAxisId="r"
                type="monotone"
                dataKey="connectionRate"
                name="Connect Rate"
                stroke="#fde047"
                strokeWidth={3}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                dot={(props: any) => {
                  const { cx, cy, index, payload } = props;
                  if (cx == null || cy == null) return <g key={`crd-${index}`} />;
                  // Keep labels readable: cap to ~30 evenly-spaced labels for wide ranges.
                  const step = Math.max(1, Math.ceil(chartData.length / 30));
                  const showLabel = index % step === 0;
                  const rate = payload?.connectionRate;
                  return (
                    <g key={`crd-${index}`}>
                      <circle cx={cx} cy={cy} r={3.5} fill="#fde047" stroke="#1e1b4b" strokeWidth={1} />
                      {showLabel && rate != null && (
                        <g>
                          <rect x={cx - 17} y={cy - 26} width={34} height={16} rx={8} fill="rgba(15,10,40,0.82)" stroke="#fbbf24" strokeWidth={0.8} />
                          <text
                            x={cx}
                            y={cy - 18}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#fde047"
                            fontSize={11}
                            fontWeight={800}
                          >
                            {`${(Number(rate) * 100).toFixed(0)}%`}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Detailed daily metrics table */}
      <div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-white">Detailed Daily Metrics</div>
              <div className="text-xs text-purple-200/70 mt-0.5">Click any row to see its hour-by-hour breakdown. Sortable columns.</div>
            </div>
            <div className="text-[10px] text-purple-300/60">{series.length} days</div>
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10 sticky top-0 bg-slate-900/80 backdrop-blur">
                <tr>
                  {([
                    ['day', 'Date', 'left'],
                    ['dowName', 'Day', 'left'],
                    ['total', 'Total', 'right'],
                    ['connected', 'Connected', 'right'],
                    ['connectionRate', 'Connect %', 'right'],
                    ['meaningful', 'Meaningful', 'right'],
                    ['avgDuration', 'Avg Dur', 'right'],
                    ['totalTalkTime', 'Talk Time', 'right'],
                    ['uniqueCustomers', 'Customers', 'right'],
                    ['uniqueAgents', 'Agents', 'right'],
                    ['deltaPrevPct', 'Δ Day', 'right'],
                    ['wowDeltaPct', 'Δ WoW', 'right'],
                  ] as const).map(([col, label, align]) => (
                    <th
                      key={col}
                      className={`py-2 px-2 cursor-pointer hover:text-purple-100 select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
                      onClick={() => setSort((s) => ({ col: col as keyof DailyDetailedRow, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    >
                      {label} {sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const isFocused = focusDay === r.day;
                  const widthPct = (r.total / maxTotal) * 100;
                  return (
                    <tr
                      key={r.day}
                      className={`border-b border-white/5 cursor-pointer ${isFocused ? 'bg-fuchsia-500/15' : 'hover:bg-white/5'}`}
                      onClick={() => setFocusDay(isFocused ? null : r.day)}
                    >
                      <td className="py-2 px-2 text-purple-100 whitespace-nowrap">{fmtDay(r.day)}</td>
                      <td className="py-2 px-2 text-purple-200/80">{r.dowName}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden md:block w-14 h-1.5 bg-white/5 rounded overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-fuchsia-400 to-purple-500" style={{ width: `${widthPct}%` }} />
                          </div>
                          <span className="text-purple-100 tabular-nums font-semibold">{fmtInt(r.total)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-emerald-300 tabular-nums">{fmtInt(r.connected)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <span className={r.connectionRate >= 0.5 ? 'text-emerald-300' : r.connectionRate >= 0.3 ? 'text-amber-300' : 'text-rose-300'}>
                          {fmtPct(r.connectionRate)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtInt(r.meaningful)}</td>
                      <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtDuration(r.avgDuration)}</td>
                      <td className="py-2 px-2 text-right text-purple-200 tabular-nums whitespace-nowrap">{fmtTalkTime(r.totalTalkTime)}</td>
                      <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(r.uniqueCustomers)}</td>
                      <td className="py-2 px-2 text-right text-purple-200 tabular-nums">{fmtInt(r.uniqueAgents)}</td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        {r.deltaPrevPct === null ? <span className="text-purple-300/50">—</span> :
                          <span className={r.deltaPrevPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                            {r.deltaPrevPct >= 0 ? '+' : ''}{r.deltaPrevPct.toFixed(1)}%
                          </span>
                        }
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        {r.wowDeltaPct === null ? <span className="text-purple-300/50">—</span> :
                          <span className={r.wowDeltaPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                            {r.wowDeltaPct >= 0 ? '+' : ''}{r.wowDeltaPct.toFixed(1)}%
                          </span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hourly drilldown for focused day */}
      {focusDay && dayHourly && (
        <ChartCard
          title={`Hourly Breakdown — ${fmtDay(focusDay)}`}
          subtitle="Hour-by-hour view of calls placed on the selected day"
          question="Within this day, when did the team peak — and when did connect quality dip?"
          insights={(() => {
            const valid = dayHourly.filter((h) => h.total > 0);
            if (!valid.length) return [{ tone: 'neutral' as const, label: 'EMPTY', text: 'No calls recorded on this day.' }];
            const peak = valid.reduce((a, b) => (b.total > a.total ? b : a));
            const trough = valid.reduce((a, b) => (b.total < a.total ? b : a));
            const lowConn = valid.filter((h) => h.total >= 10).sort((a, b) => a.connectionRate - b.connectionRate)[0];
            return [
              { tone: 'positive', label: 'PEAK', text: `Peak hour: ${peak.hour}:00 — ${fmtInt(peak.total)} calls, ${fmtPct(peak.connectionRate)} connect.` },
              { tone: 'neutral', label: 'QUIET', text: `Lightest active hour: ${trough.hour}:00 (${fmtInt(trough.total)} calls).` },
              ...(lowConn ? [{
                tone: 'warning' as const,
                label: 'DIP',
                text: `Weakest connect: ${lowConn.hour}:00 (${fmtPct(lowConn.connectionRate)} on ${fmtInt(lowConn.total)} calls).`,
              }] : []),
            ];
          })()}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dayHourly.map((h) => ({ ...h, hourLabel: `${h.hour}:00` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hourLabel" tick={{ fill: '#c4b5fd', fontSize: 10 }} interval={1} />
                <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fbbf24', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                  formatter={(v, name) => (name === 'Connect Rate' ? `${(Number(v) * 100).toFixed(1)}%` : fmtInt(Number(v)))} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                <Bar yAxisId="l" dataKey="connected" name="Connected" stackId="a" fill="#10b981" />
                <Bar yAxisId="l" dataKey="noAnswer"  name="No Answer"  stackId="a" fill="#f59e0b" />
                <Bar yAxisId="l" dataKey="missed"    name="Missed"    stackId="a" fill="#ef4444" />
                <Line yAxisId="r" type="monotone" dataKey="connectionRate" name="Connect Rate" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-right">
            <button onClick={() => setFocusDay(null)} className="text-[11px] text-purple-300 hover:text-purple-100">Clear day filter</button>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
