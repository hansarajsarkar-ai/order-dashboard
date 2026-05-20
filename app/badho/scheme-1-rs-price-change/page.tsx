'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Row {
  seller_id: string;
  seller_name: string | null;
  businessName: string | null;
  phone: string | null;
  seller_state: string | null;
  seller_district: string | null;
  seller_city: string | null;
  brand_name: string | null;
  product_name: string | null;
  margin: string | null;
  mrp: string | null;
  brandLive: 'LIVE' | 'INACTIVE';
  originalMargin: string | null;
}

type LiveFilter = 'all' | 'LIVE' | 'INACTIVE';

export default function Scheme1RsPriceChangeDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [liveFilter, setLiveFilter] = useState<LiveFilter>('all');

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

  useEffect(() => {
    if (!authChecked) return;
    setLoading(true);
    setError(null);
    fetch('/api/scheme-1-rs-price-change')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows || []);
      })
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [authChecked]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (liveFilter !== 'all' && r.brandLive !== liveFilter) return false;
      if (!q) return true;
      const hay = [
        r.seller_name,
        r.businessName,
        r.phone,
        r.seller_state,
        r.seller_district,
        r.seller_city,
        r.brand_name,
        r.product_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, liveFilter]);

  const counts = useMemo(() => {
    let live = 0;
    let inactive = 0;
    for (const r of rows) {
      if (r.brandLive === 'LIVE') live++;
      else inactive++;
    }
    return { total: rows.length, live, inactive };
  }, [rows]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  const fmtMargin = (v: string | null) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(v);
    return Number.isFinite(n) ? `${n.toFixed(2)}%` : `${v}%`;
  };

  const fmtMrp = (v: string | null) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(v);
    return Number.isFinite(n) ? `₹${n.toFixed(2)}` : `₹${v}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="max-w-[1600px] mx-auto relative z-10">
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
            Scheme 1 Rs Price Change
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            Seller × brand × SKU rows with margin, MRP and brand-live status from purchase order term slabs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-purple-300/70">Total rows</div>
            <div className="text-2xl font-bold text-white mt-0.5">{counts.total.toLocaleString()}</div>
          </div>
          <div className="bg-emerald-500/5 backdrop-blur-xl border border-emerald-400/20 rounded-xl px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">Live</div>
            <div className="text-2xl font-bold text-emerald-200 mt-0.5">{counts.live.toLocaleString()}</div>
          </div>
          <div className="bg-rose-500/5 backdrop-blur-xl border border-rose-400/20 rounded-xl px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/80">Inactive</div>
            <div className="text-2xl font-bold text-rose-200 mt-0.5">{counts.inactive.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search seller / brand / product / phone / location…"
              className="flex-1 min-w-[240px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-purple-300/50 focus:outline-none focus:border-fuchsia-400/50"
            />
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
              {(['all', 'LIVE', 'INACTIVE'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLiveFilter(opt)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    liveFilter === opt
                      ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/40'
                      : 'text-purple-200 hover:text-white'
                  }`}
                >
                  {opt === 'all' ? 'All' : opt}
                </button>
              ))}
            </div>
            <div className="text-xs text-purple-300/70">
              Showing <span className="text-white font-semibold">{filtered.length.toLocaleString()}</span> of{' '}
              <span className="text-white font-semibold">{rows.length.toLocaleString()}</span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[70vh]">
            {loading ? (
              <div className="p-12 text-center text-purple-200 text-sm">Loading data…</div>
            ) : error ? (
              <div className="p-12 text-center text-rose-300 text-sm">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-purple-300/70 text-sm">No rows match the current filter.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-purple-300/80">
                    <th className="px-3 py-2 font-semibold">Seller</th>
                    <th className="px-3 py-2 font-semibold">Business</th>
                    <th className="px-3 py-2 font-semibold">Phone</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Brand</th>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold text-right">Margin</th>
                    <th className="px-3 py-2 font-semibold text-right">Orig. Margin</th>
                    <th className="px-3 py-2 font-semibold text-right">MRP</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr
                      key={`${r.seller_id}-${r.brand_name ?? ''}-${r.product_name ?? ''}-${i}`}
                      className="border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2 text-purple-100 whitespace-nowrap">{r.seller_name ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/90 whitespace-nowrap">{r.businessName ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/90 whitespace-nowrap font-mono text-xs">{r.phone ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/80 whitespace-nowrap text-xs">
                        {[r.seller_city, r.seller_district, r.seller_state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-purple-100 whitespace-nowrap">{r.brand_name ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/90">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-purple-100 font-mono text-xs">{fmtMargin(r.margin)}</td>
                      <td className="px-3 py-2 text-right text-purple-200/80 font-mono text-xs">{fmtMargin(r.originalMargin)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 font-mono text-xs">{fmtMrp(r.mrp)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            r.brandLive === 'LIVE'
                              ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                              : 'bg-rose-500/15 text-rose-200 border-rose-400/30'
                          }`}
                        >
                          {r.brandLive}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
