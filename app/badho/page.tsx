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
}

const DASHBOARDS: DashboardEntry[] = [
  {
    slug: 'order-dashboard',
    title: 'Order Dashboard',
    description:
      'GMV goal, monthly / weekly / daily breakdown by status, seller-wise pivots, demography map, and buyer cohorts.',
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
    title: 'Refund Order Amount',
    description:
      'Track and analyze refund order amounts, refund trends, and refund metrics by seller, brand, and time period.',
    icon: '💰',
    status: 'live',
  },
  // Add new dashboards here. Each one is a folder under app/badho/<slug>/.
];

export default function BadhoIndex() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-10 flex items-center justify-between">
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

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DASHBOARDS.map((d) => {
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
            return isLive ? (
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
