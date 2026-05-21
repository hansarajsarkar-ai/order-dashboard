'use client';

import { useEffect, useState, Fragment } from 'react';

interface DrilldownCell {
  count: number;
  amount: number;
}

interface MonthData {
  [deliveryStatus: string]: {
    [paymentStatus: string]: DrilldownCell;
  };
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

export default function RejectionReasonPivotTable() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

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

  const toggleExpand = (reason: string) => {
    const newExpanded = new Set(expandedReasons);
    if (newExpanded.has(reason)) {
      newExpanded.delete(reason);
    } else {
      newExpanded.add(reason);
    }
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

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/95 via-purple-950/30 to-slate-900/95 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/30 to-fuchsia-900/20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
            Rejection Reason Breakdown
          </h2>
          <p className="text-purple-300/70 text-sm mt-1">
            Rejected D2R orders (THIRD_PARTY × INTERCITY) grouped by reason · click any row to drill down
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
              const totalCols = 3 + monthHeaders.length * 2;

              // Build drill-down rows: deliveryStatus + paymentStatus combinations
              const subRowKeys = new Set<string>();
              for (const monthKey of Object.keys(row.drilldown)) {
                for (const ds of Object.keys(row.drilldown[monthKey])) {
                  for (const ps of Object.keys(row.drilldown[monthKey][ds])) {
                    subRowKeys.add(`${ds}|||${ps}`);
                  }
                }
              }
              const subRows = Array.from(subRowKeys).sort();

              return (
                <Fragment key={row.reason}>
                  {/* Main row */}
                  <tr
                    onClick={() => toggleExpand(row.reason)}
                    className={`border-b border-purple-500/10 cursor-pointer transition-colors ${color.bg} hover:bg-purple-800/20`}
                  >
                    <td
                      className={`px-4 py-3 sticky left-0 z-10 ${color.bg} border-r border-purple-500/20`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${color.accent}`}></span>
                        <span className={`text-xs ${color.text} transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span className={`font-semibold ${color.text}`}>{row.reason}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-white border-r border-purple-500/10 tabular-nums">
                      {row.total.count.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-fuchsia-300 border-r border-purple-500/30 tabular-nums">
                      {formatAmount(row.total.amount)}
                    </td>
                    {monthHeaders.map((mh) => {
                      const cell = row.months[mh.key];
                      return (
                        <Fragment key={mh.key}>
                          <td className="px-2 py-3 text-right text-purple-100 tabular-nums">
                            {cell?.count?.toLocaleString() || <span className="text-purple-500/40">—</span>}
                          </td>
                          <td className="px-2 py-3 text-right text-purple-200/90 tabular-nums border-r border-purple-500/10">
                            {cell?.amount ? formatAmount(cell.amount) : <span className="text-purple-500/40">—</span>}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>

                  {/* Drill-down sub-rows */}
                  {isExpanded &&
                    subRows.map((sr) => {
                      const [ds, ps] = sr.split('|||');
                      return (
                        <tr
                          key={`${row.reason}-${sr}`}
                          className="bg-slate-950/40 border-b border-purple-500/5 text-xs"
                        >
                          <td className="px-4 py-2 sticky left-0 bg-slate-950/80 z-10 border-r border-purple-500/10">
                            <div className="pl-8 flex items-center gap-2">
                              <span className="text-purple-500">└</span>
                              <span className="text-purple-300/90">
                                <span className="text-purple-400/60 mr-1">Delivery:</span>
                                <span className="font-medium">{ds}</span>
                                <span className="mx-2 text-purple-500/40">·</span>
                                <span className="text-purple-400/60 mr-1">Pay:</span>
                                <span className="font-medium">{ps}</span>
                              </span>
                            </div>
                          </td>
                          {(() => {
                            let totalCount = 0;
                            let totalAmount = 0;
                            for (const monthKey of Object.keys(row.drilldown)) {
                              const cell = row.drilldown[monthKey]?.[ds]?.[ps];
                              if (cell) {
                                totalCount += cell.count;
                                totalAmount += cell.amount;
                              }
                            }
                            return (
                              <>
                                <td className="px-3 py-2 text-right text-purple-200 tabular-nums border-r border-purple-500/10">
                                  {totalCount.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right text-fuchsia-300/90 tabular-nums border-r border-purple-500/30">
                                  {formatAmount(totalAmount)}
                                </td>
                              </>
                            );
                          })()}
                          {monthHeaders.map((mh) => {
                            const cell = row.drilldown[mh.key]?.[ds]?.[ps];
                            return (
                              <Fragment key={mh.key}>
                                <td className="px-2 py-2 text-right text-purple-200/80 tabular-nums">
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

            {/* Grand Total Row */}
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

      {/* Footer */}
      <div className="px-6 py-3 border-t border-purple-500/20 bg-purple-950/30 text-xs text-purple-300/60 flex items-center justify-between">
        <span>
          {data.data.length} reason categories · {monthHeaders.length} months ·{' '}
          {data.totals.grand.count.toLocaleString()} total orders
        </span>
        <span>Last updated: {new Date(data.timestamp).toLocaleString()}</span>
      </div>
    </div>
  );
}
