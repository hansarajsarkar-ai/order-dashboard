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
  const [modal, setModal] = useState<{ title: string; subtitle: string; rows: Row[] } | null>(null);

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

  const openModal = (title: string, subtitle: string, modalRows: Row[]) => {
    setModal({ title, subtitle, rows: modalRows });
  };

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Pushed Orders" value={kpis.count.toLocaleString('en-IN')} accent="from-fuchsia-500/30 to-purple-600/30" />
        <Kpi label="Gross Amount" value={fmtINR(kpis.gross)} accent="from-indigo-500/30 to-blue-600/30" />
        <Kpi
          label="Total P&L"
          value={fmtINR(kpis.pnl)}
          accent={kpis.pnl >= 0 ? 'from-emerald-500/30 to-teal-600/30' : 'from-rose-500/30 to-red-600/30'}
          valueClass={kpis.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}
        />
        <Kpi
          label="P&L %"
          value={kpis.pnlPct.toFixed(2) + '%'}
          accent={kpis.pnlPct >= 0 ? 'from-emerald-500/30 to-teal-600/30' : 'from-rose-500/30 to-red-600/30'}
          valueClass={kpis.pnlPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}
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
          return (
            <div
              key={dim.key}
              className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3.5"
            >
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                  <span className="text-base">{dim.icon}</span>
                  {dim.title}
                </h3>
                {attention > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30 animate-pulse">
                    ⚠ {attention}
                  </span>
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
                      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className={'h-full rounded-full ' + tone.bar} style={{ width: `${pct}%` }} />
                      </div>
                      <button
                        onClick={() =>
                          openModal(
                            `${dim.title} · ${band.label}`,
                            'Pushed orders matching this slab — full breakdown',
                            br
                          )
                        }
                        disabled={br.length === 0}
                        className={
                          'min-w-[2.5rem] text-center px-2 py-0.5 rounded-md text-[13px] font-bold tabular-nums transition-transform ' +
                          (br.length === 0
                            ? 'text-purple-500/40 cursor-default'
                            : `${tone.pill} hover:scale-110 cursor-pointer`)
                        }
                        title={br.length ? 'Click to view orders' : 'No orders'}
                      >
                        {br.length}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Orders Pushed table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-white">Orders Pushed</h3>
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
          <span className="text-[11px] font-semibold text-purple-300/70">
            {displayRows.length.toLocaleString('en-IN')}
            {displayRows.length !== rows.length ? ` / ${rows.length.toLocaleString('en-IN')}` : ''} rows
          </span>
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
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  accent: string;
  valueClass?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${accent} backdrop-blur-xl p-4`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-200/70">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}
