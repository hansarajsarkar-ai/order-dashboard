import React from 'react';

export interface Scan {
  location: string | null;
  date: string | null;
  status: string | null;
  activity: string | null;
}

export interface ScanTimelineProps {
  scans: Scan[];
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

/** Format an ISO date string into 'DD Mon YYYY, hh:mm AM/PM'. Falls back to raw or '—'. */
function formatScanDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Build the "STATUS · Activity" sub-line, omitting empty segments. */
function buildStatusLine(status: string | null, activity: string | null): string {
  return [status, activity].filter((s) => s && s.trim().length > 0).join(' · ');
}

export default function ScanTimeline({
  scans,
  loading = false,
  error = null,
  compact = false,
}: ScanTimelineProps) {
  const text = compact ? 'text-[10px]' : 'text-[11px]';
  const locText = compact ? 'text-[11px]' : 'text-xs';

  if (loading) {
    return (
      <div className={`${text} text-slate-400 animate-pulse`}>Loading scans…</div>
    );
  }

  if (error) {
    return <div className={`${text} text-rose-600`}>{error}</div>;
  }

  if (!scans || scans.length === 0) {
    return <div className={`${text} text-slate-400`}>No scan data</div>;
  }

  return (
    <ol className={`border-l border-slate-200 ${compact ? 'pl-3' : 'pl-4'}`}>
      {scans.map((scan, i) => {
        const isLatest = i === 0;
        const statusLine = buildStatusLine(scan.status, scan.activity);
        return (
          <li
            key={i}
            className={`relative ${compact ? 'pb-2 last:pb-0' : 'pb-3 last:pb-0'}`}
          >
            {/* node dot */}
            <span
              aria-hidden="true"
              className={`absolute ${compact ? '-left-[17px] top-[3px] h-2 w-2' : '-left-[22px] top-[3px] h-2.5 w-2.5'} rounded-full ring-2 ring-white ${
                isLatest
                  ? 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.7)]'
                  : 'bg-slate-300'
              }`}
            />
            <div
              className={`font-bold break-words text-slate-900 ${locText} ${
                compact ? 'leading-tight' : 'leading-snug'
              }`}
            >
              {scan.location && scan.location.trim().length > 0 ? scan.location : '—'}
            </div>
            <div className={`${text} text-slate-500`}>{formatScanDate(scan.date)}</div>
            {statusLine && (
              <div className={`${text} text-slate-600`}>{statusLine}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
