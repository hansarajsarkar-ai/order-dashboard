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

interface TrendPoint { bucket: string; installs: number; sessions: number }
interface TrendSummary {
  totalInstalls: number; totalSessions: number; avg: number;
  peak: number; peakBucket: string | null; granularity: Granularity; windowDays: number;
}
interface ChannelRow { channel: string; installs: number }
interface CampaignRow { campaign: string; platform: string; objective: string; installs: number }
interface WaRow { campaign: string; sessions: number }

// ─── Formatting helpers ──────────────────────────────────────────────────────
const fmtCompact = (n: number) => {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};
const fmtInt = (n: number) => n.toLocaleString('en-IN');
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
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
] as const;

const GRANULARITIES = [
  { label: 'Day', value: 'day' as const },
  { label: 'Week', value: 'week' as const },
  { label: 'Month', value: 'month' as const },
] as const;

// Channel → colour (bar + chip). Keep keys in sync with the API CHANNEL_CASE.
const CHANNEL_COLORS: Record<string, string> = {
  'Paid (Meta)': '#d946ef',
  'Organic (Play Store)': '#34d399',
  'WhatsApp': '#22c55e',
  'Other': '#f59e0b',
  'Unknown': '#94a3b8',
};
const channelColor = (c: string) => CHANNEL_COLORS[c] || '#a78bfa';

const PLATFORM_TONE: Record<string, string> = {
  instagram: 'bg-pink-500/20 text-pink-200 border-pink-400/30',
  facebook: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  audience_network: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
};
const platformTone = (p: string) => PLATFORM_TONE[p] || 'bg-white/10 text-purple-200 border-white/15';

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

// Generic fetch hook for the simple GET endpoints.
function useApi<T>(url: string | null, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load');
        return json as T;
      })
      .then((json) => { if (!cancelled) setData(json); })
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

  const [days, setDays] = useState<number>(30);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const windowSub = `last ${days} days`;

  // Client-side auth gate — every dashboard does this.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const trend = useApi<{ data: TrendPoint[]; summary: TrendSummary }>(
    `/api/marketing/installs-trend?days=${days}&granularity=${granularity}`, authChecked);
  const channels = useApi<{ data: ChannelRow[]; total: number }>(
    `/api/marketing/channel-mix?days=${days}`, authChecked);
  const campaigns = useApi<{ data: CampaignRow[]; total: number }>(
    `/api/marketing/campaigns?days=${days}`, authChecked);
  const whatsapp = useApi<{ data: WaRow[]; total: number }>(
    `/api/marketing/whatsapp-campaigns?days=${days}`, authChecked);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  // Trend chart data + 7-point moving average of installs.
  const chartData = useMemo(() => {
    const rows = trend.data?.data || [];
    return rows.map((r, i) => {
      const from = Math.max(0, i - 6);
      const win = rows.slice(from, i + 1);
      const ma = Math.round(win.reduce((a, b) => a + b.installs, 0) / win.length);
      return { ...r, label: fmtBucket(r.bucket, granularity), ma };
    });
  }, [trend.data, granularity]);

  const showLabels = chartData.length <= 31;
  const summary = trend.data?.summary;
  const paidShare = channels.data
    ? pct(channels.data.data.find((c) => c.channel === 'Paid (Meta)')?.installs || 0, channels.data.total)
    : 0;

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

        {/* Header + range toggle */}
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
              📣 Marketing Dashboard
            </h1>
            <p className="text-purple-200 text-sm mt-1">
              User acquisition &amp; attribution from app sessions — installs, channel mix, and campaign performance.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  days === r.days
                    ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]'
                    : 'text-purple-200 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KPICard label="Total Installs" value={fmtInt(summary.totalInstalls)} sub={windowSub} tone="fuchsia" />
            <KPICard label="Avg Installs / Day" value={fmtInt(summary.avg)} sub="first sessions / day" tone="purple" />
            <KPICard
              label="Peak Day"
              value={fmtInt(summary.peak)}
              sub={summary.peakBucket ? fmtBucket(summary.peakBucket, 'day') : '—'}
              tone="emerald"
            />
            <KPICard label="Paid (Meta) Share" value={`${paidShare.toFixed(1)}%`} sub="of installs" tone="sky" />
          </div>
        )}

        {/* ── Section 1: Installs trend ─────────────────────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">Installs Trend</h2>
              <p className="text-xs text-purple-300/70 mt-0.5">
                New installs (first sessions) per {granularity}, with a 7-{granularity} moving average and total sessions.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
              {GRANULARITIES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    granularity === g.value
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.45)]'
                      : 'text-purple-200 hover:bg-white/10'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {trend.loading ? (
            <div className="h-96 flex items-center justify-center text-purple-300 text-sm">Loading trend…</div>
          ) : trend.error ? (
            <div className="h-96 flex items-center justify-center text-rose-300 text-sm">Error: {trend.error}</div>
          ) : chartData.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="installsBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d946ef" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis yAxisId="left" tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#7dd3fc', fontSize: 11 }} tickFormatter={fmtCompact} width={48} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                    labelStyle={{ color: '#e9d5ff', fontWeight: 600, marginBottom: 2 }}
                    formatter={(v, name) => [v == null ? '—' : fmtInt(Number(v)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#c4b5fd' }} />
                  <Bar yAxisId="left" dataKey="installs" name="Installs" fill="url(#installsBar)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    {showLabels && (
                      <LabelList dataKey="installs" position="top" offset={6} fill="#f0abfc" fontSize={9} fontWeight={600}
                        formatter={(v: any) => (v == null ? '' : fmtCompact(Number(v)))} />
                    )}
                  </Bar>
                  <Line yAxisId="left" type="monotone" dataKey="ma" name="7-pt Moving Avg" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="sessions" name="Total Sessions" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Section 2: Channel mix ────────────────────────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">Channel Mix</h2>
            <p className="text-xs text-purple-300/70 mt-0.5">Where installs came from over the {windowSub}.</p>
          </div>
          {channels.loading ? (
            <div className="h-40 flex items-center justify-center text-purple-300 text-sm">Loading channels…</div>
          ) : channels.error ? (
            <div className="h-40 flex items-center justify-center text-rose-300 text-sm">Error: {channels.error}</div>
          ) : !channels.data || channels.data.data.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-purple-300/70 text-sm">No data for this window.</div>
          ) : (
            <div className="space-y-3">
              {channels.data.data.map((c) => {
                const share = pct(c.installs, channels.data!.total);
                return (
                  <div key={c.channel} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-sm text-purple-100 font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: channelColor(c.channel) }} />
                      {c.channel}
                    </div>
                    <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden">
                      <div className="h-full rounded-lg flex items-center justify-end pr-2 text-[10px] font-bold text-white/90"
                        style={{ width: `${Math.max(share, 3)}%`, background: channelColor(c.channel) }}>
                        {share >= 8 ? `${share.toFixed(1)}%` : ''}
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right text-sm tabular-nums">
                      <span className="text-white font-semibold">{fmtInt(c.installs)}</span>
                      <span className="text-purple-300/60 text-xs ml-1">{share.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section 3: Meta campaign performance ──────────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">Meta Campaign Performance</h2>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Installs attributed to each Facebook/Instagram campaign × platform, over the {windowSub}.
              </p>
            </div>
          </div>
          {campaigns.loading ? (
            <div className="h-60 flex items-center justify-center text-purple-300 text-sm">Loading campaigns…</div>
          ) : campaigns.error ? (
            <div className="h-60 flex items-center justify-center text-rose-300 text-sm">Error: {campaigns.error}</div>
          ) : !campaigns.data || campaigns.data.data.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-purple-300/70 text-sm">No paid campaigns in this window.</div>
          ) : (
            <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-fuchsia-600/90 to-purple-700/90 backdrop-blur text-white">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Campaign</th>
                    <th className="px-4 py-3 font-semibold">Platform</th>
                    <th className="px-4 py-3 font-semibold">Objective</th>
                    <th className="px-4 py-3 font-semibold text-right">Installs</th>
                    <th className="px-4 py-3 font-semibold text-right">% of Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.data.data.map((r, i) => {
                    const share = pct(r.installs, campaigns.data!.total);
                    return (
                      <tr key={`${r.campaign}-${r.platform}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                        <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium max-w-md truncate" title={r.campaign}>{r.campaign}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${platformTone(r.platform)}`}>{r.platform}</span>
                        </td>
                        <td className="px-4 py-2.5 text-purple-300/80 text-xs whitespace-nowrap">{r.objective}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.installs)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>Total ({campaigns.data.data.length} campaigns)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(campaigns.data.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Section 4: WhatsApp campaigns ─────────────────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">WhatsApp Messaging Campaigns</h2>
            <p className="text-xs text-purple-300/70 mt-0.5">
              Sessions driven by WhatsApp deeplinks (mostly re-engagement), grouped by utm_campaign, over the {windowSub}.
            </p>
          </div>
          {whatsapp.loading ? (
            <div className="h-60 flex items-center justify-center text-purple-300 text-sm">Loading WhatsApp campaigns…</div>
          ) : whatsapp.error ? (
            <div className="h-60 flex items-center justify-center text-rose-300 text-sm">Error: {whatsapp.error}</div>
          ) : !whatsapp.data || whatsapp.data.data.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-purple-300/70 text-sm">No WhatsApp sessions in this window.</div>
          ) : (
            <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-emerald-600/90 to-green-700/90 backdrop-blur text-white">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">utm_campaign</th>
                    <th className="px-4 py-3 font-semibold text-right">Sessions</th>
                    <th className="px-4 py-3 font-semibold text-right">% of WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {whatsapp.data.data.map((r, i) => {
                    const share = pct(r.sessions, whatsapp.data!.total);
                    return (
                      <tr key={`${r.campaign}-${i}`} className={`text-purple-100 ${i % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10 transition-colors`}>
                        <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{r.campaign}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{fmtInt(r.sessions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-900/90 backdrop-blur text-white font-semibold border-t border-white/15">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>Total ({whatsapp.data.data.length} campaigns)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(whatsapp.data.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-purple-300/50 mt-6">
          Source: <code className="text-purple-200">history.session</code>. An &ldquo;install&rdquo; = a first session
          (<code className="text-purple-200">isFirstSession = true</code>); test sessions excluded. Channel &amp; campaign
          are parsed from the <code className="text-purple-200">installReferrer</code> field (Meta ad JSON, Play Store
          organic, or WhatsApp/utm deeplinks). WhatsApp counts all sessions (re-engagement), not just installs.
        </p>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
