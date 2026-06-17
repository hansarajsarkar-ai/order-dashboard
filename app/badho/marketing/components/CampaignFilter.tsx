'use client';

import { useMemo, useState } from 'react';

export interface CampaignOption {
  campaign: string;
  campaignId: string;
  installs: number;
}

const fmtInt = (n: number) => n.toLocaleString('en-IN');

// Searchable campaign filter — matches the typed query against campaign NAME or
// campaign ID. Selecting an option passes the campaign name up (the API matches
// either name or id, so the name is sufficient). "All campaigns" clears it.
export default function CampaignFilter({
  value,
  onChange,
  options,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CampaignOption[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options.slice(0, 200);
    return options
      .filter((o) => o.campaign.toLowerCase().includes(s) || o.campaignId.toLowerCase().includes(s))
      .slice(0, 200);
  }, [q, options]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors max-w-[260px] ${value ? 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100' : 'bg-white/5 border-white/10 text-purple-200 hover:bg-white/10'}`}
        title={value || 'Filter by campaign'}
      >
        <span className="opacity-70">🎯</span>
        <span className="truncate">{value || 'All campaigns'}</span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="ml-1 px-1 rounded text-fuchsia-200 hover:bg-white/15"
            title="Clear campaign filter"
          >
            ×
          </span>
        ) : (
          <span className="opacity-60">▾</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-[340px] max-w-[88vw] rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="p-2 border-b border-white/10">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search campaign name or ID…"
                className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white placeholder-purple-300/50 focus:bg-white/10 focus:border-fuchsia-400/50 focus:outline-none"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${!value ? 'text-fuchsia-200 font-semibold' : 'text-purple-100'}`}
              >
                All campaigns
              </button>
              {loading ? (
                <div className="px-3 py-3 text-xs text-purple-300">Loading campaigns…</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-purple-300/70">No campaigns match.</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={`${o.campaign}-${o.campaignId}`}
                    onClick={() => { onChange(o.campaign); setOpen(false); setQ(''); }}
                    className={`w-full text-left px-3 py-2 hover:bg-white/10 ${value === o.campaign ? 'bg-fuchsia-500/15' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white truncate">{o.campaign}</span>
                      <span className="text-[11px] text-purple-300/80 tabular-nums shrink-0">{fmtInt(o.installs)}</span>
                    </div>
                    {o.campaignId && <div className="text-[10px] text-purple-300/50 truncate">id: {o.campaignId}</div>}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
