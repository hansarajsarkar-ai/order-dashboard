'use client';

import { ReactNode } from 'react';

export type KPITone = 'purple' | 'fuchsia' | 'emerald' | 'amber' | 'rose' | 'sky' | 'indigo';

const toneStyles: Record<KPITone, { border: string; glow: string; value: string; label: string }> = {
  purple:  { border: 'border-purple-400/30',  glow: 'from-purple-500/20 to-purple-600/0',   value: 'text-purple-100',  label: 'text-purple-300' },
  fuchsia: { border: 'border-fuchsia-400/30', glow: 'from-fuchsia-500/20 to-fuchsia-600/0', value: 'text-fuchsia-100', label: 'text-fuchsia-300' },
  emerald: { border: 'border-emerald-400/30', glow: 'from-emerald-500/20 to-emerald-600/0', value: 'text-emerald-100', label: 'text-emerald-300' },
  amber:   { border: 'border-amber-400/30',   glow: 'from-amber-500/20 to-amber-600/0',     value: 'text-amber-100',   label: 'text-amber-300' },
  rose:    { border: 'border-rose-400/30',    glow: 'from-rose-500/20 to-rose-600/0',       value: 'text-rose-100',    label: 'text-rose-300' },
  sky:     { border: 'border-sky-400/30',     glow: 'from-sky-500/20 to-sky-600/0',         value: 'text-sky-100',     label: 'text-sky-300' },
  indigo:  { border: 'border-indigo-400/30',  glow: 'from-indigo-500/20 to-indigo-600/0',   value: 'text-indigo-100',  label: 'text-indigo-300' },
};

export function KPICard({ label, value, sub, tone = 'purple', icon }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KPITone;
  icon?: string;
}) {
  const s = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden bg-white/5 backdrop-blur-xl border ${s.border} rounded-2xl p-4`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${s.glow} pointer-events-none`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</div>
          {icon && <div className="text-xl opacity-80">{icon}</div>}
        </div>
        <div className={`mt-1.5 text-2xl font-bold ${s.value}`}>{value}</div>
        {sub && <div className="mt-1 text-[11px] text-purple-200/70">{sub}</div>}
      </div>
    </div>
  );
}
