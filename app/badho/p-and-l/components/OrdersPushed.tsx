'use client';

import { useEffect, useMemo, useState } from 'react';
import DetailsModal from './DetailsModal';
import {
  ColumnDef,
  buildColumns,
  formatValue,
  isNumericCol,
  cellToneClass,
  rowToneClass,
  computeMaxLoss,
  heatBg,
} from './columns';

type Row = Record<string, unknown>;

type Tone = 'good' | 'warn' | 'bad' | 'critical';

interface Band {
  label: string;
  tone: Tone;
  test: (x: number) => boolean;
}

interface Dimension {
  key: string; // the % column in the row
  title: string;
  icon: string;
  bands: Band[];
}

// ── Slab definitions ──────────────────────────────────────────────────
// Rows with a null/blank % (e.g. GrossAmount = 0) are bucketed as 0.
const DIMENSIONS: Dimension[] = [
  {
    key: 'CouponApplied%',
    title: 'Coupon Applied %',
    icon: '🎟️',
    bands: [
      { label: '0–5%', tone: 'good', test: (x) => x <= 5 },
      { label: '5–10%', tone: 'warn', test: (x) => x > 5 && x <= 10 },
      { label: '>10%', tone: 'bad', test: (x) => x > 10 },
    ],
  },
  {
    key: 'ExpectedDeliveryLoss%',
    title: 'Expected Delivery Loss %',
    icon: '🚚',
    bands: [
      { label: '<20%', tone: 'good', test: (x) => x < 20 },
      { label: '20–30%', tone: 'warn', test: (x) => x >= 20 && x <= 30 },
      { label: '30–50%', tone: 'bad', test: (x) => x > 30 && x <= 50 },
      { label: '>50%', tone: 'critical', test: (x) => x > 50 },
    ],
  },
  {
    key: 'PaymentDiscount%',
    title: 'Payment Discount %',
    icon: '💳',
    bands: [
      { label: '0–5%', tone: 'good', test: (x) => x <= 5 },
      { label: '>5%', tone: 'bad', test: (x) => x > 5 },
    ],
  },
  {
    key: 'ItemDiscount%',
    title: 'Item Discount %',
    icon: '🏷️',
    bands: [
      { label: '<10%', tone: 'good', test: (x) => x < 10 },
      { label: '10–30%', tone: 'warn', test: (x) => x >= 10 && x <= 30 },
      { label: '30–50%', tone: 'bad', test: (x) => x > 30 && x < 50 },
      { label: '≥50%', tone: 'critical', test: (x) => x >= 50 },
    ],
  },
];

const TONE: Record<Tone, { dot: string; pill: string; bar: string; rowBg: string }> = {
  good: { dot: 'bg-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-400/80', rowBg: '' },
  warn: { dot: 'bg-amber-400', pill: 'bg-amber-500/15 text-amber-300', bar: 'bg-amber-400/80', rowBg: '' },
  bad: { dot: 'bg-orange-400', pill: 'bg-orange-500/25 text-orange-200', bar: 'bg-orange-400/80', rowBg: 'bg-orange-500/[0.07]' },
  critical: { dot: 'bg-rose-400', pill: 'bg-rose-500/25 text-rose-200', bar: 'bg-rose-400/80', rowBg: 'bg-rose-500/[0.08]' },
};

function numOf(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function OrdersPushed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; subtitle: string; rows: Row[]; sortKey?: string } | null>(null);

  // Table filters + sort.
  const [filterPo, setFilterPo] = useState('');
  const [filterAwb, setFilterAwb] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/p-and-l/orders-pushed')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) {
          setError(d.error);
        } else {
          setRows(d.rows || []);
          setColumns(buildColumns(d.columns || []));
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const kpis = useMemo(() => {
    let gross = 0;
    let pnl = 0;
    for (const r of rows) {
      gross += numOf(r['GrossAmount']);
      pnl += numOf(r['P&LAmount']);
    }
    const pnlPct = gross > 0 ? (pnl * 100) / gross : 0;
    return { count: rows.length, gross, pnl, pnlPct };
  }, [rows]);

  const buckets = useMemo(() => {
    return DIMENSIONS.map((dim) => {
      const bandRows: Row[][] = dim.bands.map(() => []);
      for (const r of rows) {
        const x = numOf(r[dim.key]);
        const idx = dim.bands.findIndex((b) => b.test(x));
        if (idx >= 0) bandRows[idx].push(r);
      }
      return { dim, bandRows };
    });
  }, [rows]);

  // Every pushed order sitting in a bad/critical slab on ANY dimension,
  // deduped by poNumber — the big officer wants the whole rogues' gallery.
  const flaggedAll = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    buckets.forEach(({ dim, bandRows }) => {
      dim.bands.forEach((b, i) => {
        if (b.tone === 'bad' || b.tone === 'critical') {
          for (const r of bandRows[i]) {
            const key = String(r['poNumber'] ?? `${dim.key}-${out.length}`);
            if (!seen.has(key)) {
              seen.add(key);
              out.push(r);
            }
          }
        }
      });
    });
    return out;
  }, [buckets]);

  // Filtered + sorted rows for the main table.
  const displayRows = useMemo(() => {
    const po = filterPo.trim().toLowerCase();
    const awb = filterAwb.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (po && !String(r['poNumber'] ?? '').toLowerCase().includes(po)) return false;
      if (awb && !String(r['AWBNumber'] ?? '').toLowerCase().includes(awb)) return false;
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const aEmpty = av === null || av === undefined || av === '';
        const bEmpty = bv === null || bv === undefined || bv === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1; // empties last
        if (bEmpty) return -1;
        const an = Number(av);
        const bn = Number(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return out;
  }, [rows, filterPo, filterAwb, sortKey, sortDir]);

  // Max-loss heatmap is relative to the rows currently in view.
  const maxLoss = useMemo(() => computeMaxLoss(displayRows, columns), [displayRows, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
        <div className="text-purple-200 text-sm animate-pulse">Loading pushed orders…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-400/30 rounded-2xl p-8 text-center">
        <div className="text-rose-200 font-semibold mb-1">Failed to load</div>
        <div className="text-rose-300/80 text-xs font-mono break-all">{error}</div>
      </div>
    );
  }

  const openModal = (title: string, subtitle: string, modalRows: Row[], sortKey?: string) => {
    setModal({ title, subtitle, rows: modalRows, sortKey });
  };

  // Export the currently filtered + sorted rows (what's on screen) as CSV.
  const downloadCsv = () => {
    if (displayRows.length === 0) return;
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c) => esc(c.label)).join(',');
    const body = displayRows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-pushed-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Pushed Orders" value={kpis.count.toLocaleString('en-IN')} icon="📦" glow="bg-fuchsia-500/25" />
        <Kpi label="Gross Amount" value={fmtINR(kpis.gross)} icon="💰" glow="bg-indigo-500/25" />
        <Kpi
          label="Expected Total P&L"
          value={fmtINR(kpis.pnl)}
          icon={kpis.pnl >= 0 ? '📈' : '📉'}
          glow={kpis.pnl >= 0 ? 'bg-emerald-500/25' : 'bg-rose-500/25'}
          valueClass={kpis.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}
          trend={kpis.pnl >= 0 ? 'up' : 'down'}
        />
        <Kpi
          label="Expected P&L %"
          value={kpis.pnlPct.toFixed(2) + '%'}
          icon="🧮"
          glow={kpis.pnlPct >= 0 ? 'bg-emerald-500/25' : 'bg-rose-500/25'}
          valueClass={kpis.pnlPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}
          trend={kpis.pnlPct >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Breakdown alert cards — compact + eye-catching */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {buckets.map(({ dim, bandRows }) => {
          const total = bandRows.reduce((s, br) => s + br.length, 0);
          // Orders that need attention = bad + critical bands.
          const attention = dim.bands.reduce(
            (s, b, i) => (b.tone === 'bad' || b.tone === 'critical' ? s + bandRows[i].length : s),
            0
          );
          // All orders sitting in a bad/critical band — the siren + police pull these up.
          const attentionRows = dim.bands.flatMap((b, i) =>
            b.tone === 'bad' || b.tone === 'critical' ? bandRows[i] : []
          );
          const openAttention = () =>
            openModal(
              `${dim.title} · 🚓 Investigate`,
              `${attention} pushed orders in high-range slabs — sorted by ${dim.title}`,
              attentionRows,
              dim.key
            );
          return (
            <div
              key={dim.key}
              className={
                'group relative overflow-hidden rounded-2xl border bg-white/[0.035] backdrop-blur-xl p-4 transition-colors duration-300 ' +
                (attention > 0
                  ? 'border-rose-400/40 breathe-red'
                  : 'border-white/10 hover:border-white/20')
              }
            >
              {/* top hairline highlight — matches KPI cards */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 ring-1 ring-inset ring-white/10 text-[13px]">
                    {dim.icon}
                  </span>
                  {dim.title}
                </h3>
                {attention > 0 ? (
                  <button
                    onClick={openAttention}
                    className="siren-btn flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/30 text-rose-100 border border-rose-400/50 cursor-pointer"
                    title={`Click to investigate all ${attention} high-range orders`}
                  >
                    🚨 {attention}
                  </button>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                    ✓ ok
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dim.bands.map((band, i) => {
                  const br = bandRows[i];
                  const pct = total > 0 ? (br.length * 100) / total : 0;
                  const tone = TONE[band.tone];
                  const flag = (band.tone === 'bad' || band.tone === 'critical') && br.length > 0;
                  return (
                    <div
                      key={band.label}
                      className={
                        'flex items-center gap-2 rounded-lg px-2 py-1 ' + (flag ? tone.rowBg : '')
                      }
                    >
                      <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + tone.dot} />
                      <span className="text-[12px] font-medium text-purple-100 w-16 shrink-0">{band.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={'h-full rounded-full transition-all duration-500 ' + tone.bar} style={{ width: `${pct}%` }} />
                      </div>
                      <button
                        onClick={() =>
                          openModal(
                            `${dim.title} · ${band.label}`,
                            `Pushed orders matching this slab — sorted by ${dim.title}`,
                            br,
                            dim.key
                          )
                        }
                        disabled={br.length === 0}
                        className={
                          'min-w-[2.5rem] text-center rounded-md tabular-nums transition-transform ' +
                          (br.length === 0
                            ? 'px-2 py-0.5 text-[13px] font-bold text-purple-500/40 cursor-default'
                            : flag
                              ? 'px-2 py-0.5 text-[15px] font-extrabold bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/50 num-alert hover:scale-110 cursor-pointer'
                              : `px-2 py-0.5 text-[13px] font-bold ${tone.pill} hover:scale-110 cursor-pointer`)
                        }
                        title={br.length ? 'Click to view orders' : 'No orders'}
                      >
                        {br.length}
                      </button>
                    </div>
                  );
                })}
              </div>
              {attention > 0 && (
                <button
                  onClick={openAttention}
                  className="mt-3 w-full flex items-center gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-left transition-colors hover:bg-rose-500/20 cursor-pointer"
                  title="Click to investigate these orders"
                >
                  <span className="police-bob text-xl leading-none shrink-0">👮‍♂️</span>
                  <span className="relative rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-rose-100 leading-snug">
                    Officer here — please investigate these {attention} orders.
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-white/10" />
                  </span>
                  <span className="ml-auto text-rose-200 text-sm shrink-0">→</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Big police officer — standing guard outside the cards, demanding a look */}
      {flaggedAll.length > 0 && (
        <div className="relative overflow-visible rounded-2xl border border-rose-400/40 bg-gradient-to-r from-rose-500/15 via-rose-500/[0.06] to-transparent breathe-red px-5 pt-6 pb-5 sm:pl-44">
          {/* The officer himself — oversized, bobbing, lifting out past the card edge */}
          <div className="pointer-events-none absolute -top-10 left-2 sm:-left-4 z-10">
            <div className="absolute inset-0 -z-10 translate-y-6 rounded-full bg-rose-500/30 blur-3xl" />
            <div className="police-bob text-[110px] sm:text-[150px] leading-none drop-shadow-[0_10px_28px_rgba(244,63,94,0.5)]">
              👮‍♂️
            </div>
            <span className="siren-btn absolute top-4 right-3 text-3xl">🚨</span>
          </div>

          {/* Speech bubble */}
          <div className="relative ml-2 sm:ml-0">
            <span className="hidden sm:block absolute -left-3 top-9 h-5 w-5 rotate-45 bg-white/10 border-l border-b border-white/15" />
            <div className="rounded-2xl bg-white/10 border border-white/15 px-5 py-4">
              <div className="text-rose-100 text-lg sm:text-2xl font-extrabold leading-snug">
                🚓 Halt! {flaggedAll.length} pushed orders are leaking margin.
              </div>
              <div className="text-rose-200/85 text-sm mt-1 max-w-2xl">
                These orders fall in high-range discount / delivery-loss slabs across one or more
                checks. Let&apos;s investigate them before they eat into P&amp;L.
              </div>
              <button
                onClick={() =>
                  openModal(
                    '🚓 Investigate flagged orders',
                    `${flaggedAll.length} pushed orders flagged in high-range slabs (across all checks)`,
                    flaggedAll,
                    'P&LAmount'
                  )
                }
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white font-bold text-sm px-4 py-2 cursor-pointer transition-colors shadow-lg shadow-rose-900/30 animate-pulse"
              >
                🔍 Investigate these {flaggedAll.length} orders
                <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Orders Pushed table */}
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-20" />
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-fuchsia-400 to-indigo-500" />
              Orders Pushed
            </h3>
            {/* Filters */}
            <div className="relative">
              <input
                value={filterPo}
                onChange={(e) => setFilterPo(e.target.value)}
                placeholder="Filter poNumber…"
                className="w-40 pl-3 pr-7 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:border-fuchsia-400/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/30"
              />
              {filterPo && (
                <button
                  onClick={() => setFilterPo('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-purple-300/70 hover:text-white text-xs px-1"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>
            <div className="relative">
              <input
                value={filterAwb}
                onChange={(e) => setFilterAwb(e.target.value)}
                placeholder="Filter AWB number…"
                className="w-44 pl-3 pr-7 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:border-fuchsia-400/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/30"
              />
              {filterAwb && (
                <button
                  onClick={() => setFilterAwb('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-purple-300/70 hover:text-white text-xs px-1"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>
            {sortKey && (
              <button
                onClick={() => setSortKey(null)}
                className="text-[11px] font-semibold text-purple-300/70 hover:text-white px-2 py-1 rounded-lg bg-white/5 border border-white/10"
                title="Clear sort"
              >
                Clear sort ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-purple-300/70">
              {displayRows.length.toLocaleString('en-IN')}
              {displayRows.length !== rows.length ? ` / ${rows.length.toLocaleString('en-IN')}` : ''} rows
            </span>
            <button
              onClick={downloadCsv}
              disabled={displayRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-200 border border-emerald-400/30 hover:from-emerald-500/30 hover:to-teal-500/30 hover:text-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Download the current rows as CSV"
            >
              ⬇ CSV
            </button>
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          {displayRows.length === 0 ? (
            <div className="p-12 text-center text-purple-300/70 text-sm">
              {rows.length === 0 ? 'No pushed orders.' : 'No rows match the current filters.'}
            </div>
          ) : (
            <table className="text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((c) => {
                    const active = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        className={
                          'px-3 py-2 text-left font-semibold border-b border-white/15 whitespace-nowrap cursor-pointer select-none bg-slate-900/95 hover:bg-slate-800/95 ' +
                          (active ? 'text-fuchsia-300' : 'text-purple-200')
                        }
                        title="Click to sort"
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          <span className={'text-[9px] ' + (active ? 'opacity-100' : 'opacity-30')}>
                            {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={i} className={'transition-colors ' + rowToneClass(r)}>
                    {columns.map((c) => {
                      const v = r[c.key];
                      const num = isNumericCol(v, c.key);
                      const tone = cellToneClass(c, v);
                      const heat = heatBg(c, v, maxLoss);
                      if (c.key === 'poNumber') {
                        return (
                          <td
                            key={c.key}
                            className="px-3 py-1.5 border-b border-white/5 whitespace-nowrap text-left"
                          >
                            <button
                              onClick={() =>
                                openModal(`PO #${formatValue(c, v)}`, 'Full order detail', [r])
                              }
                              className="font-bold text-fuchsia-300 hover:text-fuchsia-200 hover:underline cursor-pointer"
                              title="Click to view full order detail"
                            >
                              {formatValue(c, v)}
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={c.key}
                          style={heat ? { backgroundColor: heat } : undefined}
                          className={
                            'px-3 py-1.5 border-b border-white/5 whitespace-nowrap ' +
                            (num ? 'text-right tabular-nums ' : 'text-left ') +
                            (heat ? 'text-rose-50 font-semibold' : tone || 'text-purple-100/90')
                          }
                        >
                          {formatValue(c, v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <DetailsModal
          title={modal.title}
          subtitle={modal.subtitle}
          columns={columns}
          rows={modal.rows}
          defaultSortKey={modal.sortKey}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  glow,
  valueClass = 'text-white',
  trend,
}: {
  label: string;
  value: string;
  icon: string;
  glow: string;
  valueClass?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]">
      {/* corner accent glow */}
      <div className={`pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full blur-2xl opacity-50 transition-opacity duration-300 group-hover:opacity-80 ${glow}`} />
      {/* top hairline highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="relative flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-purple-200/60">{label}</span>
        <span className="text-base opacity-70 transition-transform duration-300 group-hover:scale-110">{icon}</span>
      </div>
      <div className="relative mt-2.5 flex items-baseline gap-1.5">
        <span className={`text-[27px] leading-none font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</span>
        {trend && (
          <span className={`text-xs font-bold ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </div>
  );
}
