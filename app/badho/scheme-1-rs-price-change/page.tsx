'use client';

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Multi-select dropdown for brands. Click outside to close. Search box at top.
function MultiBrandSelect({
  brands,
  selected,
  onChange,
}: {
  brands: { id: string; name: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, query]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selected);
    for (const b of filtered) next.add(b.id);
    onChange(next);
  };

  const label =
    selected.size === 0
      ? '— Select brand(s) —'
      : selected.size === 1
      ? brands.find((b) => selected.has(b.id))?.name ?? '1 brand'
      : `${selected.size} brands selected`;

  return (
    <div ref={ref} className="relative min-w-[260px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-fuchsia-400/40 text-sm text-white flex items-center justify-between gap-2"
      >
        <span className={`truncate ${selected.size === 0 ? 'text-purple-300/60' : ''}`}>{label}</span>
        <span className="text-purple-300 text-xs">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-80 rounded-lg bg-slate-900 border border-white/15 shadow-xl flex flex-col">
          <div className="p-2 border-b border-white/10 flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands…"
              className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-white placeholder:text-purple-300/50 focus:outline-none focus:border-fuchsia-400/50"
            />
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="px-2 py-1 rounded text-[11px] font-semibold bg-white/5 border border-white/10 text-purple-100 hover:bg-white/10 disabled:opacity-40"
              title="Select all matching"
            >
              All
            </button>
          </div>
          <div className="overflow-y-auto max-h-60">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-purple-300/70 text-center">No brands found.</div>
            ) : (
              filtered.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggle(b.id)}
                    className="accent-fuchsia-400"
                  />
                  <span className="text-sm text-purple-100 truncate">{b.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Per-row editable margin cell. Holds its own draft state so typing in
// one row does NOT re-render the entire 7k-row table.
type MarginSaver = (slabId: string, newMargin: number) => Promise<void>;

const MarginCell = memo(function MarginCell({
  slabId,
  margin,
  onSave,
}: {
  slabId: string;
  margin: string | null;
  onSave: MarginSaver;
}) {
  const [draft, setDraft] = useState<string>(margin ?? '');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // When the server confirms a save, the parent passes a new `margin` prop
  // — sync the draft to it as long as the user isn't mid-edit.
  useEffect(() => {
    if (!touched) setDraft(margin ?? '');
  }, [margin, touched]);

  const commit = async () => {
    if (!touched) return;
    const n = Number(draft);
    const current = margin === null || margin === '' ? NaN : parseFloat(margin);
    if (!Number.isFinite(n) || (Number.isFinite(current) && current === n)) {
      setDraft(margin ?? '');
      setTouched(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(slabId, n);
      setTouched(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        step="any"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setTouched(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            setDraft(margin ?? '');
            setTouched(false);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        disabled={saving}
        className="w-20 px-1.5 py-0.5 rounded bg-white/5 border border-white/15 hover:border-fuchsia-400/50 focus:border-fuchsia-400/70 focus:bg-slate-900 text-right text-purple-100 font-mono text-xs focus:outline-none disabled:opacity-50 transition-colors"
      />
      <span className="text-purple-300/70 text-xs">{saving ? '…' : '%'}</span>
    </div>
  );
});

interface Row {
  slab_id: string;
  seller_id: string;
  seller_name: string | null;
  businessName: string | null;
  phone: string | null;
  seller_state: string | null;
  seller_district: string | null;
  seller_city: string | null;
  brand_id: string | null;
  brand_name: string | null;
  product_name: string | null;
  margin: string | null;
  mrp: string | null;
  brandLive: 'LIVE' | 'INACTIVE';
  originalMargin: string | null;
}

type LiveFilter = 'all' | 'LIVE' | 'INACTIVE';
type Tab = 'products' | 'brands';

// Price is "not set" when margin is null/empty or equals 100 (the default value).
function isPriceSet(margin: string | null): boolean {
  if (margin === null || margin === undefined || margin === '') return false;
  const n = parseFloat(margin);
  if (!Number.isFinite(n)) return false;
  return n !== 100;
}

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
  const [tab, setTab] = useState<Tab>('brands');

  // Bulk update by brand(s). One Set so "single" and "multi" use the same path.
  const [bulkBrandIds, setBulkBrandIds] = useState<Set<string>>(new Set());
  const [bulkMargin, setBulkMargin] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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

  // Brand-level counts: a brand is "live" if any of its rows are LIVE.
  const counts = useMemo(() => {
    const brandHasLive = new Map<string, boolean>();
    for (const r of rows) {
      const brand = r.brand_name ?? '(no brand)';
      const prev = brandHasLive.get(brand) ?? false;
      brandHasLive.set(brand, prev || r.brandLive === 'LIVE');
    }
    let live = 0;
    let inactive = 0;
    for (const hasLive of brandHasLive.values()) {
      if (hasLive) live++;
      else inactive++;
    }
    return { totalBrand: brandHasLive.size, liveBrand: live, inactiveBrand: inactive };
  }, [rows]);

  // Per-brand aggregation over the *filtered* rows so search + LIVE/INACTIVE
  // filter apply to this view too.
  const brandAgg = useMemo(() => {
    type Agg = { brand: string; total: number; priceSet: number; priceNotSet: number };
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const brand = r.brand_name ?? '(no brand)';
      let entry = map.get(brand);
      if (!entry) {
        entry = { brand, total: 0, priceSet: 0, priceNotSet: 0 };
        map.set(brand, entry);
      }
      entry.total += 1;
      if (isPriceSet(r.margin)) entry.priceSet += 1;
      else entry.priceNotSet += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Distinct brands for the bulk selector (sorted by name).
  const brandOptions = useMemo(() => {
    const map = new Map<string, string>(); // brandId -> brandName
    for (const r of rows) {
      if (r.brand_id && r.brand_name) map.set(r.brand_id, r.brand_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Apply server response to local row state (id -> { margin, originalMargin }).
  // Stable via useCallback so saveSingleMargin can depend on it without
  // breaking the memo on <MarginCell>.
  const applyUpdates = useCallback(
    (updates: { id: string; margin: string; originalMargin: string | null }[]) => {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      setRows((prev) =>
        prev.map((r) => {
          const u = byId.get(r.slab_id);
          return u ? { ...r, margin: u.margin, originalMargin: u.originalMargin } : r;
        })
      );
    },
    []
  );

  const saveSingleMargin = useCallback<MarginSaver>(
    async (slabId, newMargin) => {
      try {
        const res = await fetch('/api/scheme-1-rs-price-change', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slabIds: [slabId], margin: newMargin }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        applyUpdates(data.updated || []);
        setBulkMessage(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setBulkMessage({ kind: 'err', text: `Save failed: ${msg}` });
      }
    },
    [applyUpdates]
  );

  const applyBulk = async () => {
    const n = Number(bulkMargin);
    if (bulkBrandIds.size === 0 || !Number.isFinite(n)) {
      setBulkMessage({ kind: 'err', text: 'Pick at least one brand and enter a valid margin.' });
      return;
    }
    const brandIds = Array.from(bulkBrandIds);
    setBulkApplying(true);
    setBulkMessage(null);
    try {
      const res = await fetch('/api/scheme-1-rs-price-change', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandIds, margin: n }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      applyUpdates(data.updated || []);
      const summary =
        brandIds.length === 1
          ? brandOptions.find((b) => b.id === brandIds[0])?.name ?? '1 brand'
          : `${brandIds.length} brands`;
      setBulkMessage({
        kind: 'ok',
        text: `Updated ${data.count} slab(s) for ${summary} to ${n}%.`,
      });
      setBulkMargin('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBulkMessage({ kind: 'err', text: `Bulk update failed: ${msg}` });
    } finally {
      setBulkApplying(false);
    }
  };

  const clearBulkSelection = () => {
    setBulkBrandIds(new Set());
    setBulkMargin('');
    setBulkMessage(null);
  };

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

        {/* Top-level tabs */}
        <div className="mb-6 flex items-center gap-2 border-b border-white/10">
          {([
            { id: 'brands', label: 'Brand-wise' },
            { id: 'products', label: 'Product and Price' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-base font-semibold transition-colors -mb-px border-b-2 ${
                tab === t.id
                  ? 'text-white border-fuchsia-400'
                  : 'text-purple-300 hover:text-white border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Scheme 1 Rs Price Change
          </h1>
          <p className="text-purple-200 text-sm mt-1">
            Seller × brand × SKU rows with margin, MRP and brand-live status from purchase order term slabs.
          </p>
        </div>

        {tab === 'brands' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-purple-300/70">Total brand</div>
              <div className="text-2xl font-bold text-white mt-0.5">{counts.totalBrand.toLocaleString()}</div>
            </div>
            <div className="bg-emerald-500/5 backdrop-blur-xl border border-emerald-400/20 rounded-xl px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">Live brand</div>
              <div className="text-2xl font-bold text-emerald-200 mt-0.5">{counts.liveBrand.toLocaleString()}</div>
            </div>
            <div className="bg-rose-500/5 backdrop-blur-xl border border-rose-400/20 rounded-xl px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-rose-300/80">Inactive brand</div>
              <div className="text-2xl font-bold text-rose-200 mt-0.5">{counts.inactiveBrand.toLocaleString()}</div>
            </div>
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 mb-4">
            <div className="text-[11px] uppercase tracking-wider text-purple-300/70 mb-2">Bulk update margin by brand</div>
            <div className="flex items-center gap-2 flex-wrap">
              <MultiBrandSelect
                brands={brandOptions}
                selected={bulkBrandIds}
                onChange={setBulkBrandIds}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  value={bulkMargin}
                  onChange={(e) => setBulkMargin(e.target.value)}
                  placeholder="Margin"
                  className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-purple-300/50 focus:outline-none focus:border-fuchsia-400/50"
                />
                <span className="text-purple-300 text-sm">%</span>
              </div>
              <button
                onClick={applyBulk}
                disabled={bulkApplying || bulkBrandIds.size === 0 || bulkMargin === ''}
                className="px-4 py-2 rounded-lg bg-fuchsia-500/25 hover:bg-fuchsia-500/40 border border-fuchsia-400/40 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {bulkApplying ? 'Applying…' : 'Apply to all products'}
              </button>
              <button
                onClick={clearBulkSelection}
                disabled={bulkApplying || (bulkBrandIds.size === 0 && bulkMargin === '' && !bulkMessage)}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-purple-100 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Clear selected brands, margin, and any message"
              >
                Clear
              </button>
              {bulkMessage && (
                <span
                  className={`text-xs font-medium ${
                    bulkMessage.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {bulkMessage.text}
                </span>
              )}
            </div>
            <div className="text-[11px] text-purple-300/60 mt-2">
              Pick one brand or many. Sets margin for every active product mapping of the chosen brands; each row&apos;s previous margin is moved into Orig. Margin.
            </div>
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'brands'
                  ? 'Search brand / seller / product…'
                  : 'Search seller / brand / product / phone / location…'
              }
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
              {tab === 'brands' ? (
                <>
                  Showing <span className="text-white font-semibold">{brandAgg.length.toLocaleString()}</span> brands ·{' '}
                  <span className="text-white font-semibold">{filtered.length.toLocaleString()}</span> products
                </>
              ) : (
                <>
                  Showing <span className="text-white font-semibold">{filtered.length.toLocaleString()}</span> of{' '}
                  <span className="text-white font-semibold">{rows.length.toLocaleString()}</span>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[70vh]">
            {loading ? (
              <div className="p-12 text-center text-purple-200 text-sm">Loading data…</div>
            ) : error ? (
              <div className="p-12 text-center text-rose-300 text-sm">{error}</div>
            ) : tab === 'brands' ? (
              brandAgg.length === 0 ? (
                <div className="p-12 text-center text-purple-300/70 text-sm">No brands match the current filter.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-purple-300/80">
                      <th className="px-3 py-2 font-semibold">Brand</th>
                      <th className="px-3 py-2 font-semibold text-right">Total Active Products</th>
                      <th className="px-3 py-2 font-semibold text-right">Price Set</th>
                      <th className="px-3 py-2 font-semibold text-right">Price Not Set</th>
                      <th className="px-3 py-2 font-semibold text-right">% Set</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandAgg.map((b) => {
                      const pct = b.total > 0 ? (b.priceSet / b.total) * 100 : 0;
                      return (
                        <tr key={b.brand} className="border-b border-white/5 hover:bg-white/[0.03]">
                          <td className="px-3 py-2 text-purple-100 font-medium">{b.brand}</td>
                          <td className="px-3 py-2 text-right text-white font-mono">{b.total.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-200">{b.priceSet.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-rose-200">{b.priceNotSet.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-purple-200/80 text-xs">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-purple-300/70 text-sm">No rows match the current filter.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-purple-300/80">
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">Brand</th>
                    <th className="px-3 py-2 font-semibold text-right">Margin</th>
                    <th className="px-3 py-2 font-semibold text-right">Orig. Margin</th>
                    <th className="px-3 py-2 font-semibold text-right">MRP</th>
                    <th className="px-3 py-2 font-semibold">Seller Phone</th>
                    <th className="px-3 py-2 font-semibold">Business Name</th>
                    <th className="px-3 py-2 font-semibold">Seller</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.slab_id} className="border-b border-white/5 hover:bg-white/[0.03]">
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
                      <td className="px-3 py-2 text-purple-200/90">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-100 whitespace-nowrap">{r.brand_name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <MarginCell slabId={r.slab_id} margin={r.margin} onSave={saveSingleMargin} />
                      </td>
                      <td className="px-3 py-2 text-right text-purple-200/80 font-mono text-xs">{fmtMargin(r.originalMargin)}</td>
                      <td className="px-3 py-2 text-right text-purple-100 font-mono text-xs">{fmtMrp(r.mrp)}</td>
                      <td className="px-3 py-2 text-purple-200/90 whitespace-nowrap font-mono text-xs">{r.phone ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/90 whitespace-nowrap">{r.businessName ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-100 whitespace-nowrap">{r.seller_name ?? '—'}</td>
                      <td className="px-3 py-2 text-purple-200/80 whitespace-nowrap text-xs">
                        {[r.seller_city, r.seller_district, r.seller_state].filter(Boolean).join(', ') || '—'}
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
