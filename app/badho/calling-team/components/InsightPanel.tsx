'use client';

import { ReactNode } from 'react';

export type InsightTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'opportunity';

export interface Insight {
  tone: InsightTone;
  label: string;
  text: string;
}

const toneStyles: Record<InsightTone, { wrap: string; chip: string; icon: string }> = {
  positive:    { wrap: 'border-emerald-400/30 bg-emerald-400/5',   chip: 'bg-emerald-400/15 text-emerald-200',   icon: '✓' },
  warning:     { wrap: 'border-amber-400/30 bg-amber-400/5',       chip: 'bg-amber-400/15 text-amber-200',       icon: '!' },
  danger:      { wrap: 'border-rose-400/30 bg-rose-400/5',         chip: 'bg-rose-400/15 text-rose-200',         icon: '×' },
  opportunity: { wrap: 'border-sky-400/30 bg-sky-400/5',           chip: 'bg-sky-400/15 text-sky-200',           icon: '★' },
  neutral:     { wrap: 'border-purple-400/20 bg-purple-400/5',     chip: 'bg-purple-400/15 text-purple-200',     icon: '•' },
};

export function InsightPanel({ insights, title = 'AI Insights' }: { insights: Insight[]; title?: string }) {
  if (!insights.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-purple-300/70 font-semibold">{title}</div>
      {insights.map((ins, i) => {
        const s = toneStyles[ins.tone];
        return (
          <div key={i} className={`border ${s.wrap} rounded-lg px-3 py-2 flex items-start gap-2`}>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.chip} mt-0.5 min-w-[58px] text-center`}>
              {ins.label}
            </span>
            <span className="text-xs text-purple-100/90 leading-relaxed">{ins.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartCard({ title, subtitle, question, children, insights }: {
  title: string;
  subtitle?: string;
  question?: string;
  children: ReactNode;
  insights?: Insight[];
}) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col">
      <div className="mb-3">
        <div className="text-base font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs text-purple-200/70 mt-0.5">{subtitle}</div>}
        {question && (
          <div className="mt-1 text-[11px] italic text-purple-300/80">
            <span className="text-purple-400 not-italic font-semibold mr-1">Q:</span>
            {question}
          </div>
        )}
      </div>
      <div className="flex-1">{children}</div>
      {insights && insights.length > 0 && <InsightPanel insights={insights} />}
    </div>
  );
}
