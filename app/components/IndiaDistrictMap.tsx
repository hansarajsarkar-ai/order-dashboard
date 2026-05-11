'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { scaleQuantize } from 'd3-scale';
import { geoCentroid, geoBounds } from 'd3-geo';

export interface DistrictRow {
  state: string | null;
  district: string | null;
  count: number;
  amount: number;
}

interface Props {
  data: DistrictRow[];
  metric: 'count' | 'amount';
  /** State filter — if set, the map zooms into that state's districts only. */
  selectedState: string | null;
}

// DB state name → districts.geojson `st_nm`. Geo names are slightly different
// (and the file is pre-Telangana-split, so Telangana districts map under
// Andhra Pradesh's geometry).
const DB_STATE_TO_GEO: Record<string, string> = {
  'Delhi': 'NCT of Delhi',
  'Andaman and Nicobar Islands': 'Andaman & Nicobar Island',
  'Jammu and Kashmir': 'Jammu & Kashmir',
  'Arunachal Pradesh': 'Arunanchal Pradesh',
  'Dadra and Nagar Haveli': 'Dadara & Nagar Havelli',
  'Daman and Diu': 'Daman & Diu',
  'Telangana': 'Andhra Pradesh', // 2011 census geojson predates split
};

const formatAmount = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

const formatShort = (n: number, metric: 'count' | 'amount'): string => {
  if (metric === 'amount') {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${Math.round(n)}`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

// case + whitespace insensitive matcher
const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

interface FeatureProps {
  district: string;
  st_nm: string;
}

interface RsmGeography {
  rsmKey: string;
  properties: FeatureProps;
  geometry: unknown;
}

type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: FeatureProps; geometry: unknown }[];
};

export default function IndiaDistrictMap({ data, metric, selectedState }: Props) {
  const [geo, setGeo] = useState<GeoFeatureCollection | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; state: string; district: string; count: number; amount: number } | null>(null);

  useEffect(() => {
    fetch('/india-districts.geojson')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  // (db state, db district) → row
  const byKey = useMemo(() => {
    const m = new Map<string, DistrictRow>();
    for (const r of data) {
      if (!r.state || !r.district) continue;
      const geoState = DB_STATE_TO_GEO[r.state] ?? r.state;
      m.set(`${norm(geoState)}|${norm(r.district)}`, r);
    }
    return m;
  }, [data]);

  const colorScale = useMemo(() => {
    const max = Math.max(...data.map((r) => r[metric] || 0), 1);
    return scaleQuantize<string>()
      .domain([1, max])
      .range([
        '#3b0764',
        '#581c87',
        '#6b21a8',
        '#7e22ce',
        '#9333ea',
        '#a855f7',
        '#c026d3',
        '#d946ef',
        '#e879f9',
      ]);
  }, [data, metric]);

  // Filter geo to selectedState (if any), and compute the projection center+scale.
  const { features, projection } = useMemo(() => {
    if (!geo) return { features: [], projection: { center: [82.5, 23] as [number, number], scale: 1100 } };
    if (!selectedState) {
      return { features: geo.features, projection: { center: [82.5, 23] as [number, number], scale: 1100 } };
    }
    const geoState = DB_STATE_TO_GEO[selectedState] ?? selectedState;
    const geoStateNorm = norm(geoState);
    const stateFeatures = geo.features.filter((f) => norm(f.properties.st_nm) === geoStateNorm);
    if (stateFeatures.length === 0) {
      return { features: geo.features, projection: { center: [82.5, 23] as [number, number], scale: 1100 } };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds = geoBounds({ type: 'FeatureCollection', features: stateFeatures } as any);
    const center: [number, number] = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2,
    ];
    const w = Math.max(bounds[1][0] - bounds[0][0], 0.5);
    const h = Math.max(bounds[1][1] - bounds[0][1], 0.5);
    // Mercator scale — empirical, fits w/h into the 800x680 canvas with margin
    const scale = Math.min(800 / w, 680 / h) * 60;
    return { features: stateFeatures, projection: { center, scale } };
  }, [geo, selectedState]);

  const filteredData = useMemo(
    () => (selectedState ? data.filter((r) => r.state === selectedState) : data),
    [data, selectedState]
  );

  const top = useMemo(
    () =>
      [...filteredData]
        .filter((r) => r.district)
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, 10),
    [filteredData, metric]
  );

  const grand = useMemo(
    () =>
      filteredData.reduce(
        (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
        { count: 0, amount: 0 }
      ),
    [filteredData]
  );

  if (!geo) {
    return (
      <div className="h-[640px] flex items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
          Loading districts map…
        </div>
      </div>
    );
  }

  // Only render labels when zoomed into a single state — at India scale 645
  // labels would be unreadable.
  const showLabels = !!selectedState && features.length <= 80;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 relative bg-slate-950/40 rounded-2xl border border-white/5 overflow-hidden">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: projection.scale, center: projection.center }}
          width={800}
          height={680}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={{ type: 'FeatureCollection', features }}>
            {({ geographies }: { geographies: RsmGeography[] }) => (
              <>
                {geographies.map((g) => {
                  const district = g.properties.district || '';
                  const state = g.properties.st_nm || '';
                  const row = byKey.get(`${norm(state)}|${norm(district)}`);
                  const value = row?.[metric] || 0;
                  const fill = value > 0 ? colorScale(value) : '#1e1b4b';
                  return (
                    <Geography
                      key={g.rsmKey}
                      geography={g}
                      fill={fill}
                      stroke="#0f172a"
                      strokeWidth={0.4}
                      onMouseMove={(e: React.MouseEvent) =>
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          state,
                          district,
                          count: row?.count || 0,
                          amount: row?.amount || 0,
                        })
                      }
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        default: { outline: 'none', transition: 'fill 200ms ease' },
                        hover: {
                          fill: '#f0abfc',
                          outline: 'none',
                          cursor: 'pointer',
                          filter: 'drop-shadow(0 0 14px rgba(217,70,239,0.6))',
                        },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                })}
                {showLabels &&
                  geographies.map((g) => {
                    const district = g.properties.district || '';
                    const state = g.properties.st_nm || '';
                    const row = byKey.get(`${norm(state)}|${norm(district)}`);
                    const value = row?.[metric] || 0;
                    if (value <= 0) return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [lng, lat] = geoCentroid(g as any);
                    return (
                      <Marker key={`label-${g.rsmKey}`} coordinates={[lng, lat]}>
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            fontSize: 9,
                            fontWeight: 700,
                            fill: '#fff',
                            paintOrder: 'stroke',
                            stroke: '#000',
                            strokeWidth: 2.2,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            pointerEvents: 'none',
                            userSelect: 'none',
                          }}
                        >
                          {formatShort(value, metric)}
                        </text>
                      </Marker>
                    );
                  })}
              </>
            )}
          </Geographies>
        </ComposableMap>

        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center gap-4">
          <span className="text-xs text-purple-300 uppercase tracking-wider font-semibold">Low</span>
          <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-[#3b0764] via-[#9333ea] to-[#e879f9] shadow-[0_0_18px_rgba(217,70,239,0.4)]" />
          <span className="text-xs text-purple-300 uppercase tracking-wider font-semibold">High</span>
        </div>

        {tooltip && (
          <div
            className="fixed z-[60] px-4 py-3 rounded-xl bg-slate-900/95 backdrop-blur border border-fuchsia-400/40 text-white text-xs shadow-[0_0_30px_rgba(217,70,239,0.4)] pointer-events-none"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <div className="font-bold text-fuchsia-300 text-sm mb-0.5">{tooltip.district || '—'}</div>
            <div className="text-purple-200/70 text-[10px] mb-1.5 uppercase tracking-wide">{tooltip.state}</div>
            <div className="tabular-nums">
              <span className="text-white/60">Orders:</span>{' '}
              <span className="font-semibold">{tooltip.count.toLocaleString()}</span>
            </div>
            <div className="tabular-nums">
              <span className="text-white/60">Revenue:</span>{' '}
              <span className="font-semibold text-purple-200">{formatAmount(tooltip.amount)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-purple-300 uppercase tracking-wide">Districts</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">
              {filteredData.filter((r) => r.district).length}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-purple-300 uppercase tracking-wide">Orders</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{grand.count.toLocaleString()}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-purple-300 uppercase tracking-wide">Revenue</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{formatAmount(grand.amount)}</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <h3 className="text-sm font-bold text-white">Top 10 districts</h3>
            <p className="text-[11px] text-purple-300 mt-0.5">
              by {metric === 'count' ? 'order count' : 'revenue'}
              {selectedState ? ` · ${selectedState}` : ' · all India'}
            </p>
          </div>
          <ol className="divide-y divide-white/5">
            {top.map((r, i) => {
              const value = r[metric];
              const max = top[0]?.[metric] || 1;
              const pct = (value / max) * 100;
              return (
                <li
                  key={`${r.state}-${r.district}-${i}`}
                  className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <div className="w-6 text-purple-300 text-xs font-bold tabular-nums">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">{r.district}</div>
                    <div className="text-[10px] text-purple-300/70 truncate">{r.state}</div>
                    <div className="h-1 rounded-full bg-white/5 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-white text-sm font-semibold">
                      {metric === 'count' ? r.count.toLocaleString() : formatAmount(r.amount)}
                    </div>
                    <div className="text-[10px] text-purple-300/70">
                      {metric === 'count' ? formatAmount(r.amount) : `${r.count.toLocaleString()} orders`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
