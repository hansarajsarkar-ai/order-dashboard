'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { scaleSqrt } from 'd3-scale';
import { geoCentroid } from 'd3-geo';
import { stateCode } from '../../order-dashboard/components/IndiaStateMap';

export interface GeoRow {
  state: string;
  paid: number;
  other: number;
  total: number;
}

type Metric = 'total' | 'paid';

// Reconcile DB state names with the GeoJSON's ST_NM property (same aliases the
// order-dashboard map uses).
const NAME_ALIASES: Record<string, string> = {
  'Andaman and Nicobar Islands': 'Andaman & Nicobar',
  'Jammu and Kashmir': 'Jammu & Kashmir',
};

const fmtCompact = (n: number) => {
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};
const fmtInt = (n: number) => n.toLocaleString('en-IN');

interface FeatureProps { ST_NM: string }
interface RsmGeography { rsmKey: string; properties: FeatureProps; geometry: unknown }
type GeoFeatureCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: FeatureProps; geometry: unknown }[] };

// Nudge a few tiny/cramped states so their bubbles don't overlap neighbours.
const OFFSETS: Record<string, [number, number]> = {
  Delhi: [0.5, 0.4], Goa: [-0.5, -0.3], Sikkim: [0.3, 0.5], Chandigarh: [-0.6, 0.5], Puducherry: [0.5, -0.3],
};

export default function InstallBubbleMap({ data }: { data: GeoRow[] }) {
  const [geo, setGeo] = useState<GeoFeatureCollection | null>(null);
  const [metric, setMetric] = useState<Metric>('total');
  const [tip, setTip] = useState<{ x: number; y: number; row: GeoRow } | null>(null);

  useEffect(() => {
    fetch('/india-states.geojson').then((r) => r.json()).then(setGeo).catch(() => setGeo(null));
  }, []);

  // DB rows keyed by GeoJSON state name (drop the unmappable "(unknown)" bucket).
  const byGeoName = useMemo(() => {
    const m = new Map<string, GeoRow>();
    for (const r of data) {
      if (!r.state || r.state === '(unknown)') continue;
      m.set(NAME_ALIASES[r.state] ?? r.state, r);
    }
    return m;
  }, [data]);

  const unknown = useMemo(() => data.find((r) => r.state === '(unknown)') || null, [data]);

  // sqrt scale → bubble AREA is proportional to the value. Min radius keeps the
  // number readable even for the smallest state.
  const radius = useMemo(() => {
    const max = data.reduce((m, r) => Math.max(m, r[metric] || 0), 1);
    return scaleSqrt<number, number>().domain([1, max]).range([13, 46]);
  }, [data, metric]);

  // Draw the biggest bubbles first so smaller ones sit on top and stay clickable.
  const ordered = useMemo(() => {
    if (!geo) return [];
    return geo.features
      .map((g) => ({ g, row: byGeoName.get(g.properties.ST_NM) }))
      .filter((x): x is { g: GeoFeatureCollection['features'][number]; row: GeoRow } => !!x.row && x.row[metric] > 0)
      .sort((a, b) => b.row[metric] - a.row[metric]);
  }, [geo, byGeoName, metric]);

  if (!geo) {
    return (
      <div className="h-[560px] flex items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
          Loading India map…
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Metric toggle + note */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-purple-300/70">
          Bubble size = number of installs (area ∝ value); the count is shown inside each bubble.
          {unknown && <> <span className="text-purple-200">{fmtInt(unknown.total)}</span> installs have no state and aren&apos;t plotted.</>}
        </p>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          {(['total', 'paid'] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${metric === m ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-[0_0_18px_rgba(217,70,239,0.45)]' : 'text-purple-200 hover:bg-white/10'}`}>{m === 'total' ? 'All installs' : 'Paid only'}</button>
          ))}
        </div>
      </div>

      <div className="relative bg-slate-950/40 rounded-2xl border border-white/5 overflow-hidden">
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1100, center: [82.5, 23] }} width={800} height={620} style={{ width: '100%', height: 'auto' }}>
          {/* Base state shapes — dim; bubbles carry the data */}
          <Geographies geography={geo}>
            {({ geographies }: { geographies: RsmGeography[] }) => geographies.map((g) => (
              <Geography key={g.rsmKey} geography={g} fill="#241b4d" stroke="#0f172a" strokeWidth={0.6}
                style={{ default: { outline: 'none' }, hover: { fill: '#2e2358', outline: 'none' }, pressed: { outline: 'none' } }} />
            ))}
          </Geographies>

          {/* One sized, numbered bubble per state with installs */}
          {ordered.map(({ g, row }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [lng, lat] = geoCentroid(g as any);
            const off = OFFSETS[g.properties.ST_NM] || [0, 0];
            const r = radius(row[metric]);
            return (
              <Marker key={g.properties.ST_NM} coordinates={[lng + off[0], lat + off[1]]}>
                <circle r={r} fill="rgba(217,70,239,0.45)" stroke="#f0abfc" strokeWidth={1.25}
                  style={{ cursor: 'pointer', transition: 'r 200ms ease' }}
                  onMouseMove={(e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, row })}
                  onMouseLeave={() => setTip(null)} />
                <text textAnchor="middle" dominantBaseline="central" pointerEvents="none"
                  style={{ fontFamily: 'system-ui, sans-serif', fontSize: r >= 24 ? 11 : 9, fontWeight: 800, fill: '#fff', paintOrder: 'stroke', stroke: '#3b0764', strokeWidth: 2.5, strokeLinejoin: 'round', userSelect: 'none' }}>
                  {fmtCompact(row[metric])}
                </text>
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Size legend */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/5 flex items-center gap-3 text-xs text-purple-300">
          <span className="uppercase tracking-wider font-semibold">Smaller</span>
          <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500/50 border border-fuchsia-300" />
          <span className="w-4 h-4 rounded-full bg-fuchsia-500/50 border border-fuchsia-300" />
          <span className="w-6 h-6 rounded-full bg-fuchsia-500/50 border border-fuchsia-300" />
          <span className="uppercase tracking-wider font-semibold">Larger = more installs</span>
        </div>

        {tip && (
          <div className="fixed z-[60] px-4 py-3 rounded-xl bg-slate-900/95 backdrop-blur border border-fuchsia-400/40 text-white text-xs shadow-[0_0_30px_rgba(217,70,239,0.4)] pointer-events-none" style={{ left: tip.x + 14, top: tip.y + 14 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40 tracking-wider">{stateCode(tip.row.state)}</span>
              <span className="font-bold text-fuchsia-300 text-sm">{tip.row.state}</span>
            </div>
            <div className="tabular-nums"><span className="text-white/60">Total installs:</span> <span className="font-semibold">{fmtInt(tip.row.total)}</span></div>
            <div className="tabular-nums"><span className="text-white/60">Paid (Meta):</span> <span className="font-semibold text-fuchsia-200">{fmtInt(tip.row.paid)}</span></div>
            <div className="tabular-nums"><span className="text-white/60">Other:</span> <span className="font-semibold text-purple-200">{fmtInt(tip.row.other)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
