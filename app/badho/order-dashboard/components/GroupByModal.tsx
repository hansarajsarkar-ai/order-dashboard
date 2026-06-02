'use client';

import { useMemo, useState } from 'react';

export interface GroupableOrderRow {
  poNumber: string;
  status?: string;
  orderStatus?: string;
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
}

export type GroupDimension = 'buyer' | 'buyerState' | 'buyerDistrict';

interface GroupByModalProps {
  open: boolean;
  dimension: GroupDimension;
  rows: GroupableOrderRow[];
  contextLabel?: string;
  onClose: () => void;
}

interface GroupAgg {
  key: string;
  label: string;
  phone: string | null;
  state: string | null;
  district: string | null;
  orders: number;
  buyers: number;
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

type SortKey =
  | 'label'
  | 'orders'
  | 'buyers'
  | 'poAmount'
  | 'paidAmount'
  | 'coupon'
  | 'wallet'
  | 'sellerDiscount'
  | 'badhoDiscount'
  | 'cod'
  | 'refund'
  | 'aov';

type SortDir = 'asc' | 'desc';

const num = (x: number | null | undefined): number => Number(x) || 0;

const money = (n: number): string =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface ColumnDef {
  key: SortKey;
  label: string;
  numeric: boolean;
  showFor?: GroupDimension[];
}

const TITLE_BY_DIM: Record<GroupDimension, string> = {
  buyer: 'Grouped by Buyer',
  buyerState: 'Buyer State Wise',
  buyerDistrict: 'Buyer District Wise',
};

export default function GroupByModal({
  open,
  dimension,
  rows,
  contextLabel,
  onClose,
}: GroupByModalProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('orders');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const showBuyers = dimension === 'buyerState' || dimension === 'buyerDistrict';
  const showState = dimension === 'buyerDistrict';

  const columns = useMemo<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [
      { key: 'label', label: TITLE_LABEL_BY_DIM(dimension), numeric: false },
    ];
    if (showState) cols.push({ key: 'label', label: 'State', numeric: false });
    cols.push({ key: 'orders', label: 'Orders', numeric: true });
    if (showBuyers) cols.push({ key: 'buyers', label: 'Buyers', numeric: true });
    cols.push(
      { key: 'poAmount', label: 'PO Amount', numeric: true },
      { key: 'paidAmount', label: 'Paid', numeric: true },
      { key: 'coupon', label: 'Coupon', numeric: true },
      { key: 'wallet', label: 'Wallet', numeric: true },
      { key: 'sellerDiscount', label: 'Seller Disc.', numeric: true },
      { key: 'badhoDiscount', label: 'Badho Disc.', numeric: true },
      { key: 'cod', label: 'COD', numeric: true },
      { key: 'refund', label: 'Refund', numeric: true },
      { key: 'aov', label: 'AOV', numeric: true },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, showBuyers, showState]);

  const groups = useMemo<GroupAgg[]>(() => {
    const map = new Map<string, GroupAgg>();
    const buyerSets = new Map<string, Set<string>>();

    for (const r of rows) {
      let key: string;
      let label: string;
      if (dimension === 'buyer') {
        key = r.buyerBusinessName || r.buyerPhone || '(unknown)';
        label = key;
      } else if (dimension === 'buyerState') {
        key = r.buyerState || '(unknown)';
        label = key;
      } else {
        key = r.buyerDistrict || '(unknown)';
        label = key;
      }

      let g = map.get(key);
      if (!g) {
        g = {
          key,
          label,
          phone: r.buyerPhone ?? null,
          state: r.buyerState ?? null,
          district: r.buyerDistrict ?? null,
          orders: 0,
          buyers: 0,
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
    }

    const out: GroupAgg[] = [];
    for (const g of map.values()) {
      g.buyers = buyerSets.get(g.key)?.size ?? 0;
      g.aov = g.orders > 0 ? g.poAmount / g.orders : 0;
      out.push(g);
    }
    return out;
  }, [rows, dimension]);

  const view = useMemo<GroupAgg[]>(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? groups.filter((g) => g.label.toLowerCase().includes(q))
      : groups.slice();

    const dirMul = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortKey === 'label') {
        return a.label.localeCompare(b.label) * dirMul;
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      if (av === bv) return a.label.localeCompare(b.label);
      return (av - bv) * dirMul;
    });
    return filtered;
  }, [groups, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = {
      orders: 0,
      buyers: 0,
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
    for (const g of view) {
      t.orders += g.orders;
      t.buyers += g.buyers;
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

  if (!open) return null;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'label' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey): string => {
    if (key !== sortKey) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const exportCsv = () => {
    const header = ['Group'];
    if (showState) header.push('State');
    header.push('Orders');
    if (showBuyers) header.push('Buyers');
    header.push(
      'PO Amount',
      'Paid',
      'Coupon',
      'Wallet',
      'Seller Discount',
      'Badho Discount',
      'COD',
      'Refund',
      'AOV',
    );

    const esc = (v: string | number): string => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines: string[] = [header.map(esc).join(',')];
    for (const g of view) {
      const cells: (string | number)[] = [g.label];
      if (showState) cells.push(g.state ?? '');
      cells.push(g.orders);
      if (showBuyers) cells.push(g.buyers);
      cells.push(
        g.poAmount,
        g.paidAmount,
        g.coupon,
        g.wallet,
        g.sellerDiscount,
        g.badhoDiscount,
        g.cod,
        g.refund,
        Number(g.aov.toFixed(2)),
      );
      lines.push(cells.map(esc).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group-by-${dimension}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const labelHeader = TITLE_LABEL_BY_DIM(dimension);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[92vw] max-w-[1100px] h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60 px-5 py-4 flex items-start justify-between border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 truncate">
              {TITLE_BY_DIM[dimension]}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {contextLabel ? `${contextLabel} · ` : ''}
              {view.length.toLocaleString('en-IN')} groups ·{' '}
              {totals.orders.toLocaleString('en-IN')} orders
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${labelHeader.toLowerCase()}…`}
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
                {columns.map((c, i) => {
                  const isLabelCol = i === 0;
                  const active = c.key === sortKey;
                  return (
                    <th
                      key={`${c.key}-${i}`}
                      onClick={() => toggleSort(c.key)}
                      className={[
                        'sticky top-0 z-10 bg-slate-100 px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none',
                        c.numeric ? 'text-right' : 'text-left',
                        isLabelCol ? 'left-0 z-20' : '',
                      ].join(' ')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.numeric ? (
                          <>
                            <span
                              className={active ? 'text-purple-600' : 'text-slate-300'}
                            >
                              {arrow(c.key)}
                            </span>
                            {c.label}
                          </>
                        ) : (
                          <>
                            {c.label}
                            <span
                              className={active ? 'text-purple-600' : 'text-slate-300'}
                            >
                              {arrow(c.key)}
                            </span>
                          </>
                        )}
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
                    <td
                      className={`sticky left-0 z-[1] ${zebra} px-2.5 py-2 font-medium text-slate-900 whitespace-nowrap max-w-[260px] truncate`}
                      title={g.label}
                    >
                      {g.label}
                    </td>
                    {showState && (
                      <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">
                        {g.state ?? '—'}
                      </td>
                    )}
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {g.orders.toLocaleString('en-IN')}
                    </td>
                    {showBuyers && (
                      <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                        {g.buyers.toLocaleString('en-IN')}
                      </td>
                    )}
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-800">
                      {money(g.poAmount)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.paidAmount)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.coupon)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.wallet)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.sellerDiscount)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.badhoDiscount)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.cod)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                      {money(g.refund)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-800">
                      {money(g.aov)}
                    </td>
                  </tr>
                );
              })}
              {view.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-2.5 py-10 text-center text-slate-400"
                  >
                    No groups match your search.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap">
                  Total · {view.length.toLocaleString('en-IN')}{' '}
                  {view.length === 1 ? 'group' : 'groups'}
                </td>
                {showState && (
                  <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap" />
                )}
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {totals.orders.toLocaleString('en-IN')}
                </td>
                {showBuyers && (
                  <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                    {totals.buyers.toLocaleString('en-IN')}
                  </td>
                )}
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.poAmount)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.paidAmount)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.coupon)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.wallet)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.sellerDiscount)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.badhoDiscount)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.cod)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.refund)}
                </td>
                <td className="sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white text-right tabular-nums whitespace-nowrap">
                  {money(totals.aov)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function TITLE_LABEL_BY_DIM(dimension: GroupDimension): string {
  switch (dimension) {
    case 'buyer':
      return 'Buyer';
    case 'buyerState':
      return 'State';
    case 'buyerDistrict':
      return 'District';
  }
}
