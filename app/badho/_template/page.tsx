'use client';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  TEMPLATE FOR A NEW BADHO DASHBOARD
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. Copy this whole folder to app/badho/<your-slug>/ — e.g.
 *      cp -r app/badho/_template app/badho/coupon-dashboard
 *
 * 2. Register the new dashboard in app/badho/page.tsx by adding an
 *    entry to the DASHBOARDS array (slug must match the folder name).
 *
 * 3. Add any API routes that ONLY this dashboard uses at
 *      app/api/<your-slug>/<endpoint>/route.ts
 *    so the URLs stay namespaced (e.g. /api/coupon-dashboard/burn).
 *
 * 4. Put dashboard-specific components inside ./components.
 *    Truly shared components (used by 2+ dashboards) belong in a
 *    top-level lib or a dedicated app/shared/ folder.
 *
 * Folder shape:
 *   app/badho/<slug>/
 *     page.tsx              ← this file (the dashboard)
 *     components/           ← dashboard-only components
 *       Example.tsx
 *
 * The auth gate, logout button, and top-bar chrome are copy-pasted
 * from the existing order-dashboard page so every dashboard is
 * consistent. Delete what you don't need.
 *
 * The folder name starts with "_" so Next.js does NOT generate a
 * /badho/_template route. Your real dashboard's slug must not start
 * with "_".
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TemplateDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

        {/* ─── Your dashboard content goes here ──────────────────── */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">New Dashboard Template</h1>
          <p className="text-purple-300 mb-6">
            Copy this folder, rename it, and replace this card with your dashboard&apos;s content.
          </p>
          <p className="text-xs text-purple-300/60">
            Don&apos;t forget to register the new slug in <code className="text-purple-200">app/badho/page.tsx</code>.
          </p>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
