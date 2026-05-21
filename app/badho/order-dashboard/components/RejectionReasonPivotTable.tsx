'use client';

import { useEffect, useState } from 'react';

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

interface ExpandedCell {
  reason: string;
  month: string;
}

export default function RejectionReasonPivotTable() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/rejection-reason-breakdown?year=${year}`);
        if (!res.ok) throw new Error('Failed to fetch data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year]);

  const toggleExpand = (reason: string, month: string) => {
    const key = `${reason}|${month}`;
    const newExpanded = new Set(expandedCells);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedCells(newExpanded);
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4">No data available</div>;

  const months = Array.from(
    new Set(data.data.flatMap((r) => Object.keys(r.months)))
  ).sort();

  const monthHeaders = months.map((m) => {
    const [year, month] = m.split('-');
    const monthName = new Date(`${year}-${month}-01`).toLocaleString('default', {
      month: 'short',
      year: 'numeric',
    });
    return { key: m, label: monthName };
  });

  return (
    <div className="w-full p-4 bg-white rounded-lg border">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Rejection Reason Breakdown</h2>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="border px-2 py-1 rounded"
        >
          {[2023, 2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left sticky left-0 bg-gray-100 z-10">
                Reason Category
              </th>
              <th className="border p-2 text-right">Total Count</th>
              <th className="border p-2 text-right">Total Amount</th>
              {monthHeaders.map((mh) => (
                <th key={mh.key} colSpan={2} className="border p-2 text-center bg-gray-50">
                  {mh.label}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50 text-xs">
              <th className="border p-2"></th>
              <th className="border p-2"></th>
              <th className="border p-2"></th>
              {monthHeaders.map((mh) => (
                <th key={`${mh.key}-count`} colSpan={1} className="border p-1 text-center">
                  Count
                </th>
              ))}
              {monthHeaders.map((mh) => (
                <th key={`${mh.key}-amount`} colSpan={1} className="border p-1 text-center">
                  Amount
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => {
              const rowKey = `reason-${row.reason}`;
              return (
                <div key={rowKey}>
                  <tr className="border-t hover:bg-blue-50">
                    <td className="border p-2 font-semibold sticky left-0 z-10 bg-white">
                      {row.reason}
                    </td>
                    <td className="border p-2 text-right font-semibold">
                      {row.total.count.toLocaleString()}
                    </td>
                    <td className="border p-2 text-right font-semibold">
                      ₹{row.total.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    {monthHeaders.map((mh) => {
                      const monthData = row.months[mh.key];
                      const cellKey = `${row.reason}|${mh.key}`;
                      const isExpanded = expandedCells.has(cellKey);

                      return (
                        <td
                          key={`${mh.key}-count`}
                          className="border p-1 text-right text-xs cursor-pointer hover:bg-blue-100"
                          onClick={() => toggleExpand(row.reason, mh.key)}
                        >
                          <span className={isExpanded ? 'font-bold text-blue-600' : ''}>
                            {monthData?.count || 0}
                          </span>
                        </td>
                      );
                    })}
                    {monthHeaders.map((mh) => {
                      const monthData = row.months[mh.key];

                      return (
                        <td
                          key={`${mh.key}-amount`}
                          className="border p-1 text-right text-xs"
                        >
                          ₹{monthData?.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Drill-down rows */}
                  {expandedCells.has(`${row.reason}|${monthHeaders[0].key}`) &&
                    monthHeaders.map((mh) => {
                      const monthDrilldown = row.drilldown[mh.key];
                      if (!monthDrilldown) return null;

                      const deliveryStatuses = Object.keys(monthDrilldown);

                      return (
                        <tr key={`${row.reason}|${mh.key}|drilldown`} className="bg-gray-50">
                          <td colSpan={3} className="border p-2 text-xs italic text-gray-600">
                            {mh.label} Breakdown
                          </td>
                          <td colSpan={monthHeaders.length * 2} className="border p-2">
                            <div className="ml-4">
                              {deliveryStatuses.map((ds) => {
                                const statusMap = monthDrilldown[ds];
                                return (
                                  <div key={ds} className="mb-2 text-xs">
                                    <div className="font-semibold text-gray-700">
                                      Delivery Status: {ds}
                                    </div>
                                    <div className="ml-2">
                                      {Object.entries(statusMap).map(([paymentStatus, cell]) => (
                                        <div key={paymentStatus} className="text-gray-600">
                                          {paymentStatus}: Count={cell.count}, Amount=₹
                                          {cell.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </div>
              );
            })}

            {/* Totals row */}
            <tr className="border-t-2 font-bold bg-gray-100">
              <td className="border p-2 sticky left-0 z-10 bg-gray-100">Grand Total</td>
              <td className="border p-2 text-right">
                {data.totals.grand.count.toLocaleString()}
              </td>
              <td className="border p-2 text-right">
                ₹{data.totals.grand.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </td>
              {monthHeaders.map((mh) => {
                const monthTotal = data.totals.byMonth[mh.key];
                return (
                  <td key={`${mh.key}-total-count`} className="border p-1 text-right font-bold">
                    {monthTotal?.count || 0}
                  </td>
                );
              })}
              {monthHeaders.map((mh) => {
                const monthTotal = data.totals.byMonth[mh.key];
                return (
                  <td key={`${mh.key}-total-amount`} className="border p-1 text-right font-bold">
                    ₹{monthTotal?.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Last updated: {new Date(data.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
