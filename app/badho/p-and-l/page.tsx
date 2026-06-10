'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  P & L DASHBOARD
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Two tabs:
 *    • Orders Not Pushed — orders that have not yet been pushed.
 *    • Orders Pushed     — orders that have been pushed.
 *
 *  Tab content is stubbed for now; wire up the data/API per tab as the
 *  P&L metrics are defined.
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type TabKey = 'orders-not-pushed' | 'orders-pushed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'orders-not-pushed', label: 'Orders Not Pushed' },
  { key: 'orders-pushed', label: 'Orders Pushed' },
];

export default function PnLDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('orders-not-pushed');

  // Client-side auth gate — every dashboard does this.
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
        {/* Top bar — back to /badho + user chip + logout */}
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

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            P &amp; L
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            Profit &amp; loss overview — revenue, costs, margins, and net P&amp;L.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-2 border-b border-white/10">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  'px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ' +
                  (active
                    ? 'border-fuchsia-400 text-white'
                    : 'border-transparent text-purple-300/70 hover:text-purple-100 hover:border-white/20')
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          {activeTab === 'orders-not-pushed' ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">Orders Not Pushed</h2>
              <p className="text-purple-300">Orders that have not yet been pushed will appear here.</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">Orders Pushed</h2>
              <p className="text-purple-300">Orders that have been pushed will appear here.</p>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
