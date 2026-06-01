'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, ComposedChart, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { KPICard } from './components/KPICard';
import { ChartCard, InsightPanel, type Insight } from './components/InsightPanel';
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
interface LogRow {
  id: string; callId: string; startStamp: string; startDate: string; startTime: string; endStamp: string;
  direction: string; duration: number; callStatus: string; agentName: string; agentNumber: string;
  callToNumber: string; callerIdNumber: string; campaignName: string; campaignId: string;
  dispositionCode: string; dispositionName: string; subDisposition: string;
  recordingUrl: string; leadId: string;
}
interface LogsResp {
  summary: {
    total: number; connected: number; missed: number; noAnswer: number;
    connectionRate: number; uniqueCustomers: number; uniqueAgents: number;
    totalTalkTime: number; avgDuration: number;
  };
  rows: LogRow[];
  page: number; pageSize: number;
}

// ───────────────────────── filters bar ─────────────────────────

type Tab = 'dashboard' | 'analytics' | 'daily' | 'logs';

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
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
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

type DatePreset =
  | { label: string; days: number }
  | { label: 'YTD'; ytd: true };

const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', days: 0 },
  { label: '7d',    days: 6 },
  { label: '30d',   days: 29 },
  { label: '90d',   days: 89 },
  { label: 'YTD',   ytd: true },
];

function presetRange(p: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  if ('ytd' in p) {
    return { startDate: `${today.getFullYear()}-01-01`, endDate };
  }
  const start = new Date(today.getTime() - p.days * 86400000);
  return { startDate: start.toISOString().slice(0, 10), endDate };
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

  const [logsResp, setLogsResp] = useState<LogsResp | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  const [dailyResp, setDailyResp] = useState<DailyResp | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyFocusDay, setDailyFocusDay] = useState<string | null>(null);

  const [momRows, setMomRows] = useState<MomRow[]>([]);
  const [momLoading, setMomLoading] = useState(false);

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
    if (tab !== 'analytics' && tab !== 'dashboard') return;
    loadAnalytics();
  }, [authChecked, tab, loadAnalytics]);

  // Logs (Tab 2)
  const loadLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const p = new URLSearchParams(qs);
      p.set('page', String(page));
      p.set('pageSize', '50');
      const r = await fetch(`/api/calling-team/logs?${p.toString()}`).then((r) => r.json());
      if (r?.summary) setLogsResp(r);
    } finally {
      setLogsLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'logs') return;
    setLogsPage(1);
    loadLogs(1);
  }, [authChecked, tab, qs, loadLogs]);

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

  // On first visit to Dashboard in a session, default the date range to YTD.
  // After that, leave whatever the user has chosen alone.
  const dashboardYTDInitialized = useRef(false);
  useEffect(() => {
    if (!authChecked) return;
    if (tab !== 'dashboard') return;
    if (dashboardYTDInitialized.current) return;
    dashboardYTDInitialized.current = true;
    const ytd = presetRange({ label: 'YTD', ytd: true });
    setFilters((prev) => ({ ...prev, ...ytd }));
  }, [authChecked, tab]);

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
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex p-1 bg-white/5 border border-white/10 rounded-xl backdrop-blur-xl">
            <button
              onClick={() => setTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'dashboard' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'analytics' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📊 Trends & Insights
            </button>
            <button
              onClick={() => setTab('daily')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'daily' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📅 Daily Trend
            </button>
            <button
              onClick={() => setTab('logs')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'logs' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'text-purple-200 hover:bg-white/5'}`}
            >
              📋 Detailed Call Logs
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setFilters({ ...filters, ...presetRange(p) })}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-purple-200"
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <input
                type="date"
                value={filters.startDate}
                max={filters.endDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="bg-transparent text-xs text-purple-100 focus:outline-none"
              />
              <span className="text-purple-300/60 text-xs">→</span>
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="bg-transparent text-xs text-purple-100 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-4 px-4 py-2 bg-rose-500/15 border border-rose-400/30 rounded-lg text-rose-200 text-sm">
            {err}
          </div>
        )}

        {/* Global filter row — applies across all tabs */}
        <div className="mb-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
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

        {tab === 'dashboard' && (
          <DashboardTab
            loading={loading}
            overview={overview}
            momRows={momRows}
            momLoading={momLoading}
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

        {tab === 'logs' && (
          <LogsTab
            filters={filters}
            setFilters={setFilters}
            filterOpts={filterOpts}
            logsResp={logsResp}
            logsLoading={logsLoading}
            logsPage={logsPage}
            loadLogs={(p) => { setLogsPage(p); loadLogs(p); }}
          />
        )}
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
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
}) {
  const { loading, overview, momRows, momLoading } = props;

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
    </div>
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

// ───────────────────────── Tab 2: Logs ─────────────────────────

function LogsTab(props: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  filterOpts: FilterOpts;
  logsResp: LogsResp | null;
  logsLoading: boolean;
  logsPage: number;
  loadLogs: (p: number) => void;
}) {
  const { filters, setFilters, filterOpts, logsResp, logsLoading, logsPage, loadLogs } = props;
  const [drill, setDrill] = useState<{ type: 'agent' | 'customer' | 'status'; value: string } | null>(null);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
        <div className="text-xs uppercase tracking-wider text-purple-300/70 font-semibold mb-3">Advanced Filters</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <MultiSelect
            label="Agent"
            value={filters.agent}
            options={filterOpts.agents.map((a) => ({ value: a.value, count: a.calls }))}
            onChange={(v) => setFilters({ ...filters, agent: v })}
          />
          <MultiSelect
            label="Campaign"
            value={filters.campaign}
            options={filterOpts.campaigns.map((a) => ({ value: a.value, count: a.calls }))}
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
          <MultiSelect
            label="Direction"
            value={filters.direction}
            options={[
              { value: 'outbound', label: 'Outbound (incl. Manual)' },
              { value: 'inbound',  label: 'Inbound' },
            ]}
            onChange={(v) => setFilters({ ...filters, direction: v })}
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold mb-1">Customer (last 10 digits)</div>
            <input
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              placeholder="e.g. 9876543210"
              className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-purple-100 placeholder-purple-300/40 focus:outline-none"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold mb-1">Duration (sec)</div>
            <div className="flex items-center gap-1">
              <input
                value={filters.minDuration}
                onChange={(e) => setFilters({ ...filters, minDuration: e.target.value.replace(/\D/g, '') })}
                placeholder="min"
                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-purple-100 placeholder-purple-300/40 focus:outline-none"
              />
              <span className="text-purple-300/60">→</span>
              <input
                value={filters.maxDuration}
                onChange={(e) => setFilters({ ...filters, maxDuration: e.target.value.replace(/\D/g, '') })}
                placeholder="max"
                className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-purple-100 placeholder-purple-300/40 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold mb-1">Hour of Day</div>
            <select
              value={filters.hour}
              onChange={(e) => setFilters({ ...filters, hour: e.target.value })}
              className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-purple-100 focus:outline-none"
            >
              <option value="">Any</option>
              {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold mb-1">Day of Week</div>
            <select
              value={filters.weekday}
              onChange={(e) => setFilters({ ...filters, weekday: e.target.value })}
              className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-purple-100 focus:outline-none"
            >
              <option value="">Any</option>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setFilters({ ...filters, agent: [], campaign: [], status: [], direction: [], customer: '', minDuration: '', maxDuration: '', hour: '', weekday: '' })}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-purple-200"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Smart summary */}
      {logsResp && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KPICard label="Total Calls" value={fmtCompact(logsResp.summary.total)} tone="fuchsia" />
          <KPICard label="Connected" value={fmtCompact(logsResp.summary.connected)} tone="emerald" />
          <KPICard label="Connect Rate" value={fmtPct(logsResp.summary.connectionRate)} tone="emerald" />
          <KPICard label="Missed" value={fmtCompact(logsResp.summary.missed)} tone="amber" />
          <KPICard label="Unique Customers" value={fmtCompact(logsResp.summary.uniqueCustomers)} tone="purple" />
          <KPICard label="Avg Duration" value={fmtDuration(logsResp.summary.avgDuration)} tone="indigo" />
          <KPICard label="Total Talk Time" value={fmtTalkTime(logsResp.summary.totalTalkTime)} tone="sky" />
        </div>
      )}

      {/* Table */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
        {logsLoading && !logsResp ? (
          <div className="text-purple-200 text-sm py-10 text-center">Loading…</div>
        ) : !logsResp ? (
          <div className="text-purple-200/70 text-sm py-10 text-center">No data.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-purple-300/70 uppercase tracking-wider text-[10px] border-b border-white/10 sticky top-0 bg-slate-900/80 backdrop-blur">
                  <tr>
                    <th className="text-left py-2 px-2">Start</th>
                    <th className="text-left py-2 px-2">Agent</th>
                    <th className="text-left py-2 px-2">Customer</th>
                    <th className="text-left py-2 px-2">Direction</th>
                    <th className="text-right py-2 px-2">Duration</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Disposition</th>
                    <th className="text-left py-2 px-2">Campaign</th>
                    <th className="text-left py-2 px-2">Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {logsResp.rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-2 text-purple-100 whitespace-nowrap">
                        <div>{r.startDate}</div>
                        <div className="text-[10px] text-purple-300/60">{r.startTime}</div>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          className="text-purple-100 hover:text-fuchsia-300 underline-offset-2 hover:underline disabled:cursor-default disabled:hover:no-underline disabled:text-purple-300/60"
                          disabled={!r.agentName}
                          onClick={() => r.agentName && setDrill({ type: 'agent', value: r.agentName })}
                        >
                          {r.agentName || '—'}
                        </button>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          className="text-purple-100 hover:text-fuchsia-300 underline-offset-2 hover:underline disabled:cursor-default disabled:hover:no-underline disabled:text-purple-300/60"
                          disabled={!r.callToNumber}
                          onClick={() => r.callToNumber && setDrill({ type: 'customer', value: r.callToNumber })}
                        >
                          {r.callToNumber || '—'}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-purple-200/80">{r.direction || '—'}</td>
                      <td className="py-2 px-2 text-right text-purple-100 tabular-nums">{fmtDuration(r.duration)}</td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => r.callStatus && setDrill({ type: 'status', value: r.callStatus })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            r.callStatus && /answer/i.test(r.callStatus) ? 'bg-emerald-400/15 text-emerald-200' :
                            r.callStatus === 'Missed' ? 'bg-rose-400/15 text-rose-200' :
                            r.callStatus === 'No Answer' ? 'bg-amber-400/15 text-amber-200' :
                            'bg-white/10 text-purple-200'
                          }`}
                        >
                          {r.callStatus || '—'}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-purple-200/80">
                        <span className="text-purple-100">{r.dispositionName || '—'}</span>
                        {r.dispositionCode && <span className="ml-1 text-[10px] text-purple-300/60">({r.dispositionCode})</span>}
                      </td>
                      <td className="py-2 px-2 text-purple-200/80">{r.campaignName || '—'}</td>
                      <td className="py-2 px-2">
                        {r.recordingUrl ? (
                          <a href={r.recordingUrl} target="_blank" rel="noreferrer" className="text-fuchsia-300 hover:text-fuchsia-200 underline-offset-2 hover:underline">▶ Play</a>
                        ) : <span className="text-purple-300/40">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between text-xs text-purple-300/70">
              <div>Page {logsPage} — showing {logsResp.rows.length} of {fmtInt(logsResp.summary.total)} matching calls</div>
              <div className="flex gap-2">
                <button
                  onClick={() => logsPage > 1 && loadLogs(logsPage - 1)}
                  disabled={logsPage === 1 || logsLoading}
                  className="px-3 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => logsResp.rows.length === logsResp.pageSize && loadLogs(logsPage + 1)}
                  disabled={logsResp.rows.length < logsResp.pageSize || logsLoading}
                  className="px-3 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drill applies the value into the live filters so the table & summary update */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={() => setDrill(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-purple-200/80">Filter call logs by</div>
            <div className="text-xl font-bold text-white mt-1">{drill.type === 'agent' ? 'Agent' : drill.type === 'customer' ? 'Customer' : 'Status'}</div>
            <div className="mt-2 text-fuchsia-300 font-semibold break-all">{drill.value}</div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setDrill(null)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-purple-200 text-sm">Cancel</button>
              <button
                onClick={() => {
                  if (drill.type === 'agent') setFilters({ ...filters, agent: [drill.value] });
                  else if (drill.type === 'customer') setFilters({ ...filters, customer: drill.value });
                  else setFilters({ ...filters, status: [drill.value] });
                  setDrill(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold"
              >
                Apply filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

  const { series, dowAgg, summary, dayHourly } = data;
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

  // Chart data: include cumulative connect rate per day for a secondary y-axis.
  const chartData = series.map((s) => ({ ...s, dayLabel: fmtDay(s.day) }));

  // AI insights for the daily tab.
  const insights: Insight[] = [];
  if (summary.bestDay && summary.worstDay) {
    insights.push({
      tone: 'positive',
      label: 'BEST DAY',
      text: `${fmtDay(summary.bestDay.day)} (${summary.bestDay.dowName}) — ${fmtInt(summary.bestDay.total)} calls, ${fmtPct(summary.bestDay.connectionRate)} connect.`,
    });
    const ratio = summary.bestDay.total / Math.max(summary.worstDay.total, 1);
    if (ratio > 3) {
      insights.push({
        tone: 'warning',
        label: 'SWING',
        text: `Best day was ${ratio.toFixed(1)}× the worst (${fmtDay(summary.worstDay.day)} — ${fmtInt(summary.worstDay.total)} calls). High volatility — investigate scheduling or campaign launches.`,
      });
    }
  }
  if (last7AvgDelta !== null) {
    insights.push({
      tone: last7AvgDelta > 5 ? 'positive' : last7AvgDelta < -5 ? 'danger' : 'neutral',
      label: 'MOMENTUM',
      text: `Last 7-day daily average (${fmtCompact(summary.last7Avg)}) is ${last7AvgDelta >= 0 ? 'up' : 'down'} ${Math.abs(last7AvgDelta).toFixed(1)}% vs the prior 7 days.`,
    });
  }
  if (summary.bestConnect) {
    insights.push({
      tone: 'opportunity',
      label: 'QUALITY',
      text: `Highest single-day connect rate: ${fmtPct(summary.bestConnect.connectionRate)} on ${fmtDay(summary.bestConnect.day)} (${summary.bestConnect.dowName}). Replicate conditions on this date.`,
    });
  }

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

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <InsightPanel insights={insights} title="What changed this period" />
        </div>
      )}

      {/* Daily breakdown chart */}
      <ChartCard
        title="Daily Stacked Breakdown"
        subtitle="Per-day connected / no-answer / missed bars + connect rate line"
        question="Day-by-day: where did volume spike or drop, and what happened to connect quality?"
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="dayLabel" tick={{ fill: '#c4b5fd', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fbbf24', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
              <Tooltip
                contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                formatter={(v, name) => (name === 'Connect Rate' ? `${(Number(v) * 100).toFixed(1)}%` : fmtInt(Number(v)))}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
              <Bar yAxisId="l" dataKey="connected" name="Connected" stackId="a" fill="#10b981" />
              <Bar yAxisId="l" dataKey="noAnswer"  name="No Answer"  stackId="a" fill="#f59e0b" />
              <Bar yAxisId="l" dataKey="missed"    name="Missed"    stackId="a" fill="#ef4444" />
              <Line yAxisId="r" type="monotone" dataKey="connectionRate" name="Connect Rate" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Day-of-week pattern + detailed table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard
          title="Day-of-Week Pattern"
          subtitle="Average calls per weekday across the window"
          question="Which weekdays are reliably high vs low?"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dowAgg}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#c4b5fd', fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: '#fbbf24', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                  formatter={(v, name) => (name === 'Connect Rate' ? `${(Number(v) * 100).toFixed(1)}%` : fmtInt(Number(v)))} />
                <Bar yAxisId="l" dataKey="avgCalls" name="Avg Calls" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="connectionRate" name="Connect Rate" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="xl:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
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
