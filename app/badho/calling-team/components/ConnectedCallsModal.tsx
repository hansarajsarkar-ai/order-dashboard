'use client';

import { useEffect, useMemo, useState } from 'react';

interface ConnectedCall {
  callId: string | null;
  callTs: string | null;
  phone: string | null;
  durationSec: number | null;
  subDisposition: string | null;
  recordingUrl: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  addressLine1: string | null;
  landmark: string | null;
  address: string;
}

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};
const fmtDur = (sec: number | null | undefined) => {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
};

interface Props {
  agentName: string;
  // Same query string the Agent table used for /api/calling-team/agents (date
  // range + global filters), so the connected count here matches the cell.
  qs: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

export default function ConnectedCallsModal({ agentName, qs, startDate, endDate, onClose }: Props) {
  const [rows, setRows] = useState<ConnectedCall[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setRows(null);
    fetch(`/api/calling-team/agent-connected-calls?${qs}&agentName=${encodeURIComponent(agentName)}`)
      .then((r) => r.json())
      .then((d) => { if (cancelled) return; if (d.error) { setError(d.error); setRows([]); } else setRows(d.data || []); })
      .catch((e) => { if (!cancelled) { setError(String(e)); setRows([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentName, qs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.buyerName, r.buyerBusinessName, r.phone, r.city, r.address]
        .some((v) => v != null && String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const headers = ['Call Time', 'Duration (s)', 'Phone', 'Buyer Name', 'Buyer Business Name', 'City', 'Address', 'Recording URL'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) => [
      r.callTs, r.durationSec, r.phone, r.buyerName, r.buyerBusinessName, r.city, r.address, r.recordingUrl,
    ].map(esc).join(','));
    const csv = '﻿' + [headers.map(esc).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `connected-calls-${agentName.replace(/\s+/g, '-')}-${startDate}_${endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const dash = <span className="text-slate-400">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md" onClick={onClose}>
      <div className="relative bg-white text-slate-900 border border-emerald-400/50 rounded-2xl w-[92vw] max-w-[1200px] h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-white to-emerald-50/60">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
              <span>Connected calls · {agentName}</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Connected (answered) calls · {startDate} → {endDate}
              {' · '}
              {loading ? 'Loading…' : rows ? <span className="text-slate-900 font-semibold">{filtered.length} of {rows.length} calls</span> : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-60 max-w-full">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyer, phone, city…" className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs">×</button>}
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 text-white text-sm font-semibold transition-all disabled:opacity-40" disabled={!filtered.length} onClick={exportCsv}>↓ CSV</button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90" aria-label="Close">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-auto">
          {loading ? <div className="px-6 py-12 text-center text-slate-500">Loading connected calls…</div>
            : error ? <div className="px-6 py-12 text-center text-rose-600">{error}</div>
            : !rows || rows.length === 0 ? <div className="px-6 py-12 text-center text-slate-500">No connected calls found</div>
            : filtered.length === 0 ? <div className="px-6 py-12 text-center text-slate-500">No matches for &ldquo;{search}&rdquo;</div>
            : (
              <table className="w-full text-xs">
                <thead className="shadow-[0_2px_0_rgba(16,185,129,0.4)]">
                  <tr className="border-b border-slate-200">
                    {['Call Time', 'Duration', 'Phone', 'Buyer Name', 'Buyer Business Name', 'City', 'Address', 'Recording'].map((h, i) => (
                      <th key={i} className={`sticky top-0 z-20 bg-slate-100 px-3 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider ${h === 'Duration' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={r.callId ?? idx} className={`border-b border-slate-100 align-top ${idx % 2 ? 'bg-slate-50' : 'bg-white'} hover:bg-emerald-50`}>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.callTs ? fmtDateTime(r.callTs) : dash}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium whitespace-nowrap">{fmtDur(r.durationSec) ?? dash}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap text-slate-700">{r.phone || dash}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.buyerName || dash}</td>
                      <td className="px-3 py-2 text-slate-800">{r.buyerBusinessName || dash}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.city || dash}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs max-w-md">{r.address ? <div className="whitespace-normal break-words">{r.address}</div> : dash}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.recordingUrl ? <a href={r.recordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 text-[11px] font-bold border border-fuchsia-300 transition-all" title="Play call recording">▶ Play</a> : dash}
                      </td>
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
