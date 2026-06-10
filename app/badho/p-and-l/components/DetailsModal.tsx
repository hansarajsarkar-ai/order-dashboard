'use client';

import { useEffect, useMemo } from 'react';
import {
  ColumnDef,
  formatValue,
  isNumericCol,
  cellToneClass,
  rowToneClass,
  computeMaxLoss,
  heatBg,
} from './columns';

type Row = Record<string, unknown>;

interface Props {
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  rows: Row[];
  onClose: () => void;
}

export default function DetailsModal({ title, subtitle, columns, rows, onClose }: Props) {
  const maxLoss = useMemo(() => computeMaxLoss(rows, columns), [rows, columns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const downloadCsv = () => {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c) => esc(c.label)).join(',');
    const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[95vw] max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 to-purple-950/90 shadow-[0_0_60px_rgba(217,70,239,0.25)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-purple-300/80 mt-0.5">{subtitle}</p>}
            <p className="text-xs text-fuchsia-300 mt-1 font-semibold">
              {rows.length.toLocaleString('en-IN')} {rows.length === 1 ? 'order' : 'orders'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-purple-100 hover:bg-white/10 transition-colors"
            >
              ⬇ CSV
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-purple-200 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-purple-300/70 text-sm">No orders in this slab.</div>
          ) : (
            <table className="text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className="px-3 py-2 text-left font-semibold text-purple-200 bg-slate-900/95 border-b border-white/15 whitespace-nowrap"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={'transition-colors ' + rowToneClass(r)}>
                    {columns.map((c) => {
                      const v = r[c.key];
                      const num = isNumericCol(v, c.key);
                      const tone = cellToneClass(c, v);
                      const heat = heatBg(c, v, maxLoss);
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
    </div>
  );
}
