'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// "PO modified" marker — a small badge shown next to any PO number that appears
// on the PO Modified dashboard (seller removed an item / cut a qty on a D2R
// third-party INTERCITY order). Clicking it opens that dashboard pre-filtered to
// the PO. The set of modified PO numbers is fetched ONCE for the whole route and
// cached at module scope, so dropping <PoModifiedMarker> into dozens of tables
// and modals costs a single network call regardless of how many render it.
// ---------------------------------------------------------------------------

const EMPTY: ReadonlySet<string> = new Set();

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const subscribers = new Set<() => void>();

function loadModifiedPos(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/po-modified/numbers', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j: { data?: unknown[] }) => {
      cache = new Set((j.data ?? []).map((x) => String(x)));
      subscribers.forEach((fn) => fn());
      return cache;
    })
    .catch(() => {
      cache = new Set();
      return cache;
    });
  return inflight;
}

/** Subscribe a component to the shared modified-PO set (fetched once). */
export function useModifiedPos(): ReadonlySet<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    loadModifiedPos();
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return cache ?? EMPTY;
}

/**
 * Renders nothing unless `poNumber` is a modified PO; otherwise a small amber
 * badge linking to /badho/po-modified?po=<poNumber> (new tab). stopPropagation
 * keeps row-level click handlers (e.g. "open items modal") from also firing.
 */
export function PoModifiedMarker({
  poNumber,
  className = '',
}: {
  poNumber: string | number | null | undefined;
  className?: string;
}) {
  const modified = useModifiedPos();
  if (poNumber == null) return null;
  const po = String(poNumber);
  if (!modified.has(po)) return null;
  return (
    <Link
      href={`/badho/po-modified?po=${encodeURIComponent(po)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="This PO was modified — open PO Modified details"
      aria-label="PO modified — view details"
      className={`inline-flex items-center justify-center align-middle ml-1 h-4 min-w-[16px] px-1 rounded text-[10px] font-bold leading-none bg-amber-400/90 text-amber-950 border border-amber-300 hover:bg-amber-300 shadow-sm transition-colors ${className}`}
    >
      ✎
    </Link>
  );
}
