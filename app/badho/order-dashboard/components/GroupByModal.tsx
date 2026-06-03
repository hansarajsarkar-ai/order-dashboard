'use client';

import { useMemo, useState } from 'react';
import GroupByMenu, { DIM_LABEL, orderDims, type GroupDimension } from './GroupByMenu';

export type { GroupDimension } from './GroupByMenu';

export interface GroupableOrderRow {
  poNumber: string;
  status?: string | null;
  orderStatus?: string | null;
  poAmount?: number | null;
  paidAmount?: number | null;
  CoupanAmount?: number | null;
  appliedWalletAmount?: number | null;
  discountBySeller?: number | null;
  PaymentOptionDiscountByBadho?: number | null;
  codAmountToBeCollected?: number | null;
  RefundAmount?: number | null;
  buyerBusinessName?: string | null;
  buyerPhone?: string | null;
  buyerState?: string | null;
  buyerDistrict?: string | null;
  sellerBusinessName?: string | null;
  sellerPhone?: string | null;
  deliveryStatus?: string | null;
  MarkedpendingTime?: string | null;
  markedPendingTime?: string | null;
}

interface GroupByModalProps {
  open: boolean;
  dimensions: GroupDimension[];
  rows: GroupableOrderRow[];
  contextLabel?: string;
  onClose: () => void;
  onChangeDimensions: (dims: GroupDimension[]) => void;
}

type MetricKey =
  | 'orders'
  | 'buyers'
  | 'sellers'
  | 'poAmount'
  | 'paidAmount'
  | 'coupon'
  | 'wallet'
  | 'sellerDiscount'
  | 'badhoDiscount'
  | 'cod'
  | 'refund'
  | 'aov';

interface GroupAgg {
  key: string;
  labels: string[]; // one per ordered dimension
  orders: number;
  buyers: number;
  sellers: number;
  poAmount: number;
  paidAmount: number;
  coupon: number;
  wallet: number;
  sellerDiscount: number;
  badhoDiscount: number;
  cod: number;
  refund: number;
  aov: number;
}

type SortDir = 'asc' | 'desc';
const SEP = '␟';
const num = (x: number | null | undefined): number => Number(x) || 0;
const money = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// Bucket a marked-pending timestamp into a "YYYY-MM" month label (chronologically sortable).
// Handles ISO strings (2026-05-13T…), "DD Mon YYYY …" display strings, and a Date fallback.
const monthBucket = (v: string | null | undefined): string => {
  if (!v) return '(not marked pending)';
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dm = /\b(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\b/.exec(s);
  if (dm) {
    const mm = MONTH_NUM[dm[2].slice(0, 3).toLowerCase()];
    if (mm) return `${dm[3]}-${mm}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return s;
};

const dimValue = (r: GroupableOrderRow, d: GroupDimension): string => {
  switch (d) {
    case 'orderStatus':
      return r.orderStatus || r.status || '(unknown)';
    case 'deliveryStatus':
      return r.deliveryStatus || '(no delivery status)';
    case 'markedPending':
      return monthBucket(r.MarkedpendingTime || r.markedPendingTime);
    case 'buyer':
      return r.buyerBusinessName || r.buyerPhone || '(unknown)';
    case 'seller':
      return r.sellerBusinessName || r.sellerPhone || '(unknown)';
    case 'buyerState':
      return r.buyerState || '(unknown)';
    case 'buyerDistrict':
      return r.buyerDistrict || '(unknown)';
  }
};

interface MetricCol {
  key: MetricKey;
  label: string;
}

export default function GroupByModal({
  open,
  dimensions,
  rows,
  contextLabel,
  onClose,
  onChangeDimensions,
}: GroupByModalProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('orders'); // 'dim<i>' or a MetricKey
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const dims = useMemo(() => orderDims(dimensions), [dimensions]);
  const showBuyers = !dims.includes('buyer');
  const showSellers = !dims.includes('seller');

  const metricCols = useMemo<MetricCol[]>(() => {
    const cols: MetricCol[] = [{ key: 'orders', label: 'Orders' }];
    if (showBuyers) cols.push({ key: 'buyers', label: 'Buyers' });
    if (showSellers) cols.push({ key: 'sellers', label: 'Sellers' });
    cols.push(
      { key: 'poAmount', label: 'PO Amount' },
      { key: 'paidAmount', label: 'Paid' },
      { key: 'coupon', label: 'Coupon' },
      { key: 'wallet', label: 'Wallet' },
      { key: 'sellerDiscount', label: 'Seller Disc.' },
      { key: 'badhoDiscount', label: 'Badho Disc.' },
      { key: 'cod', label: 'COD' },
      { key: 'refund', label: 'Refund' },
      { key: 'aov', label: 'AOV' },
    );
    return cols;
  }, [showBuyers, showSellers]);

  const groups = useMemo<GroupAgg[]>(() => {
    if (dims.length === 0) return [];
    const map = new Map<string, GroupAgg>();
    const buyerSets = new Map<string, Set<string>>();
    const sellerSets = new Map<string, Set<string>>();

    for (const r of rows) {
      const labels = dims.map((d) => dimValue(r, d));
      const key = labels.join(SEP);

      let g = map.get(key);
      if (!g) {
        g = {
          key,
          labels,
          orders: 0,
          buyers: 0,
          sellers: 0,
          poAmount: 0,
          paidAmount: 0,
          coupon: 0,
          wallet: 0,
          sellerDiscount: 0,
          badhoDiscount: 0,
          cod: 0,
          refund: 0,
          aov: 0,
        };
        map.set(key, g);
        buyerSets.set(key, new Set<string>());
        sellerSets.set(key, new Set<string>());
      }

      g.orders += 1;
      g.poAmount += num(r.poAmount);
      g.paidAmount += num(r.paidAmount);
      g.coupon += num(r.CoupanAmount);
      g.wallet += num(r.appliedWalletAmount);
      g.sellerDiscount += num(r.discountBySeller);
      g.badhoDiscount += num(r.PaymentOptionDiscountByBadho);
      g.cod += num(r.codAmountToBeCollected);
      g.refund += num(r.RefundAmount);

      const buyerId = r.buyerBusinessName || r.buyerPhone;
      if (buyerId) buyerSets.get(key)!.add(buyerId);
      const sellerId = r.sellerBusinessName || r.sellerPhone;
      if (sellerId) sellerSets.get(key)!.add(sellerId);
    }

    const out: GroupAgg[] = [];
    for (const g of map.values()) {
      g.buyers = buyerSets.get(g.key)?.size ?? 0;
      g.sellers = sellerSets.get(g.key)?.size ?? 0;
      g.aov = g.orders > 0 ? g.poAmount / g.orders : 0;
      out.push(g);
    }
    return out;
  }, [rows, dims]);

  const view = useMemo<GroupAgg[]>(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? groups.filter((g) => g.labels.some((l) => l.toLowerCase().includes(q)))
      : groups.slice();

    const dirMul = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortKey.startsWith('dim')) {
        const idx = Number(sortKey.slice(3));
        const cmp = (a.labels[idx] || '').localeCompare(b.labels[idx] || '');
        return cmp * dirMul;
      }
      const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      if (av === bv) return a.labels.join(SEP).localeCompare(b.labels.join(SEP));
      return (av - bv) * dirMul;
    });
    return filtered;
  }, [groups, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t: Record<MetricKey, number> = {
      orders: 0, buyers: 0, sellers: 0, poAmount: 0, paidAmount: 0, coupon: 0,
      wallet: 0, sellerDiscount: 0, badhoDiscount: 0, cod: 0, refund: 0, aov: 0,
    };
    for (const g of view) {
      t.orders += g.orders;
      t.buyers += g.buyers;
      t.sellers += g.sellers;
      t.poAmount += g.poAmount;
      t.paidAmount += g.paidAmount;
      t.coupon += g.coupon;
      t.wallet += g.wallet;
      t.sellerDiscount += g.sellerDiscount;
      t.badhoDiscount += g.badhoDiscount;
      t.cod += g.cod;
      t.refund += g.refund;
    }
    t.aov = t.orders > 0 ? t.poAmount / t.orders : 0;
    return t;
  }, [view]);

  if (!open || dims.length === 0) return null;

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key.startsWith('dim') ? 'asc' : 'desc');
    }
  };

  const arrow = (key: string): string => {
    if (key !== sortKey) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const title = `Grouped by ${dims.map((d) => DIM_LABEL[d]).join(' › ')}`;

  const exportCsv = () => {
    const header = [...dims.map((d) => DIM_LABEL[d]), ...metricCols.map((c) => c.label)];
    const esc = (v: string | number): string => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [header.map(esc).join(',')];
    for (const g of view) {
      const cells: (string | number)[] = [...g.labels];
      for (const c of metricCols) {
        const v = (g as unknown as Record<string, number>)[c.key] ?? 0;
        cells.push(c.key === 'aov' ? Number(v.toFixed(2)) : v);
      }
      lines.push(cells.map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group-by-${dims.join('-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalColCount = dims.length + metricCols.length;
  const footCell = 'sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[94vw] max-w-[1200px] h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60 px-5 py-4 flex items-start justify-between gap-3 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 truncate">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {contextLabel ? `${contextLabel} · ` : ''}
              {view.length.toLocaleString('en-IN')} groups · {totals.orders.toLocaleString('en-IN')} orders
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GroupByMenu selected={dimensions} onChange={onChangeDimensions} align="right" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="shrink-0 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {dims.map((d, i) => {
                  const key = `dim${i}`;
                  const activeSort = key === sortKey;
                  return (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className={`sticky top-0 z-10 bg-slate-100 px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none text-left ${i === 0 ? 'left-0 z-20' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {DIM_LABEL[d]}
                        <span className={activeSort ? 'text-purple-600' : 'text-slate-300'}>{arrow(key)}</span>
                      </span>
                    </th>
                  );
                })}
                {metricCols.map((c) => {
                  const activeSort = c.key === sortKey;
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none text-right"
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        <span className={activeSort ? 'text-purple-600' : 'text-slate-300'}>{arrow(c.key)}</span>
                        {c.label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {view.map((g, ri) => {
                const zebra = ri % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                return (
                  <tr key={g.key} className={`${zebra} hover:bg-purple-50`}>
                    {g.labels.map((lab, i) => (
                      <td
                        key={i}
                        className={`px-2.5 py-2 text-slate-900 whitespace-nowrap max-w-[260px] truncate ${i === 0 ? `sticky left-0 z-[1] ${zebra} font-medium` : 'text-slate-600'}`}
                        title={lab}
                      >
                        {lab}
                      </td>
                    ))}
                    {metricCols.map((c) => {
                      const v = (g as unknown as Record<string, number>)[c.key] ?? 0;
                      const isCount = c.key === 'orders' || c.key === 'buyers' || c.key === 'sellers';
                      return (
                        <td key={c.key} className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                          {isCount ? v.toLocaleString('en-IN') : money(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {view.length === 0 && (
                <tr>
                  <td colSpan={totalColCount} className="px-2.5 py-10 text-center text-slate-400">
                    No groups match your search.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${footCell} left-0 z-30`}>
                  Total · {view.length.toLocaleString('en-IN')} {view.length === 1 ? 'group' : 'groups'}
                </td>
                {dims.slice(1).map((_, i) => (
                  <td key={i} className={footCell} />
                ))}
                {metricCols.map((c) => {
                  const v = totals[c.key];
                  const isCount = c.key === 'orders' || c.key === 'buyers' || c.key === 'sellers';
                  return (
                    <td key={c.key} className={`${footCell} text-right tabular-nums`}>
                      {isCount ? v.toLocaleString('en-IN') : money(v)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
