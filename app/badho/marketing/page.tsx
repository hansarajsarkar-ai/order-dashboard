'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────────────
type Granularity = 'day' | 'week' | 'month';
type Tab = 'acquisition' | 'campaigns' | 'conversion' | 'geography' | 'whatsapp' | 'spend';

interface TrendPoint { bucket: string; installs: number }
interface TrendSummary { totalInstalls: number; avg: number; peak: number; peakBucket: string | null }
interface ChannelRow { channel: string; installs: number }
interface CampaignRow { campaign: string; platform: string; objective: string; installs: number }
interface CreativeRow { campaign: string; adgroup: string; placement: string; installs: number }
interface WaRow { campaign: string; sessions: number }
interface ConvRow { group: string; buyers: number; ordered: number; convPct: number; gmv: number; avgDays: number }
interface ConvResp { data: ConvRow[]; by: string; totals: { buyers: number; ordered: number; gmv: number; convPct: number } }
interface GeoRow { state: string; paid: number; other: number; total: number }
interface SignupChannel { channel: string; installs: number; signups: number; signupPct: number }
interface ObjRow { objective: string; installs: number }
interface SpendRow { campaign: string; spend: number; impressions: number; clicks: number }

// ─── Formatting helpers ──────────────────────────────────────────────────────
const fmtCompact = (n: number) => {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};
const fmtInt = (n: number) => n.toLocaleString('en-IN');
const fmtCur = (n: number) => `₹${fmtCompact(n)}`;
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

const fmtBucket = (s: string, gran: Granularity) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const dt = new Date(y, m - 1, d);
  if (gran === 'month') return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  if (gran === 'week') return `W/o ${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const RANGES = [
  { label: '7D', days: 7 }, { label: '14D', days: 14 }, { label: '30D', days: 30 },
  { label: '45D', days: 45 }, { label: '60D', days: 60 }, { label: '90D', days: 90 },
] as const;
const GRANULARITIES = [
  { label: 'Day', value: 'day' as const }, { label: 'Week', value: 'week' as const }, { label: 'Month', value: 'month' as const },
] as const;
const TABS: { value: Tab; label: string }[] = [
  { value: 'acquisition', label: 'Acquisition' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'geography', label: 'Geography' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'spend', label: 'Spend & ROI' },
];

const CHANNEL_COLORS: Record<string, string> = {
  'Paid (Meta)': '#d946ef', 'Organic (Play Store)': '#34d399', 'WhatsApp': '#22c55e', 'Other': '#f59e0b', 'Unknown': '#94a3b8',
};
const channelColor = (c: string) => CHANNEL_COLORS[c] || '#a78bfa';
const PLATFORM_TONE: Record<string, string> = {
  instagram: 'bg-pink-500/20 text-pink-200 border-pink-400/30',
  facebook: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  audience_network: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
};
const platformTone = (p: string) => PLATFORM_TONE[p] || 'bg-white/10 text-purple-200 border-white/15';
const convTone = (v: number) => (v >= 3 ? 'text-emerald-300' : v >= 1.5 ? 'text-amber-300' : 'text-rose-300');

function KPICard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const tones: Record<string, string> = {
    fuchsia: 'from-fuchsia-500/20 to-fuchsia-600/5 border-fuchsia-400/30 text-fuchsia-200',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-400/30 text-purple-200',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-400/30 text-emerald-200',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-400/30 text-amber-200',
    sky: 'from-sky-500/20 to-sky-600/5 border-sky-400/30 text-sky-200',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${tones[tone] || tones.purple}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-70">{sub}</div>
    </div>
  );
}

function Panel({ title, desc, right, children }: { title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {desc && <p className="text-xs text-purple-300/70 mt-0.5">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const State = ({ kind, msg }: { kind: 'loading' | 'error' | 'empty'; msg: string }) => (
  <div className={`h-48 flex items-center justify-center text-sm ${kind === 'error' ? 'text-rose-300' : kind === 'empty' ? 'text-purple-300/70' : 'text-purple-300'}`}>
    {kind === 'error' ? `Error: ${msg}` : msg}
  </div>
);

// Generic fetch hook for the GET endpoints; only fires when `enabled`.
function useApi<T>(url: string | null, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !url) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(url)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Failed to load'); return j as T; })
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, enabled]);
  return { data, loading, error };
}

export default function MarketingDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [tab, setTab] = useState<Tab>('acquisition');
  const [days, setDays] = useState<number>(30);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [convBy, setConvBy] = useState<'channel' | 'campaign'>('channel');
  const windowSub = `last ${days} days`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  // Tab-gated fetches.
  const trend = useApi<{ data: TrendPoint[]; summary: TrendSummary }>(`/api/marketing/installs-trend?days=${days}&granularity=${granularity}`, authChecked && tab === 'acquisition');
  const channels = useApi<{ data: ChannelRow[]; total: number }>(`/api/marketing/channel-mix?days=${days}`, authChecked && tab === 'acquisition');
  const signup = useApi<{ channels: SignupChannel[]; objectives: ObjRow[]; objectivesTotal: number }>(`/api/marketing/signup-funnel?days=${days}`, authChecked && (tab === 'acquisition' || tab === 'campaigns'));
  const campaigns = useApi<{ data: CampaignRow[]; total: number }>(`/api/marketing/campaigns?days=${days}`, authChecked && (tab === 'campaigns' || tab === 'spend'));
  const creatives = useApi<{ data: CreativeRow[]; total: number }>(`/api/marketing/creatives?days=${days}`, authChecked && tab === 'campaigns');
  const conv = useApi<ConvResp>(`/api/marketing/conversion?days=${days}&by=${convBy}`, authChecked && tab === 'conversion');
  const convCamp = useApi<ConvResp>(`/api/marketing/conversion?days=${days}&by=campaign`, authChecked && tab === 'spend');
  const geo = useApi<{ data: GeoRow[]; total: number }>(`/api/marketing/geography?days=${days}`, authChecked && tab === 'geography');
  const whatsapp = useApi<{ data: WaRow[]; total: number }>(`/api/marketing/whatsapp-campaigns?days=${days}`, authChecked && tab === 'whatsapp');
  const spend = useApi<{ configured: boolean; message?: string; data?: SpendRow[]; totalSpend?: number; currency?: string; error?: string }>(`/api/marketing/spend?days=${days}`, authChecked && tab === 'spend');

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    ['authToken', 'employeeId', 'employeeName', 'employeeEmail'].forEach((k) => localStorage.removeItem(k));
    router.replace('/login');
  };

  // Installs trend chart + 7-point moving average.
  const chartData = useMemo(() => {
    const rows = trend.data?.data || [];
    return rows.map((r, i) => {
      const win = rows.slice(Math.max(0, i - 6), i + 1);
      return { ...r, label: fmtBucket(r.bucket, granularity), ma: Math.round(win.reduce((a, b) => a + b.installs, 0) / win.length) };
    });
  }, [trend.data, granularity]);
  const showLabels = chartData.length <= 31;
  const summary = trend.data?.summary;
  const paidShare = channels.data ? pct(channels.data.data.find((c) => c.channel === 'Paid (Meta)')?.installs || 0, channels.data.total) : 0;

  // Spend & ROI join: spend (Meta API) ⋈ installs (campaigns) ⋈ GMV+orders (conversion by campaign), keyed on campaign_name.
  const roi = useMemo(() => {
    if (!spend.data?.configured || !spend.data.data) return null;
    const inst = new Map((campaigns.data?.data || []).reduce((m: [string, number][], r) => {
      const cur = m.find((x) => x[0] === r.campaign); if (cur) cur[1] += r.installs; else m.push([r.campaign, r.installs]); return m;
    }, []));
    const convMap = new Map((convCamp.data?.data || []).map((r) => [r.group, r] as const));
    return spend.data.data
      .map((s) => {
        const installs = inst.get(s.campaign) || 0;
        const c = convMap.get(s.campaign);
        const gmv = c?.gmv || 0; const ordered = c?.ordered || 0;
        return { campaign: s.campaign, spend: s.spend, installs, ordered, gmv,
          cpi: installs ? s.spend / installs : 0, cac: ordered ? s.spend / ordered : 0, roas: s.spend ? gmv / s.spend : 0 };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [spend.data, campaigns.data, convCamp.data]);

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

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/badho" className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">← All dashboards</Link>
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

        {/* Header + range toggle */}
        <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">📣 Marketing Dashboard</h1>
            <p className="text-purple-200 text-sm mt-1">User acquisition &amp; attribution — installs, channels, campaigns, conversion to orders, geography, and ad ROI.</p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${days === r.days ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]' : 'text-purple-200 hover:bg-white/10'}`}>{r.label}</button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit flex-wrap">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === t.value ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]' : 'text-purple-200 hover:bg-white/10'}`}>{t.label}</button>
          ))}
        </div>

        {/* ══ ACQUISITION ══════════════════════════════════════════════════ */}
        {tab === 'acquisition' && (
          <div className="space-y-6">
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Total Installs" value={fmtInt(summary.totalInstalls)} sub={windowSub} tone="fuchsia" />
                <KPICard label="Avg Installs / Day" value={fmtInt(summary.avg)} sub="first sessions / day" tone="purple" />
                <KPICard label="Peak Day" value={fmtInt(summary.peak)} sub={summary.peakBucket ? fmtBucket(summary.peakBucket, 'day') : '—'} tone="emerald" />
                <KPICard label="Paid (Meta) Share" value={`${paidShare.toFixed(1)}%`} sub="of installs" tone="sky" />
              </div>
            )}

            <Panel title="Installs Trend" desc={`New buyer installs per ${granularity}, with a 7-${granularity} moving average.`}
              right={<div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">{GRANULARITIES.map((g) => (<button key={g.value} onClick={() => setGranularity(g.value)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${granularity === g.value ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.45)]' : 'text-purple-200 hover:bg-white/10'}`}>{g.label}</button>))}</div>}>
              {trend.loading ? <State kind="loading" msg="Loading trend…" /> : trend.error ? <State kind="error" msg={trend.error} /> : chartData.length === 0 ? <State kind="empty" msg="No data for this window." /> : (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="installsBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d946ef" stopOpacity={0.9} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0.5} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                      <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }} contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }} labelStyle={{ color: '#e9d5ff', fontWeight: 600, marginBottom: 2 }} formatter={(v, name) => [v == null ? '—' : fmtInt(Number(v)), String(name)]} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                      <Bar dataKey="installs" name="Installs" fill="url(#installsBar)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                        {showLabels && <LabelList dataKey="installs" position="top" offset={6} fill="#f0abfc" fontSize={9} fontWeight={600} formatter={(v: any) => (v == null ? '' : fmtCompact(Number(v)))} />}
                      </Bar>
                      <Line type="monotone" dataKey="ma" name="7-pt Moving Avg" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Channel Mix" desc={`Where installs came from over the ${windowSub}.`}>
              {channels.loading ? <State kind="loading" msg="Loading channels…" /> : channels.error ? <State kind="error" msg={channels.error} /> : !channels.data || channels.data.data.length === 0 ? <State kind="empty" msg="No data." /> : (
                <div className="space-y-3">
                  {channels.data.data.map((c) => {
                    const share = pct(c.installs, channels.data!.total);
                    return (
                      <div key={c.channel} className="flex items-center gap-3">
                        <div className="w-36 shrink-0 text-sm text-purple-100 font-medium flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: channelColor(c.channel) }} />{c.channel}</div>
                        <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden"><div className="h-full rounded-lg flex items-center justify-end pr-2 text-[10px] font-bold text-white/90" style={{ width: `${Math.max(share, 3)}%`, background: channelColor(c.channel) }}>{share >= 8 ? `${share.toFixed(1)}%` : ''}</div></div>
                        <div className="w-28 shrink-0 text-right text-sm tabular-nums"><span className="text-white font-semibold">{fmtInt(c.installs)}</span><span className="text-purple-300/60 text-xs ml-1">{share.toFixed(1)}%</span></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Install → Signup Rate by Channel" desc="Share of installs that completed signup in their first session.">
              {signup.loading ? <State kind="loading" msg="Loading signup funnel…" /> : signup.error ? <State kind="error" msg={signup.error} /> : !signup.data ? <State kind="empty" msg="No data." /> : (
                <div className="space-y-3">
                  {signup.data.channels.map((c) => (
                    <div key={c.channel} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-sm text-purple-100 font-medium flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: channelColor(c.channel) }} />{c.channel}</div>
                      <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden"><div className="h-full rounded-lg flex items-center justify-end pr-2 text-[10px] font-bold text-white/90" style={{ width: `${Math.max(c.signupPct, 3)}%`, background: channelColor(c.channel) }}>{c.signupPct >= 12 ? `${c.signupPct.toFixed(0)}%` : ''}</div></div>
                      <div className="w-44 shrink-0 text-right text-sm tabular-nums"><span className="text-white font-semibold">{c.signupPct.toFixed(1)}%</span><span className="text-purple-300/60 text-xs ml-1">{fmtInt(c.signups)} / {fmtInt(c.installs)}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ══ CAMPAIGNS ════════════════════════════════════════════════════ */}
        {tab === 'campaigns' && (
          <div className="space-y-6">
            <Panel title="Ad Objective Split" desc="Meta installs by campaign objective — pure install vs engagement vs sales campaigns.">
              {signup.loading ? <State kind="loading" msg="Loading…" /> : signup.error ? <State kind="error" msg={signup.error} /> : !signup.data ? <State kind="empty" msg="No data." /> : (
                <div className="space-y-3">
                  {signup.data.objectives.map((o) => {
                    const share = pct(o.installs, signup.data!.objectivesTotal);
                    return (
                      <div key={o.objective} className="flex items-center gap-3">
                        <div className="w-44 shrink-0 text-sm text-purple-100 font-medium">{o.objective}</div>
                        <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden"><div className="h-full rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-600" style={{ width: `${Math.max(share, 2)}%` }} /></div>
                        <div className="w-28 shrink-0 text-right text-sm tabular-nums"><span className="text-white font-semibold">{fmtInt(o.installs)}</span><span className="text-purple-300/60 text-xs ml-1">{share.toFixed(1)}%</span></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Meta Campaign Performance" desc={`Installs per Facebook/Instagram campaign × platform, over the ${windowSub}.`}>
              {campaigns.loading ? <State kind="loading" msg="Loading campaigns…" /> : campaigns.error ? <State kind="error" msg={campaigns.error} /> : !campaigns.data || campaigns.data.data.length === 0 ? <State kind="empty" msg="No paid campaigns." /> : (
                <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">Campaign</th><th className="px-4 py-3 font-semibold">Platform</th><th className="px-4 py-3 font-semibold">Objective</th><th className="px-4 py-3 font-semibold text-right">Installs</th><th className="px-4 py-3 font-semibold text-right">% of Paid</th></tr></thead>
                    <tbody>
                      {campaigns.data.data.map((r, i) => (
                        <tr key={`${r.campaign}-${r.platform}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                          <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium max-w-md truncate" title={r.campaign}>{r.campaign}</td>
                          <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${platformTone(r.platform)}`}>{r.platform}</span></td>
                          <td className="px-4 py-2.5 text-purple-300/80 text-xs whitespace-nowrap">{r.objective}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.installs)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{pct(r.installs, campaigns.data!.total).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15"><tr><td className="px-4 py-3" colSpan={4}>Total ({campaigns.data.data.length} rows)</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(campaigns.data.total)}</td><td className="px-4 py-3 text-right tabular-nums">100%</td></tr></tfoot>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Creative / Adgroup Drill" desc="Campaign → adgroup → placement, to spot winning creatives and placements.">
              {creatives.loading ? <State kind="loading" msg="Loading creatives…" /> : creatives.error ? <State kind="error" msg={creatives.error} /> : !creatives.data || creatives.data.data.length === 0 ? <State kind="empty" msg="No creative data." /> : (
                <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">Campaign</th><th className="px-4 py-3 font-semibold">Adgroup (creative)</th><th className="px-4 py-3 font-semibold">Placement</th><th className="px-4 py-3 font-semibold text-right">Installs</th></tr></thead>
                    <tbody>
                      {creatives.data.data.map((r, i) => (
                        <tr key={`${r.adgroup}-${r.placement}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                          <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5 text-purple-300/80 text-xs max-w-[16rem] truncate" title={r.campaign}>{r.campaign}</td>
                          <td className="px-4 py-2.5 font-medium max-w-[16rem] truncate" title={r.adgroup}>{r.adgroup}</td>
                          <td className="px-4 py-2.5 text-purple-200 text-xs whitespace-nowrap">{r.placement}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.installs)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15"><tr><td className="px-4 py-3" colSpan={4}>Total ({creatives.data.data.length} rows)</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(creatives.data.total)}</td></tr></tfoot>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* ══ CONVERSION ═══════════════════════════════════════════════════ */}
        {tab === 'conversion' && (
          <div className="space-y-6">
            {conv.data?.totals && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Acquired Buyers" value={fmtInt(conv.data.totals.buyers)} sub={windowSub} tone="fuchsia" />
                <KPICard label="Placed an Order" value={fmtInt(conv.data.totals.ordered)} sub="since install" tone="emerald" />
                <KPICard label="Install → Order" value={`${conv.data.totals.convPct.toFixed(2)}%`} sub="conversion" tone="amber" />
                <KPICard label="GMV from Cohort" value={fmtCur(conv.data.totals.gmv)} sub="orders post-install" tone="sky" />
              </div>
            )}
            <Panel title="Install → Order Conversion" desc="Of buyers acquired in the window, how many placed a real order, the GMV they generated, and how long it took."
              right={<div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">{(['channel', 'campaign'] as const).map((b) => (<button key={b} onClick={() => setConvBy(b)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${convBy === b ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.45)]' : 'text-purple-200 hover:bg-white/10'}`}>By {b}</button>))}</div>}>
              {conv.loading ? <State kind="loading" msg="Crunching cohort (joins orders, ~a few seconds)…" /> : conv.error ? <State kind="error" msg={conv.error} /> : !conv.data || conv.data.data.length === 0 ? <State kind="empty" msg="No data." /> : (
                <div className="overflow-x-auto max-h-[34rem] overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">{convBy === 'channel' ? 'Channel' : 'Campaign'}</th><th className="px-4 py-3 font-semibold text-right">Installs</th><th className="px-4 py-3 font-semibold text-right">Ordered</th><th className="px-4 py-3 font-semibold text-right">Conv %</th><th className="px-4 py-3 font-semibold text-right">GMV</th><th className="px-4 py-3 font-semibold text-right">Avg Days→Order</th></tr></thead>
                    <tbody>
                      {conv.data.data.map((r, i) => (
                        <tr key={`${r.group}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                          <td className="px-4 py-2.5 font-medium max-w-md truncate" title={r.group}>{r.group}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.buyers)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.ordered)}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${convTone(r.convPct)}`}>{r.convPct.toFixed(2)}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtCur(r.gmv)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{r.avgDays ? `${r.avgDays.toFixed(1)}d` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {conv.data.totals && (<tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15"><tr><td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(conv.data.totals.buyers)}</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(conv.data.totals.ordered)}</td><td className="px-4 py-3 text-right tabular-nums">{conv.data.totals.convPct.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular-nums">{fmtCur(conv.data.totals.gmv)}</td><td className="px-4 py-3 text-right tabular-nums">—</td></tr></tfoot>)}
                  </table>
                </div>
              )}
            </Panel>
            <p className="text-[11px] text-purple-300/50">Conversion = acquired buyer placed ≥1 non-DRAFT order at/after install. GMV is the net order amount. Conversion rises as a cohort matures, so recent-install windows understate it — compare equal windows. Orders joined from <code className="text-purple-200">purchaseOrder.purchaseOrder</code> on <code className="text-purple-200">buyerId</code>.</p>
          </div>
        )}

        {/* ══ GEOGRAPHY ════════════════════════════════════════════════════ */}
        {tab === 'geography' && (
          <Panel title="Installs by State" desc={`Where new users are installing from, Paid vs other, over the ${windowSub}. ~1/3 of installs have no state set.`}>
            {geo.loading ? <State kind="loading" msg="Loading geography…" /> : geo.error ? <State kind="error" msg={geo.error} /> : !geo.data || geo.data.data.length === 0 ? <State kind="empty" msg="No data." /> : (
              <div className="overflow-x-auto max-h-[40rem] overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">State</th><th className="px-4 py-3 font-semibold">Share</th><th className="px-4 py-3 font-semibold text-right">Paid</th><th className="px-4 py-3 font-semibold text-right">Other</th><th className="px-4 py-3 font-semibold text-right">Total</th><th className="px-4 py-3 font-semibold text-right">% of Installs</th></tr></thead>
                  <tbody>
                    {geo.data.data.map((r, i) => {
                      const share = pct(r.total, geo.data!.total);
                      return (
                        <tr key={r.state} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                          <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.state}</td>
                          <td className="px-4 py-2.5 w-40"><div className="h-3 rounded bg-white/5 overflow-hidden"><div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600" style={{ width: `${Math.max(share, 1)}%` }} /></div></td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-fuchsia-200">{fmtInt(r.paid)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-purple-300/80">{fmtInt(r.other)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.total)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15"><tr><td className="px-4 py-3" colSpan={5}>Total</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(geo.data.total)}</td><td className="px-4 py-3 text-right tabular-nums">100%</td></tr></tfoot>
                </table>
              </div>
            )}
          </Panel>
        )}

        {/* ══ WHATSAPP ═════════════════════════════════════════════════════ */}
        {tab === 'whatsapp' && (
          <Panel title="WhatsApp Messaging Campaigns" desc={`New buyer installs attributed to WhatsApp deeplinks, by utm_campaign, over the ${windowSub}.`}>
            {whatsapp.loading ? <State kind="loading" msg="Loading WhatsApp campaigns…" /> : whatsapp.error ? <State kind="error" msg={whatsapp.error} /> : !whatsapp.data || whatsapp.data.data.length === 0 ? <State kind="empty" msg="No WhatsApp sessions." /> : (
              <div className="overflow-x-auto max-h-[34rem] overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gradient-to-r from-emerald-600/90 to-green-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">#</th><th className="px-4 py-3 font-semibold">utm_campaign</th><th className="px-4 py-3 font-semibold text-right">Sessions</th><th className="px-4 py-3 font-semibold text-right">% of WhatsApp</th></tr></thead>
                  <tbody>
                    {whatsapp.data.data.map((r, i) => (
                      <tr key={`${r.campaign}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                        <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{r.campaign}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.sessions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{pct(r.sessions, whatsapp.data!.total).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15"><tr><td className="px-4 py-3" colSpan={2}>Total ({whatsapp.data.data.length})</td><td className="px-4 py-3 text-right tabular-nums">{fmtInt(whatsapp.data.total)}</td><td className="px-4 py-3 text-right tabular-nums">100%</td></tr></tfoot>
                </table>
              </div>
            )}
          </Panel>
        )}

        {/* ══ SPEND & ROI ══════════════════════════════════════════════════ */}
        {tab === 'spend' && (
          <Panel title="Spend, CAC & ROAS by Campaign" desc="Meta ad spend joined with installs and order GMV (matched on campaign name).">
            {spend.loading ? <State kind="loading" msg="Loading spend…" /> : spend.error ? <State kind="error" msg={spend.error} /> : spend.data && !spend.data.configured ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-6 text-sm text-amber-100/90 space-y-3">
                <div className="font-semibold text-amber-200">Meta spend not connected yet</div>
                <p>To unlock <b>Cost-Per-Install</b>, <b>CAC</b> and <b>ROAS</b>, add two environment variables (Vercel → Settings → Environment Variables, and your local <code className="text-amber-200">.env</code>):</p>
                <ul className="list-disc list-inside space-y-1 text-amber-100/80">
                  <li><code className="text-amber-200">META_ACCESS_TOKEN</code> — a long-lived token with <code>ads_read</code> on the ad account</li>
                  <li><code className="text-amber-200">META_AD_ACCOUNT_ID</code> — the numeric ad-account id (e.g. <code>575140071548312</code>)</li>
                </ul>
                <p className="text-amber-100/70">Once set, this tab pulls spend per campaign from the Meta Marketing API and computes CPI / CAC / ROAS against the installs &amp; GMV already on this dashboard. Campaign names already match (e.g. <code className="text-amber-200">AppOtp_Socialmedia/Influencer/Performing_creatives_4may</code>).</p>
              </div>
            ) : !roi ? <State kind="empty" msg="No spend rows." /> : (
              <div className="overflow-x-auto max-h-[34rem] overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white"><tr className="text-left"><th className="px-4 py-3 font-semibold">Campaign</th><th className="px-4 py-3 font-semibold text-right">Spend</th><th className="px-4 py-3 font-semibold text-right">Installs</th><th className="px-4 py-3 font-semibold text-right">CPI</th><th className="px-4 py-3 font-semibold text-right">Ordered</th><th className="px-4 py-3 font-semibold text-right">CAC</th><th className="px-4 py-3 font-semibold text-right">GMV</th><th className="px-4 py-3 font-semibold text-right">ROAS</th></tr></thead>
                  <tbody>
                    {roi.map((r, i) => (
                      <tr key={`${r.campaign}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                        <td className="px-4 py-2.5 font-medium max-w-md truncate" title={r.campaign}>{r.campaign}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtCur(r.spend)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.installs)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.cpi ? `₹${r.cpi.toFixed(1)}` : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.ordered)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.cac ? `₹${fmtCompact(r.cac)}` : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtCur(r.gmv)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.roas >= 1 ? 'text-emerald-300' : 'text-rose-300'}`}>{r.roas ? `${r.roas.toFixed(2)}×` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        <p className="text-[11px] text-purple-300/50 mt-6">
          Cohort (all panels): <code className="text-purple-200">history.session</code> where <code className="text-purple-200">userType=buyer</code>, <code className="text-purple-200">appUsed=buyer-app</code>, <code className="text-purple-200">isFirstSession=true</code>, <code className="text-purple-200">isMasterLogin=false</code>, <code className="text-purple-200">isTest=false</code> — i.e. genuine new-buyer installs. Conversion joins <code className="text-purple-200">purchaseOrder.purchaseOrder</code> on buyerId; channel/campaign parsed from <code className="text-purple-200">installReferrer</code>. All panels respect the date range above.
        </p>
      </div>

      <style jsx>{`.animation-delay-2000 { animation-delay: 2s; }`}</style>
    </div>
  );
}
