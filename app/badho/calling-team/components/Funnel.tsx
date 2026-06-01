'use client';

export interface FunnelStage { name: string; value: number; }

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return <div className="text-purple-200/60 text-sm">No funnel data.</div>;
  const top = stages[0]?.value || 1;
  const palette = [
    'from-fuchsia-500 to-purple-600',
    'from-purple-500 to-indigo-600',
    'from-indigo-500 to-sky-600',
    'from-sky-500 to-emerald-600',
    'from-emerald-500 to-emerald-700',
  ];
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const widthPct = top ? Math.max(8, (s.value / top) * 100) : 0;
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev ? (s.value / prev) * 100 : null;
        const drop = prev ? prev - s.value : null;
        return (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-44 shrink-0 text-xs text-purple-200">{s.name}</div>
            <div className="flex-1 relative h-9">
              <div
                className={`h-full bg-gradient-to-r ${palette[i % palette.length]} rounded-md flex items-center justify-end px-3 shadow-lg`}
                style={{ width: `${widthPct}%` }}
              >
                <span className="text-xs font-bold text-white drop-shadow">{s.value.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="w-28 shrink-0 text-right text-[11px]">
              {conv === null ? (
                <span className="text-purple-300/60">—</span>
              ) : (
                <>
                  <span className="text-emerald-300 font-semibold">{conv.toFixed(1)}%</span>
                  <span className="text-rose-300/80 ml-2">↓{drop?.toLocaleString('en-IN')}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
