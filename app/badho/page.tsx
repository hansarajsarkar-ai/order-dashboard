'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  BADHO DASHBOARDS — index page
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Folder layout convention:
 *
 *    app/
 *      page.tsx                       → redirect to /badho
 *      login/page.tsx                 → shared auth (success → /badho)
 *      api/<dashboard-slug>/...       → dashboard-specific API routes
 *      badho/
 *        page.tsx                     → this file (the index)
 *        _template/                   → starter scaffold for new dashboards
 *                                       (the leading _ keeps it un-routed)
 *        <dashboard-slug>/
 *          page.tsx                   → the dashboard page
 *          components/                → components only this dashboard uses
 *
 *  To add a new dashboard:
 *    1. cp -r app/badho/_template app/badho/<your-slug>
 *    2. Build the dashboard in app/badho/<your-slug>/page.tsx
 *    3. Add an entry to the DASHBOARDS array below
 *    4. (optional) put dashboard-only APIs at app/api/<your-slug>/...
 *
 *  The slug here MUST match the folder name. The card on this index
 *  links to /badho/<slug>.
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DashboardEntry {
  slug: string;
  title: string;
  description: string;
  icon: string;
  status: 'live' | 'coming-soon';
  // When set, the card links to this external URL instead of /badho/<slug>.
  href?: string;
}

const DASHBOARDS: DashboardEntry[] = [
  {
    slug: 'order-dashboard',
    title: 'Order Dashboard',
    description:
      'GMV goal, monthly / weekly / daily breakdown by status, seller-wise pivots, geography map, and buyer cohorts.',
    icon: '📊',
    status: 'live',
  },
  {
    slug: 'brand-performance',
    title: 'Brand Performance Dashboard',
    description:
      'Brand-level visibility — live vs inactive brand mappings, GMV per brand, coverage, and seller→brand catalog health.',
    icon: '🏷️',
    status: 'live',
  },
  {
    slug: 'refund-order-amount',
    title: 'Refund Order Dashboard',
    description:
      'Track and analyze refund order amounts, refund trends, and refund metrics by seller, brand, and time period.',
    icon: '💰',
    status: 'live',
  },
  {
    slug: 'scheme-1-rs-price-change',
    title: 'Scheme 1 Rs Price Change',
    description:
      'Monitor price changes for Scheme 1 products, track pricing trends, analyze impact on sales, and manage price adjustments.',
    icon: '📈',
    status: 'live',
  },
  {
    slug: 'margin-and-growth',
    title: 'GROWTH report',
    description:
      'Daily Active Buyers trend — distinct buyers opening a buyer-app session each day, with peak / average and a 7-day moving average.',
    icon: '🚀',
    status: 'live',
  },
  {
    slug: 'drop-funnel',
    title: 'Buyer Funnel',
    description:
      'Buyer-app acquisition → engagement → order funnel: OTP success, home → ATC → cart → MOV → address → order conversions, new vs returning, DAU → orders, and seller page views.',
    icon: '🪜',
    status: 'live',
  },
  {
    slug: 'calling-team',
    title: 'Calling Team Dashboard',
    description:
      'Calling team activity and outcomes — calls made, connect rate, talk time, conversions per agent, and daily / weekly productivity trends.',
    icon: '📞',
    status: 'live',
  },
  {
    slug: 'kapila',
    title: 'Kapila Dashboard',
    description:
      'Kapila brand — PO count and amount pivoted by order status × date, with date-range filter and KPI summary.',
    icon: '🐄',
    status: 'live',
  },
  {
    slug: 'order-journey',
    title: 'Order Journey',
    description:
      'Track the whole lifecycle of a D2R order, PO Number-wise — every milestone from placed → accepted → dispatched → delivered → completed, with timestamps and time spent in each stage.',
    icon: '🧭',
    // Locked on the index (shows "Coming soon", non-clickable) so other employees
    // don't open it. The /badho/order-journey route stays live — reach it by direct URL.
    status: 'coming-soon',
  },
  {
    slug: 'po-modified',
    title: 'PO Modified',
    description:
      'Orders where a seller removed an item or decreased its quantity due to unavailability — before/after PO amount, value lost, and per-PO detail.',
    icon: '📝',
    status: 'live',
  },
  {
    slug: 'order-rejected-cancelled',
    title: 'Order Rejected/Cancelled',
    description:
      'Rejected and cancelled orders — counts, amounts, reason breakdown, and per-order detail across sellers and time.',
    icon: '🚫',
    status: 'live',
  },
  {
    slug: 'badho-daas-dashboard',
    title: 'Badho Daas Dashboard',
    description:
      'Delivery-as-a-Service operations — opens the standalone Badho Daas dashboard in a new tab.',
    icon: '🚚',
    status: 'live',
    href: 'https://badho-daas-dashboard.vercel.app/',
  },
  {
    slug: 'p-and-l',
    title: 'P & L',
    description:
      'Profit & loss overview — revenue, costs, margins, and net P&L across sellers, brands, and time periods.',
    icon: '📒',
    status: 'live',
  },
  {
    slug: 'qps-scheme',
    title: 'QPS Dashboard',
    description:
      'Quantity Purchase Scheme — monthly qualified buyer trend, new vs returning breakdown, level-wise gift winners (Tortoise / Fan / Speaker), and current-month alert counts.',
    icon: '🎁',
    status: 'live',
  },
  {
    slug: 'marketing',
    title: 'Marketing Dashboard',
    description:
      'Marketing analytics — campaign performance, acquisition, engagement and spend metrics across channels and time.',
    icon: '📣',
    status: 'live',
  },
  // Add new dashboards here. Each one is a folder under app/badho/<slug>/.
];

export default function BadhoIndex() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [search, setSearch] = useState('');

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
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

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
        <div className="mb-10 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Badho Dashboards
            </h1>
            <p className="text-purple-200 text-sm mt-1">All your business analytics in one place</p>
          </div>
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
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-[480px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dashboards by name or description…"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60 text-sm">⌕</span>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded text-purple-300/70 hover:text-white hover:bg-white/10"
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {search && (() => {
            const q = search.trim().toLowerCase();
            const n = DASHBOARDS.filter((d) =>
              d.title.toLowerCase().includes(q) ||
              d.description.toLowerCase().includes(q) ||
              d.slug.toLowerCase().includes(q)
            ).length;
            return (
              <span className="text-xs font-semibold text-purple-200/80">
                <span className="text-fuchsia-300">{n}</span> of {DASHBOARDS.length} matching
              </span>
            );
          })()}
        </div>

        {/* Dashboard grid */}
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = q
            ? DASHBOARDS.filter((d) =>
                d.title.toLowerCase().includes(q) ||
                d.description.toLowerCase().includes(q) ||
                d.slug.toLowerCase().includes(q)
              )
            : DASHBOARDS;
          if (filtered.length === 0) {
            return (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-10 text-center">
                <div className="text-4xl mb-3 opacity-60">⌕</div>
                <div className="text-purple-100 font-semibold mb-1">No dashboards match &ldquo;{search}&rdquo;</div>
                <div className="text-purple-300/70 text-xs">Try a different keyword, or <button onClick={() => setSearch('')} className="underline hover:text-fuchsia-300">clear the search</button>.</div>
              </div>
            );
          }
          return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((d) => {
            const isLive = d.status === 'live';
            const cardClass = isLive
              ? 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)] hover:-translate-y-1 cursor-pointer'
              : 'bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-2xl p-6 opacity-60 cursor-not-allowed';
            const inner = (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500/40 to-purple-600/40 border border-fuchsia-400/30 flex items-center justify-center text-3xl shadow-[0_0_24px_rgba(217,70,239,0.3)]">
                    {d.icon}
                  </div>
                  {!isLive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                      Coming soon
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{d.title}</h2>
                <p className="text-sm text-purple-200/80 leading-relaxed">{d.description}</p>
                {isLive && (
                  <div className="mt-4 text-xs font-semibold text-fuchsia-300 flex items-center gap-1">
                    Open dashboard
                    <span aria-hidden>→</span>
                  </div>
                )}
              </>
            );
            return isLive && d.href ? (
              <a key={d.slug} href={d.href} target="_blank" rel="noopener noreferrer" className={cardClass}>
                {inner}
              </a>
            ) : isLive ? (
              <Link key={d.slug} href={`/badho/${d.slug}`} className={cardClass}>
                {inner}
              </Link>
            ) : (
              <div key={d.slug} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </div>
          );
        })()}

        <div className="mt-12 text-center text-purple-300/50 text-xs">
          Want to add a new dashboard? Drop a route at <code className="text-purple-200">app/badho/&lt;slug&gt;/page.tsx</code> and add it to the list.
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
