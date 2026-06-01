'use client';

export interface HeatCell { dow: number; hour: number; total: number; connectionRate: number; }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Heatmap({ cells, mode = 'volume', onCellClick }: {
  cells: HeatCell[];
  mode?: 'volume' | 'connection';
  onCellClick?: (dow: number, hour: number) => void;
}) {
  const max = mode === 'volume'
    ? Math.max(1, ...cells.map((c) => c.total))
    : 1;
  const grid: (HeatCell | null)[][] = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (const c of cells) {
    if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) grid[c.dow][c.hour] = c;
  }

  function color(c: HeatCell | null): string {
    if (!c || c.total === 0) return 'bg-white/[0.03]';
    const v = mode === 'volume' ? c.total / max : c.connectionRate;
    if (v >= 0.85) return 'bg-fuchsia-500/90';
    if (v >= 0.65) return 'bg-fuchsia-500/70';
    if (v >= 0.45) return 'bg-purple-500/65';
    if (v >= 0.30) return 'bg-purple-500/45';
    if (v >= 0.15) return 'bg-purple-500/30';
    if (v >= 0.05) return 'bg-purple-500/20';
    return 'bg-purple-500/10';
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-10 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="w-7 text-[9px] text-purple-300/60 text-center">{h}</div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center mt-0.5">
            <div className="w-10 shrink-0 text-[10px] text-purple-200 pr-1 text-right">{DOW[d]}</div>
            {row.map((c, h) => (
              <button
                key={h}
                onClick={() => onCellClick?.(d, h)}
                disabled={!c || !onCellClick}
                title={c ? `${DOW[d]} ${h}:00 — ${c.total} calls · ${(c.connectionRate * 100).toFixed(0)}% connect` : `${DOW[d]} ${h}:00`}
                className={`w-7 h-6 mx-px rounded-sm ${color(c)} ${onCellClick ? 'hover:ring-1 hover:ring-white/40 cursor-pointer' : ''}`}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-purple-300/60">
          <span>Less</span>
          <div className="flex gap-0.5">
            {['bg-purple-500/10','bg-purple-500/20','bg-purple-500/30','bg-purple-500/45','bg-purple-500/65','bg-fuchsia-500/70','bg-fuchsia-500/90'].map((c) => (
              <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
