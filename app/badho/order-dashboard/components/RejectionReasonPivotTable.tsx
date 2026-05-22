'use client';

import { useEffect, useState, Fragment } from 'react';

interface DrilldownCell {
  count: number;
  amount: number;
}

interface PeriodMap {
  [comboKey: string]: DrilldownCell;
}

interface ReasonRow {
  reason: string;
  cells: Record<string, { count: number; amount: number }>;
  drilldown: Record<string, PeriodMap>;
  total: { count: number; amount: number };
}

interface ApiResponse {
  data: ReasonRow[];
  totals: {
    byPeriod: Record<string, { count: number; amount: number }>;
    byReason: Record<string, { count: number; amount: number }>;
    grand: { count: number; amount: number };
  };
  periods: string[];
  granularity: 'month' | 'week' | 'day';
  year: number;
  month?: number;
  timestamp: string;
}

interface OrderDetail {
  poNumber: string;
  MarkedpendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: string | number | null;
  poAmount: string | number | null;
  CoupanAmount: string | number | null;
  orderStatus: string | null;
  discountBySeller: number | null;
  PaymentOptionDiscountByBadho: number | null;
  appliedWalletAmount: string | number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatusDv: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  codAmountToBeCollected: string | number | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  deliveryStatusPo: string | null;
  reason_category: string;
}

interface ModalFilters {
  reason: string;
  periodKey: string | null;
  periodLabel: string;
  orderStatus?: string;
  deliveryStatus?: string;
  granularity: 'month' | 'week' | 'day';
  dayMonth?: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatAmount = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const formatNumber = (n: string | number | null | undefined) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return d;
  }
};

type CsvCell = string | number | null | undefined;
const downloadCSV = (filename: string, headers: string[], rows: CsvCell[][]) => {
  const escape = (v: CsvCell) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const periodLabel = (key: string, granularity: 'month' | 'week' | 'day', dayMonth?: number) => {
  if (granularity === 'month') {
    const [, mo] = key.split('-');
    return MONTH_NAMES[parseInt(mo) - 1] || key;
  }
  if (granularity === 'week') return `W${key}`;
  if (granularity === 'day') return `${MONTH_NAMES[(dayMonth || 1) - 1]} ${key}`;
  return key;
};

export default function RejectionReasonPivotTable() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [granularity, setGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [dayMonth, setDayMonth] = useState(new Date().getMonth() + 1);
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  // Modal state
  const [modalFilters, setModalFilters] = useState<ModalFilters | null>(null);
  const [modalData, setModalData] = useState<OrderDetail[] | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ year: String(year), granularity });
        if (granularity === 'day') params.set('month', String(dayMonth));
        const res = await fetch(`/api/rejection-reason-breakdown?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [year, granularity, dayMonth]);

  useEffect(() => {
    if (!modalFilters) return;
    const fetchOrders = async () => {
      try {
        setModalLoading(true);
        setModalError(null);
        const params = new URLSearchParams({ reason: modalFilters.reason, year: String(year) });
        if (modalFilters.periodKey) {
          if (modalFilters.granularity === 'month') params.set('month', modalFilters.periodKey);
          else if (modalFilters.granularity === 'week') params.set('week', modalFilters.periodKey);
          else if (modalFilters.granularity === 'day') {
            params.set('day', modalFilters.periodKey);
            if (modalFilters.dayMonth) params.set('dayMonth', String(modalFilters.dayMonth));
          }
        }
        if (modalFilters.orderStatus) params.set('orderStatus', modalFilters.orderStatus);
        if (modalFilters.deliveryStatus !== undefined) params.set('deliveryStatus', modalFilters.deliveryStatus);

        const res = await fetch(`/api/rejection-reason-orders?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch order details');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setModalData(json.data);
      } catch (err) {
        setModalError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setModalLoading(false);
      }
    };
    fetchOrders();
  }, [modalFilters, year]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeModal = () => {
    setModalFilters(null);
    setModalData(null);
    setModalSearch('');
  };

  const toggleExpand = (reason: string) => {
    const next = new Set(expandedReasons);
    if (next.has(reason)) next.delete(reason);
    else next.add(reason);
    setExpandedReasons(next);
  };

  const openModal = (
    reason: string,
    periodKey: string | null,
    pLabel: string,
    orderStatus?: string,
    deliveryStatus?: string
  ) => {
    setModalFilters({
      reason,
      periodKey,
      periodLabel: pLabel,
      orderStatus,
      deliveryStatus,
      granularity,
      dayMonth: granularity === 'day' ? dayMonth : undefined,
    });
    setModalSearch('');
  };

  // Filter modal data by search
  const filteredModalData = modalData && modalSearch.trim()
    ? modalData.filter((r) => {
        const q = modalSearch.toLowerCase();
        return (
          (r.poNumber || '').toLowerCase().includes(q) ||
          (r.sellerBusinessName || '').toLowerCase().includes(q) ||
          (r.sellerPhone || '').toLowerCase().includes(q) ||
          (r.buyerBusinessName || '').toLowerCase().includes(q) ||
          (r.buyerPhone || '').toLowerCase().includes(q) ||
          (r.awbNumber || '').toLowerCase().includes(q) ||
          (r.courierName || '').toLowerCase().includes(q) ||
          (r.rejectReason || '').toLowerCase().includes(q) ||
          (r.reasonAddedByBadhoTeam || '').toLowerCase().includes(q) ||
          (r.deliveryStatusPo || '').toLowerCase().includes(q) ||
          (r.deliveryStatusDv || '').toLowerCase().includes(q)
        );
      })
    : modalData;

  return (
    <>
      <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Rejection Reason Breakdown</h2>
            <p className="text-purple-300 text-sm mt-1">
              {granularity === 'month'
                ? `Click any reason to drill down · click any number for order details — ${year}`
                : granularity === 'week'
                ? `Week-by-week — ${year} (ISO week)`
                : `Day-by-day — ${MONTH_NAMES[dayMonth - 1]} ${year}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Month/Week/Day toggle */}
            <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
              {(['month', 'week', 'day'] as const).map((g) => {
                const active = granularity === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                        : 'text-purple-200 hover:bg-white/10'
                    }`}
                  >
                    {g === 'month' ? 'Month' : g === 'week' ? 'Week' : 'Day'}
                  </button>
                );
              })}
            </div>
            {granularity === 'day' && (
              <select
                value={dayMonth}
                onChange={(e) => setDayMonth(parseInt(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i + 1} className="bg-slate-900">
                    {name} {year}
                  </option>
                ))}
              </select>
            )}
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y} className="bg-slate-900">
                  {y}
                </option>
              ))}
            </select>
            {data && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{data.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(data.totals.grand.amount)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-8 py-12 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                <p className="text-purple-300">Loading rejection reason breakdown…</p>
              </div>
            </div>
          ) : error ? (
            <div className="px-8 py-12 text-center text-rose-300">Error: {error}</div>
          ) : !data || data.data.length === 0 ? (
            <div className="px-8 py-12 text-center text-purple-300">No data available for {year}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th
                    rowSpan={2}
                    className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[260px]"
                  >
                    Reason Category
                  </th>
                  {data.periods.map((p) => (
                    <th
                      key={p}
                      colSpan={2}
                      className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10"
                    >
                      {periodLabel(p, data.granularity, data.month)}
                    </th>
                  ))}
                  <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                    Total
                  </th>
                </tr>
                <tr className="bg-white/5 border-b border-white/10">
                  {data.periods.map((p) => (
                    <Fragment key={p}>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300">Count</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300 border-r border-white/10">
                        Amount
                      </th>
                    </Fragment>
                  ))}
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20">Count</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20 border-r border-white/10">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => {
                  const isExpanded = expandedReasons.has(row.reason);

                  const subRowKeys = new Set<string>();
                  for (const p of Object.keys(row.drilldown)) {
                    for (const combo of Object.keys(row.drilldown[p])) {
                      subRowKeys.add(combo);
                    }
                  }
                  const subRows = Array.from(subRowKeys).sort();

                  return (
                    <Fragment key={row.reason}>
                      {/* Parent reason row */}
                      <tr
                        onClick={() => toggleExpand(row.reason)}
                        className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-semibold">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-4 text-purple-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              ▸
                            </span>
                            <span>{row.reason}</span>
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-purple-200 tabular-nums">
                              {subRows.length} sub
                            </span>
                          </div>
                        </td>
                        {data.periods.map((p) => {
                          const cell = row.cells[p];
                          const has = !!cell?.count;
                          return (
                            <Fragment key={p}>
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (has) openModal(row.reason, p, periodLabel(p, data.granularity, data.month));
                                }}
                                className={`group/cell px-2 py-3 text-right text-purple-100 tabular-nums ${has ? 'cursor-pointer' : ''}`}
                              >
                                {cell?.count ? (
                                  <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                    {cell.count.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-purple-500/40">—</span>
                                )}
                              </td>
                              <td className="group/cell px-2 py-3 text-right text-purple-200/90 tabular-nums border-r border-white/10">
                                {cell?.amount ? (
                                  <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                    {formatAmount(cell.amount)}
                                  </span>
                                ) : (
                                  <span className="text-purple-500/40">—</span>
                                )}
                              </td>
                            </Fragment>
                          );
                        })}
                        {/* Total at END */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal(row.reason, null, 'All periods');
                          }}
                          className="group/cell px-2 py-3 text-right font-bold text-white tabular-nums bg-purple-500/15 cursor-pointer"
                        >
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                            {row.total.count.toLocaleString()}
                          </span>
                        </td>
                        <td className="group/cell px-2 py-3 text-right font-bold text-fuchsia-300 tabular-nums bg-purple-500/15 border-r border-white/10">
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                            {formatAmount(row.total.amount)}
                          </span>
                        </td>
                      </tr>

                      {/* Drill-down sub-rows */}
                      {isExpanded &&
                        subRows.map((sr) => {
                          const [orderStatus, deliveryStatus] = sr.split('|||');
                          let subTotalCount = 0;
                          let subTotalAmount = 0;
                          for (const p of Object.keys(row.drilldown)) {
                            const cell = row.drilldown[p]?.[sr];
                            if (cell) {
                              subTotalCount += cell.count;
                              subTotalAmount += cell.amount;
                            }
                          }
                          return (
                            <tr
                              key={`${row.reason}-${sr}`}
                              className="bg-slate-950/40 border-b border-white/5 text-xs hover:bg-fuchsia-500/10 transition-colors"
                            >
                              <td className="px-4 py-2 sticky left-0 bg-slate-950/80 z-10 border-r border-white/10">
                                <div className="pl-8 flex items-center gap-2">
                                  <span className="text-purple-500">└</span>
                                  <span className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-200 font-semibold text-[10px]">
                                      {orderStatus}
                                    </span>
                                    <span className="text-purple-500/50">+</span>
                                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-200 font-semibold text-[10px]">
                                      {deliveryStatus}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              {data.periods.map((p) => {
                                const cell = row.drilldown[p]?.[sr];
                                const has = !!cell?.count;
                                return (
                                  <Fragment key={p}>
                                    <td
                                      onClick={() => has && openModal(row.reason, p, periodLabel(p, data.granularity, data.month), orderStatus, deliveryStatus)}
                                      className={`group/cell px-2 py-2 text-right text-purple-200/80 tabular-nums ${has ? 'cursor-pointer' : ''}`}
                                    >
                                      {cell?.count ? (
                                        <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                          {cell.count.toLocaleString()}
                                        </span>
                                      ) : (
                                        <span className="text-purple-500/30">—</span>
                                      )}
                                    </td>
                                    <td className="group/cell px-2 py-2 text-right text-purple-300/70 tabular-nums border-r border-white/10">
                                      {cell?.amount ? (
                                        <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                          {formatAmount(cell.amount)}
                                        </span>
                                      ) : (
                                        <span className="text-purple-500/30">—</span>
                                      )}
                                    </td>
                                  </Fragment>
                                );
                              })}
                              {/* Sub-row Total at END */}
                              <td
                                onClick={() => subTotalCount && openModal(row.reason, null, 'All periods', orderStatus, deliveryStatus)}
                                className={`group/cell px-2 py-2 text-right text-purple-100 tabular-nums bg-purple-500/15 ${subTotalCount ? 'cursor-pointer' : ''}`}
                              >
                                <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                  {subTotalCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="group/cell px-2 py-2 text-right text-fuchsia-300/90 tabular-nums bg-purple-500/15 border-r border-white/10">
                                <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_12px_rgba(217,70,239,0.85)]">
                                  {formatAmount(subTotalAmount)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}

                {/* Grand Total row */}
                <tr className="bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-indigo-500/20 border-t-2 border-fuchsia-500/50 font-bold">
                  <td className="px-4 py-3 sticky left-0 bg-slate-900/95 z-10 border-r border-white/10 text-white">
                    Grand Total
                  </td>
                  {data.periods.map((p) => {
                    const t = data.totals.byPeriod[p];
                    return (
                      <Fragment key={p}>
                        <td className="group/cell px-2 py-3 text-right text-white tabular-nums">
                          {t?.count ? (
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                              {t.count.toLocaleString()}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="group/cell px-2 py-3 text-right text-fuchsia-200 tabular-nums border-r border-white/10">
                          {t?.amount ? (
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                              {formatAmount(t.amount)}
                            </span>
                          ) : '—'}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="group/cell px-2 py-3 text-right text-white tabular-nums bg-purple-500/25">
                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                      {data.totals.grand.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="group/cell px-2 py-3 text-right text-fuchsia-200 tabular-nums bg-purple-500/25 border-r border-white/10">
                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.3] group-hover/cell:text-fuchsia-100 group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95)]">
                      {formatAmount(data.totals.grand.amount)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="px-8 py-3 border-t border-white/10 bg-white/5 text-xs text-purple-300/70 flex items-center justify-between">
            <span>
              {data.data.length} reason categories · {data.periods.length}{' '}
              {data.granularity === 'month' ? 'months' : data.granularity === 'week' ? 'weeks' : 'days'} ·{' '}
              {data.totals.grand.count.toLocaleString()} total orders
            </span>
            <span>Last updated: {new Date(data.timestamp).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {modalFilters && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-gradient-to-br from-slate-900 to-purple-950/60 border border-purple-500/30 rounded-2xl max-w-[95vw] w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-purple-500/30 bg-gradient-to-r from-purple-900/50 to-fuchsia-900/30 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {modalFilters.reason}
                  <span className="text-purple-300 text-base font-normal"> · {modalFilters.periodLabel} {year}</span>
                </h3>
                <p className="text-purple-300/70 text-sm mt-1 flex items-center gap-2 flex-wrap">
                  {modalFilters.orderStatus && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-200 font-semibold text-[10px]">
                      Order: {modalFilters.orderStatus}
                    </span>
                  )}
                  {modalFilters.deliveryStatus !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-200 font-semibold text-[10px]">
                      Delivery: {modalFilters.deliveryStatus || 'N/A'}
                    </span>
                  )}
                  {modalData && <span>· {filteredModalData?.length || 0} of {modalData.length} orders</span>}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-purple-300 hover:text-white text-2xl leading-none p-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-3 border-b border-purple-500/20 bg-slate-900/50 flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Search PO, buyer, seller, AWB, reject reason…"
                className="flex-1 min-w-[280px] px-3 py-2 text-sm bg-purple-950/40 border border-purple-500/30 text-white placeholder-purple-400/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
              {modalData && filteredModalData && filteredModalData.length > 0 && (
                <button
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-semibold hover:shadow-[0_0_18px_rgba(217,70,239,0.4)]"
                  onClick={() => {
                    const headers = [
                      'poNumber', 'MarkedpendingTime', 'paymentDate', 'paymentEvent',
                      'sellerPhone', 'sellerBusinessName', 'buyerPhone', 'buyerBusinessName',
                      'paidAmount', 'poAmount', 'CoupanAmount', 'orderStatus',
                      'discountBySeller', 'PaymentOptionDiscountByBadho',
                      'appliedWalletAmount', 'PaymentOption',
                      'awbNumber', 'courierName', 'deliveryStatus (dv)',
                      'RefundIntiatedTime', 'RefundCompletedTime',
                      'codAmountToBeCollected', 'rejectReason', 'rejectedBy',
                      'reasonAddedByBadhoTeam', 'deliveryStatus (po)', 'reason_category',
                    ];
                    const rows: CsvCell[][] = filteredModalData.map((r) => [
                      r.poNumber, r.MarkedpendingTime, r.paymentDate, r.paymentEvent,
                      r.sellerPhone, r.sellerBusinessName, r.buyerPhone, r.buyerBusinessName,
                      r.paidAmount, r.poAmount, r.CoupanAmount, r.orderStatus,
                      r.discountBySeller, r.PaymentOptionDiscountByBadho,
                      r.appliedWalletAmount, r.PaymentOption,
                      r.awbNumber, r.courierName, r.deliveryStatusDv,
                      r.RefundIntiatedTime, r.RefundCompletedTime,
                      r.codAmountToBeCollected, r.rejectReason, r.rejectedBy,
                      r.reasonAddedByBadhoTeam, r.deliveryStatusPo, r.reason_category,
                    ]);
                    const fname = `rejection-${modalFilters.reason.replace(/\s+/g, '-')}-${modalFilters.periodKey || 'all'}-${year}.csv`;
                    downloadCSV(fname, headers, rows);
                  }}
                >
                  ↓ Download CSV
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {modalLoading ? (
                <div className="px-8 py-16 text-center text-purple-300 animate-pulse">Loading order details…</div>
              ) : modalError ? (
                <div className="px-8 py-16 text-center text-rose-300">Error: {modalError}</div>
              ) : !filteredModalData || filteredModalData.length === 0 ? (
                <div className="px-8 py-16 text-center text-purple-300">
                  {modalSearch ? `No matches for "${modalSearch}"` : 'No orders found'}
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10 bg-purple-950/95 border-b border-purple-500/40">
                    <tr>
                      {[
                        'poNumber', 'MarkedpendingTime', 'paymentDate', 'paymentEvent',
                        'sellerPhone', 'sellerBusinessName', 'buyerPhone', 'buyerBusinessName',
                        'paidAmount', 'poAmount', 'CoupanAmount', 'orderStatus',
                        'discountBySeller', 'PaymentOptionDiscountByBadho',
                        'appliedWalletAmount', 'PaymentOption',
                        'awbNumber', 'courierName', 'deliveryStatus (dv)',
                        'RefundIntiatedTime', 'RefundCompletedTime',
                        'codAmountToBeCollected', 'rejectReason', 'rejectedBy',
                        'reasonAddedByBadhoTeam', 'deliveryStatus (po)', 'reason_category',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-2 py-2 text-left font-semibold text-purple-200 whitespace-nowrap border-r border-purple-500/20"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalData.slice(0, 2000).map((r, idx) => (
                      <tr key={`${r.poNumber}-${idx}`} className="border-b border-purple-500/10 hover:bg-fuchsia-500/15 align-top">
                        <td className="px-2 py-1.5 text-white tabular-nums font-semibold whitespace-nowrap border-r border-purple-500/10">{r.poNumber || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{r.MarkedpendingTime ? new Date(r.MarkedpendingTime).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{formatDate(r.paymentDate)}</td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{r.paymentEvent || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{r.sellerPhone || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-100 whitespace-nowrap border-r border-purple-500/10">{r.sellerBusinessName || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{r.buyerPhone || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-100 whitespace-nowrap border-r border-purple-500/10">{r.buyerBusinessName || '—'}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap border-r border-purple-500/10">{formatNumber(r.paidAmount)}</td>
                        <td className="px-2 py-1.5 text-right text-white tabular-nums whitespace-nowrap border-r border-purple-500/10">{formatNumber(r.poAmount)}</td>
                        <td className="px-2 py-1.5 text-right text-fuchsia-300 tabular-nums whitespace-nowrap border-r border-purple-500/10">{formatNumber(r.CoupanAmount)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-r border-purple-500/10">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200">{r.orderStatus || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{r.discountBySeller != null && Number(r.discountBySeller) !== 0 ? `₹${Number(r.discountBySeller).toLocaleString('en-IN')}` : '0'}</td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{r.PaymentOptionDiscountByBadho != null && Number(r.PaymentOptionDiscountByBadho) !== 0 ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN')}` : '0'}</td>
                        <td className="px-2 py-1.5 text-right text-cyan-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{formatNumber(r.appliedWalletAmount)}</td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{r.PaymentOption || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{r.awbNumber || '—'}</td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{r.courierName || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-r border-purple-500/10">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-200">{r.deliveryStatusDv || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-orange-200 whitespace-nowrap border-r border-purple-500/10">{formatDate(r.RefundIntiatedTime)}</td>
                        <td className="px-2 py-1.5 text-emerald-200 whitespace-nowrap border-r border-purple-500/10">{formatDate(r.RefundCompletedTime)}</td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">{formatNumber(r.codAmountToBeCollected)}</td>
                        <td className="px-2 py-1.5 text-rose-200 max-w-[240px] border-r border-purple-500/10" title={r.rejectReason || ''}>
                          <div className="line-clamp-2">{r.rejectReason || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">{r.rejectedBy || '—'}</td>
                        <td className="px-2 py-1.5 text-amber-200 max-w-[240px] border-r border-purple-500/10" title={r.reasonAddedByBadhoTeam || ''}>
                          <div className="line-clamp-2">{r.reasonAddedByBadhoTeam || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-r border-purple-500/10">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-200">{r.deliveryStatusPo || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/15 text-fuchsia-200">{r.reason_category || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {modalData && filteredModalData && filteredModalData.length > 2000 && (
              <div className="px-6 py-2 border-t border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
                Showing first 2,000 of {filteredModalData.length.toLocaleString()} rows — CSV includes everything.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
