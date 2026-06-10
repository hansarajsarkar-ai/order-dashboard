'use client';

import { useEffect, useMemo, useState } from 'react';
import DetailsModal from './DetailsModal';

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

const TONE: Record<Tone, { dot: string; text: string; ring: string; bar: string }> = {
  good: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'hover:border-emerald-400/50', bar: 'bg-emerald-400/70' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'hover:border-amber-400/50', bar: 'bg-amber-400/70' },
  bad: { dot: 'bg-orange-400', text: 'text-orange-300', ring: 'hover:border-orange-400/50', bar: 'bg-orange-400/70' },
  critical: { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'hover:border-rose-400/50', bar: 'bg-rose-400/70' },
};

function numOf(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number') return true;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return true;
  return false;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isNumericLike(v)) {
    const n = Number(v);
    if (Number.isInteger(n)) return n.toLocaleString('en-IN');
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  return String(v);
}

function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function OrdersPushed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; subtitle: string; rows: Row[] } | null>(null);

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
          setColumns(d.columns || []);
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // KPI roll-up.
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

  // Pre-bucket rows for each dimension's bands.
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

  const openModal = (dimTitle: string, bandLabel: string, bandRows: Row[]) => {
    setModal({
      title: `${dimTitle} · ${bandLabel}`,
      subtitle: 'Pushed orders matching this slab — full P&L breakdown',
      rows: bandRows,
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Breakdown alert cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buckets.map(({ dim, bandRows }) => {
          const total = bandRows.reduce((s, br) => s + br.length, 0);
          return (
            <div
              key={dim.key}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-lg">{dim.icon}</span>
                  {dim.title}
                </h3>
                <span className="text-[11px] font-semibold text-purple-300/70">
                  {total.toLocaleString('en-IN')} orders
                </span>
              </div>
              <div className="space-y-2">
                {dim.bands.map((band, i) => {
                  const br = bandRows[i];
                  const pct = total > 0 ? (br.length * 100) / total : 0;
                  const tone = TONE[band.tone];
                  return (
                    <div
                      key={band.label}
                      className={
                        'group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 transition-colors ' +
                        tone.ring
                      }
                    >
                      <span className={'w-2 h-2 rounded-full shrink-0 ' + tone.dot} />
                      <span className="text-sm font-medium text-purple-100 w-20 shrink-0">{band.label}</span>
                      {/* mini bar */}
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={'h-full rounded-full ' + tone.bar} style={{ width: `${pct}%` }} />
                      </div>
                      <button
                        onClick={() => openModal(dim.title, band.label, br)}
                        disabled={br.length === 0}
                        className={
                          'min-w-[3rem] text-right text-base font-bold tabular-nums transition-transform ' +
                          (br.length === 0
                            ? 'text-purple-500/40 cursor-default'
                            : `${tone.text} hover:scale-110 hover:underline cursor-pointer`)
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold text-white">Orders Pushed</h3>
          <span className="text-[11px] font-semibold text-purple-300/70">
            {rows.length.toLocaleString('en-IN')} rows
          </span>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-purple-300/70 text-sm">No pushed orders.</div>
          ) : (
            <table className="text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-2 text-left font-semibold text-purple-200 bg-slate-900/95 border-b border-white/15 whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.04] even:bg-white/[0.015]">
                    {columns.map((c) => {
                      const v = r[c];
                      const num = isNumericLike(v);
                      return (
                        <td
                          key={c}
                          className={
                            'px-3 py-1.5 border-b border-white/5 whitespace-nowrap text-purple-100/90 ' +
                            (num ? 'text-right tabular-nums' : 'text-left')
                          }
                        >
                          {fmtCell(v)}
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
