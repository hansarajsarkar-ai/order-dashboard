'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Cell {
  count: number;
  amount: number;
}

interface YearStatusRow {
  status: string;
  cells: Record<string, Cell>;
  total: Cell;
}

interface YearApiResponse {
  data: YearStatusRow[];
  years: string[];
  totals: { byYear: Record<string, Cell>; grand: Cell };
  brandId: string;
  timestamp: string;
}

function fmtAmount(n: number): string {
  if (!n) return '—';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function fmtCount(n: number): string {
  if (!n) return '—';
  return n.toLocaleString('en-IN');
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-emerald-300',
  DELIVERED: 'text-emerald-300',
  PENDING: 'text-amber-300',
  CONFIRMED: 'text-cyan-300',
  PROCESSING: 'text-cyan-300',
  REJECTED: 'text-rose-300',
  CANCELLED: 'text-rose-300',
  RETURN: 'text-orange-300',
};

function statusClass(s: string): string {
  return STATUS_COLORS[s.toUpperCase()] || 'text-purple-200';
}

export default function KapilaDashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [yearData, setYearData] = useState<YearApiResponse | null>(null);
  const [yearLoading, setYearLoading] = useState(false);

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

  const fetchYearData = useCallback(async () => {
    setYearLoading(true);
    try {
      const res = await fetch(`/api/kapila/year-status-pivot`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setYearData(json as YearApiResponse);
    } catch (err) {
      console.error('year pivot fetch failed:', err);
    } finally {
      setYearLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    fetchYearData();
  }, [authChecked, fetchYearData]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-3 py-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="w-full relative z-10">
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

        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Kapila Dashboard
          </h1>
          <p className="text-purple-200 text-sm mt-1">PO count & amount by status × year (Kapila brand only)</p>
        </div>

        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">
              Status × Year pivot <span className="text-purple-300 font-normal">(all time)</span>
            </div>
            {yearLoading && <span className="text-xs text-purple-300">Loading…</span>}
          </div>
          {yearData && yearData.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 z-10 border-r border-white/10 align-bottom">
                      Status
                    </th>
                    {yearData.years.map((y) => (
                      <th key={y} colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-fuchsia-300 border-l border-white/10">
                        {y}
                      </th>
                    ))}
                    <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-fuchsia-200 bg-white/[0.04] border-l border-white/10">
                      Total
                    </th>
                  </tr>
                  <tr>
                    {yearData.years.map((y) => (
                      <Fragment key={y}>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-purple-300/80 border-l border-white/10">Amount</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-medium text-purple-300/80">Orders</th>
                      </Fragment>
                    ))}
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-fuchsia-200 bg-white/[0.04] border-l border-white/10">Amount</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-fuchsia-200 bg-white/[0.04]">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {yearData.data.map((row) => (
                    <tr key={row.status} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className={`px-3 py-2 whitespace-nowrap sticky left-0 bg-slate-900/60 z-10 border-r border-white/10 font-medium ${statusClass(row.status)}`}>
                        {row.status}
                      </td>
                      {yearData.years.map((y) => {
                        const c = row.cells[y];
                        return (
                          <Fragment key={y}>
                            <td className="px-3 py-2 text-right text-purple-200 tabular-nums border-l border-white/10">
                              {c ? fmtAmount(c.amount) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-purple-200 tabular-nums">
                              {c ? fmtCount(c.count) : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-2 text-right text-fuchsia-200 font-semibold tabular-nums bg-white/[0.02] border-l border-white/10">
                        {fmtAmount(row.total.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-fuchsia-200 font-semibold tabular-nums bg-white/[0.02]">
                        {fmtCount(row.total.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-white/[0.04]">
                    <td className="px-3 py-2 text-xs font-semibold text-fuchsia-200 sticky left-0 bg-slate-900/80 border-r border-white/10">Total</td>
                    {yearData.years.map((y) => {
                      const c = yearData.totals.byYear[y];
                      return (
                        <Fragment key={y}>
                          <td className="px-3 py-2 text-right text-fuchsia-200 font-semibold tabular-nums border-l border-white/10">
                            {c ? fmtAmount(c.amount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-fuchsia-200 font-semibold tabular-nums">
                            {c ? fmtCount(c.count) : '—'}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-white font-bold tabular-nums border-l border-white/10">
                      {fmtAmount(yearData.totals.grand.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-white font-bold tabular-nums">
                      {fmtCount(yearData.totals.grand.count)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : !yearLoading ? (
            <div className="p-10 text-center text-purple-300/70 text-sm">No data.</div>
          ) : null}
        </div>

        <div className="mt-6 text-xs text-purple-300/50">
          Filters applied: excludes DRAFT POs, DRAFT items, combo child rows, test buyers/sellers, false orders.
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
