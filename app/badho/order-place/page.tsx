'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DraftOrderRow {
  poNumber: string | null;
  amount: string | number | null;
  status: string;
  created_at: string;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
}

interface ApiResponse {
  rows: DraftOrderRow[];
  count: number;
  truncated: boolean;
  maxRows: number;
  timestamp: string;
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatAmount(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return INR.format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function OrderPlaceDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/order-place/draft-orders', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) fetchData();
  }, [authChecked, fetchData]);

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

  const rows = data?.rows ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-7xl mx-auto relative z-10">
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

        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Order Place Dashboard
            </h1>
            <p className="text-purple-200/80 text-sm mt-1">
              D2R brand-seller purchase orders still in <span className="font-semibold text-fuchsia-300">DRAFT</span> — last 30 days.
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/30 text-fuchsia-100 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-white/10">
            <div className="text-sm text-purple-100">
              {loading && !data ? (
                <span className="text-purple-300/70">Loading draft orders…</span>
              ) : (
                <>
                  <span className="font-bold text-white">{rows.length.toLocaleString('en-IN')}</span>
                  <span className="text-purple-300/70"> draft orders</span>
                  {data?.truncated && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                      capped at {data.maxRows.toLocaleString('en-IN')}
                    </span>
                  )}
                </>
              )}
            </div>
            {data?.timestamp && (
              <div className="text-[11px] text-purple-300/60">
                Updated {new Date(data.timestamp).toLocaleTimeString('en-IN')}
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-6 text-rose-200 text-sm bg-rose-500/10 border-b border-rose-400/30">
              Failed to load: {error}
            </div>
          )}

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10">
                <tr className="text-purple-200 uppercase text-xs">
                  <th className="px-4 py-3 text-left whitespace-nowrap">PO Number</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Created At</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Buyer</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Buyer Phone</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Seller</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Seller Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.poNumber ?? 'po'}-${i}`} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-mono text-fuchsia-100 whitespace-nowrap">{r.poNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{formatAmount(r.amount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-purple-100 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-white">{r.buyerBusinessName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-purple-200 tabular-nums whitespace-nowrap">
                      {r.buyerPhone ? <a href={`tel:${r.buyerPhone}`} className="hover:text-fuchsia-300">{r.buyerPhone}</a> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-white">{r.sellerBusinessName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-purple-200 tabular-nums whitespace-nowrap">
                      {r.sellerPhone ? <a href={`tel:${r.sellerPhone}`} className="hover:text-fuchsia-300">{r.sellerPhone}</a> : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-purple-300/70">
                      No DRAFT purchase orders from D2R brand sellers this year.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
