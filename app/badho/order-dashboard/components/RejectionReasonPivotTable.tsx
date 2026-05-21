'use client';

import { useEffect, useState, Fragment } from 'react';

interface DrilldownCell {
  count: number;
  amount: number;
}

interface MonthData {
  [comboKey: string]: DrilldownCell;
}

interface ReasonRow {
  reason: string;
  months: Record<string, { count: number; amount: number }>;
  drilldown: Record<string, MonthData>;
  total: { count: number; amount: number };
}

interface ApiResponse {
  data: ReasonRow[];
  totals: {
    byMonth: Record<string, { count: number; amount: number }>;
    byReason: Record<string, { count: number; amount: number }>;
    grand: { count: number; amount: number };
  };
  year: number;
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
  month: string | null;
  monthLabel: string;
  orderStatus?: string;
  deliveryStatus?: string;
}

const REASON_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'Delivery Partner SLA Breach': { bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/30', accent: 'bg-rose-500' },
  'Rejected due to RTO': { bg: 'bg-orange-500/10', text: 'text-orange-300', border: 'border-orange-500/30', accent: 'bg-orange-500' },
  'Brand SLA Breach': { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30', accent: 'bg-amber-500' },
  'Serviceability Issue': { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/30', accent: 'bg-cyan-500' },
  'Address Issue': { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/30', accent: 'bg-violet-500' },
  'Other Reasons': { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30', accent: 'bg-slate-500' },
};

const getReasonColor = (reason: string) =>
  REASON_COLORS[reason] || { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30', accent: 'bg-slate-500' };

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

const CLICKABLE_CELL =
  'cursor-pointer transition-all duration-150 hover:bg-fuchsia-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_0_2px_rgba(232,121,249,0.9)] hover:scale-[1.04]';

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

export default function RejectionReasonPivotTable() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
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
        const res = await fetch(`/api/rejection-reason-breakdown?year=${year}`);
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
  }, [year]);

  useEffect(() => {
    if (!modalFilters) return;
    const fetchOrders = async () => {
      try {
        setModalLoading(true);
        setModalError(null);
        const params = new URLSearchParams({
          reason: modalFilters.reason,
          year: String(year),
        });
        if (modalFilters.month) params.set('month', modalFilters.month);
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
      if (e.key === 'Escape') {
        setModalFilters(null);
        setModalData(null);
        setModalSearch('');
      }
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
    const newExpanded = new Set(expandedReasons);
    if (newExpanded.has(reason)) newExpanded.delete(reason);
    else newExpanded.add(reason);
    setExpandedReasons(newExpanded);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/90 to-purple-950/40 backdrop-blur-md p-8 text-center">
        <div className="text-purple-300 animate-pulse">Loading rejection reason breakdown…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
        <div className="font-semibold mb-1">Error loading data</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/90 to-purple-950/40 backdrop-blur-md p-8 text-center text-purple-300">
        No data available for {year}
      </div>
    );
  }

  const months = Array.from(new Set(data.data.flatMap((r) => Object.keys(r.months)))).sort();
  const monthHeaders = months.map((m) => {
    const [yr, mo] = m.split('-');
    const label = new Date(`${yr}-${mo}-01`).toLocaleString('default', { month: 'short' });
    return { key: m, label };
  });

  const openModal = (
    reason: string,
    monthKey: string | null,
    monthLabel: string,
    orderStatus?: string,
    deliveryStatus?: string
  ) => {
    setModalFilters({ reason, month: monthKey, monthLabel, orderStatus, deliveryStatus });
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
      <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/95 via-purple-950/30 to-slate-900/95 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/30 to-fuchsia-900/20 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              Rejection Reason Breakdown
            </h2>
            <p className="text-purple-300/70 text-sm mt-1">
              Rejected D2R orders (THIRD_PARTY × INTERCITY) grouped by reason · click any row to drill down · click any number for full order details
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-purple-300/60 uppercase tracking-wider">Grand Total</div>
              <div className="text-lg font-bold text-white">
                {data.totals.grand.count.toLocaleString()} orders · {formatAmount(data.totals.grand.amount)}
              </div>
            </div>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="bg-purple-900/40 border border-purple-500/40 text-white px-3 py-2 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y} className="bg-slate-900">
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-purple-950/60 border-b border-purple-500/30">
                <th
                  rowSpan={2}
                  className="px-4 py-3 text-left text-purple-200 font-semibold sticky left-0 z-20 bg-purple-950/90 border-r border-purple-500/30 min-w-[260px]"
                >
                  Reason Category
                </th>
                <th colSpan={2} className="px-4 py-2 text-center text-fuchsia-300 font-bold border-r border-purple-500/30 bg-fuchsia-950/40">
                  Total
                </th>
                {monthHeaders.map((mh) => (
                  <th
                    key={mh.key}
                    colSpan={2}
                    className="px-3 py-2 text-center text-purple-200 font-semibold border-r border-purple-500/20"
                  >
                    {mh.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-purple-950/40 border-b border-purple-500/30 text-xs">
                <th className="px-3 py-2 text-right text-fuchsia-300 font-semibold border-r border-purple-500/20 bg-fuchsia-950/30">
                  Count
                </th>
                <th className="px-3 py-2 text-right text-fuchsia-300 font-semibold border-r border-purple-500/30 bg-fuchsia-950/30">
                  Amount
                </th>
                {monthHeaders.map((mh) => (
                  <Fragment key={mh.key}>
                    <th className="px-2 py-2 text-right text-purple-300/80 font-semibold">Count</th>
                    <th className="px-2 py-2 text-right text-purple-300/80 font-semibold border-r border-purple-500/20">
                      Amount
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => {
                const color = getReasonColor(row.reason);
                const isExpanded = expandedReasons.has(row.reason);

                const subRowKeys = new Set<string>();
                for (const monthKey of Object.keys(row.drilldown)) {
                  for (const combo of Object.keys(row.drilldown[monthKey])) {
                    subRowKeys.add(combo);
                  }
                }
                const subRows = Array.from(subRowKeys).sort();

                return (
                  <Fragment key={row.reason}>
                    <tr className={`border-b border-purple-500/10 transition-colors ${color.bg} hover:bg-purple-800/20`}>
                      <td
                        onClick={() => toggleExpand(row.reason)}
                        className={`px-4 py-3 sticky left-0 z-10 ${color.bg} border-r border-purple-500/20 cursor-pointer`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${color.accent}`}></span>
                          <span className={`text-xs ${color.text} transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          <span className={`font-semibold ${color.text}`}>{row.reason}</span>
                        </div>
                      </td>
                      <td
                        onClick={() => openModal(row.reason, null, 'All months')}
                        className={`px-3 py-3 text-right font-bold text-white border-r border-purple-500/10 tabular-nums underline decoration-fuchsia-400/40 decoration-dotted underline-offset-4 ${CLICKABLE_CELL}`}
                        title="Click to view all orders for this reason"
                      >
                        {row.total.count.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-fuchsia-300 border-r border-purple-500/30 tabular-nums">
                        {formatAmount(row.total.amount)}
                      </td>
                      {monthHeaders.map((mh) => {
                        const cell = row.months[mh.key];
                        return (
                          <Fragment key={mh.key}>
                            <td
                              onClick={() => cell?.count && openModal(row.reason, mh.key, mh.label)}
                              className={`px-2 py-3 text-right text-purple-100 tabular-nums ${cell?.count ? `font-semibold underline decoration-fuchsia-400/30 decoration-dotted underline-offset-4 ${CLICKABLE_CELL}` : ''}`}
                              title={cell?.count ? `Click to view ${cell.count} orders for ${row.reason} in ${mh.label}` : ''}
                            >
                              {cell?.count?.toLocaleString() || <span className="text-purple-500/40">—</span>}
                            </td>
                            <td className="px-2 py-3 text-right text-purple-200/90 tabular-nums border-r border-purple-500/10">
                              {cell?.amount ? formatAmount(cell.amount) : <span className="text-purple-500/40">—</span>}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>

                    {isExpanded &&
                      subRows.map((sr) => {
                        const [orderStatus, deliveryStatus] = sr.split('|||');
                        return (
                          <tr key={`${row.reason}-${sr}`} className="bg-slate-950/40 border-b border-purple-500/5 text-xs">
                            <td className="px-4 py-2 sticky left-0 bg-slate-950/80 z-10 border-r border-purple-500/10">
                              <div className="pl-8 flex items-center gap-2">
                                <span className="text-purple-500">└</span>
                                <span className="text-purple-300/90 flex items-center gap-2 flex-wrap">
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
                            {(() => {
                              let totalCount = 0;
                              let totalAmount = 0;
                              for (const monthKey of Object.keys(row.drilldown)) {
                                const cell = row.drilldown[monthKey]?.[sr];
                                if (cell) {
                                  totalCount += cell.count;
                                  totalAmount += cell.amount;
                                }
                              }
                              return (
                                <>
                                  <td
                                    onClick={() => totalCount && openModal(row.reason, null, 'All months', orderStatus, deliveryStatus)}
                                    className={`px-3 py-2 text-right text-purple-200 tabular-nums border-r border-purple-500/10 ${totalCount ? `font-semibold underline decoration-fuchsia-400/30 decoration-dotted underline-offset-4 ${CLICKABLE_CELL}` : ''}`}
                                    title={totalCount ? `Click to view ${totalCount} orders` : ''}
                                  >
                                    {totalCount.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-right text-fuchsia-300/90 tabular-nums border-r border-purple-500/30">
                                    {formatAmount(totalAmount)}
                                  </td>
                                </>
                              );
                            })()}
                            {monthHeaders.map((mh) => {
                              const cell = row.drilldown[mh.key]?.[sr];
                              return (
                                <Fragment key={mh.key}>
                                  <td
                                    onClick={() => cell?.count && openModal(row.reason, mh.key, mh.label, orderStatus, deliveryStatus)}
                                    className={`px-2 py-2 text-right text-purple-200/80 tabular-nums ${cell?.count ? `font-semibold underline decoration-fuchsia-400/30 decoration-dotted underline-offset-4 ${CLICKABLE_CELL}` : ''}`}
                                    title={cell?.count ? `Click to view ${cell.count} orders` : ''}
                                  >
                                    {cell?.count ? cell.count.toLocaleString() : <span className="text-purple-500/30">—</span>}
                                  </td>
                                  <td className="px-2 py-2 text-right text-purple-300/70 tabular-nums border-r border-purple-500/10">
                                    {cell?.amount ? formatAmount(cell.amount) : <span className="text-purple-500/30">—</span>}
                                  </td>
                                </Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}

              <tr className="bg-gradient-to-r from-fuchsia-900/40 via-purple-900/40 to-fuchsia-900/40 border-t-2 border-fuchsia-500/50 font-bold">
                <td className="px-4 py-3 sticky left-0 z-10 bg-purple-950/90 border-r border-fuchsia-500/30 text-white font-bold">
                  Grand Total
                </td>
                <td className="px-3 py-3 text-right text-white border-r border-purple-500/20 tabular-nums">
                  {data.totals.grand.count.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-fuchsia-300 border-r border-fuchsia-500/30 tabular-nums">
                  {formatAmount(data.totals.grand.amount)}
                </td>
                {monthHeaders.map((mh) => {
                  const t = data.totals.byMonth[mh.key];
                  return (
                    <Fragment key={mh.key}>
                      <td className="px-2 py-3 text-right text-white tabular-nums">
                        {t?.count?.toLocaleString() || '—'}
                      </td>
                      <td className="px-2 py-3 text-right text-fuchsia-200 tabular-nums border-r border-purple-500/20">
                        {t?.amount ? formatAmount(t.amount) : '—'}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-purple-500/20 bg-purple-950/30 text-xs text-purple-300/60 flex items-center justify-between">
          <span>
            {data.data.length} reason categories · {monthHeaders.length} months ·{' '}
            {data.totals.grand.count.toLocaleString()} total orders
          </span>
          <span>Last updated: {new Date(data.timestamp).toLocaleString()}</span>
        </div>
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
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-purple-500/30 bg-gradient-to-r from-purple-900/50 to-fuchsia-900/30 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {modalFilters.reason}
                  <span className="text-purple-300 text-base font-normal"> · {modalFilters.monthLabel} {year}</span>
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

            {/* Search + CSV */}
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
                      'PO Number', 'MarkedPending Time', 'Payment Date', 'Payment Event',
                      'Seller Phone', 'Seller Business', 'Buyer Phone', 'Buyer Business',
                      'Paid Amount', 'PO Amount', 'Coupon Amount', 'Order Status',
                      'Discount by Seller', 'Payment Option Discount by Badho',
                      'Applied Wallet Amount', 'Payment Option',
                      'AWB Number', 'Courier Name', 'Delivery Status (DV)',
                      'Refund Initiated Time', 'Refund Completed Time',
                      'COD Amount To Be Collected', 'Reject Reason', 'Rejected By',
                      'Reason Added by Badho Team', 'Delivery Status (PO)', 'Reason Category',
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
                    const fname = `rejection-${modalFilters.reason.replace(/\s+/g, '-')}-${modalFilters.month || 'all'}-${year}.csv`;
                    downloadCSV(fname, headers, rows);
                  }}
                >
                  ↓ Download CSV
                </button>
              )}
            </div>

            {/* Modal body */}
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
                        'PO Number', 'Pending Date', 'Payment Date', 'Pay Event',
                        'Seller', 'Seller Phone', 'Buyer', 'Buyer Phone',
                        'Paid', 'PO Amt', 'Coupon', 'Order',
                        'Disc Seller', 'Disc Badho', 'Wallet', 'Pay Option',
                        'AWB', 'Courier', 'Delivery (DV)',
                        'Refund Init', 'Refund Done', 'COD',
                        'Reject Reason', 'Rejected By', 'Badho Reason', 'Delivery (PO)',
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
                      <tr
                        key={`${r.poNumber}-${idx}`}
                        className="border-b border-purple-500/10 hover:bg-purple-500/10 align-top"
                      >
                        <td className="px-2 py-1.5 text-white tabular-nums font-semibold whitespace-nowrap border-r border-purple-500/10">
                          {r.poNumber || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {r.MarkedpendingTime ? new Date(r.MarkedpendingTime).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {formatDate(r.paymentDate)}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {r.paymentEvent || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-100 whitespace-nowrap border-r border-purple-500/10">
                          {r.sellerBusinessName || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {r.sellerPhone || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-100 whitespace-nowrap border-r border-purple-500/10">
                          {r.buyerBusinessName || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {r.buyerPhone || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-emerald-300 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {formatNumber(r.paidAmount)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-white tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {formatNumber(r.poAmount)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-fuchsia-300 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {formatNumber(r.CoupanAmount)}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-r border-purple-500/10">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200">
                            {r.orderStatus || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {r.discountBySeller ? `₹${Number(r.discountBySeller).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {r.PaymentOptionDiscountByBadho ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-cyan-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {formatNumber(r.appliedWalletAmount)}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {r.PaymentOption || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {r.awbNumber || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {r.courierName || '—'}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-r border-purple-500/10">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-200">
                            {r.deliveryStatusDv || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-orange-200 whitespace-nowrap border-r border-purple-500/10">
                          {formatDate(r.RefundIntiatedTime)}
                        </td>
                        <td className="px-2 py-1.5 text-emerald-200 whitespace-nowrap border-r border-purple-500/10">
                          {formatDate(r.RefundCompletedTime)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-amber-200 tabular-nums whitespace-nowrap border-r border-purple-500/10">
                          {formatNumber(r.codAmountToBeCollected)}
                        </td>
                        <td className="px-2 py-1.5 text-rose-200 max-w-[240px]" title={r.rejectReason || ''}>
                          <div className="line-clamp-2">{r.rejectReason || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 text-purple-200 whitespace-nowrap border-r border-purple-500/10">
                          {r.rejectedBy || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-amber-200 max-w-[240px]" title={r.reasonAddedByBadhoTeam || ''}>
                          <div className="line-clamp-2">{r.reasonAddedByBadhoTeam || '—'}</div>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-200">
                            {r.deliveryStatusPo || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {modalData && filteredModalData && filteredModalData.length > 2000 && (
              <div className="px-6 py-2 border-t border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
                Showing first 2,000 of {filteredModalData.length.toLocaleString()} rows in the table — CSV includes everything.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
