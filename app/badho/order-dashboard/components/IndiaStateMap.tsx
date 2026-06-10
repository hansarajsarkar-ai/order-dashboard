'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { scaleQuantize } from 'd3-scale';
import { geoCentroid } from 'd3-geo';

export interface StateRow {
  state: string | null;
  count: number;
  amount: number;
}

export interface SellerPoint {
  sellerId: string;
  businessName: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  amount: number;
}

interface Props {
  data: StateRow[];
  metric: 'count' | 'amount';
  onStateClick?: (stateName: string) => void;
  /** When provided, side list shows ALL states ranked, in a scrollable panel. Pass the active state to highlight the row. */
  selectedState?: string | null;
  /** When true, side list shows all ranked states (scroll), with row click → onStateClick. */
  showAllStatesScrollable?: boolean;
  /** When provided, overlay one pin per seller at their lat/long, sized by `metric`. */
  sellerPoints?: SellerPoint[];
}

// Reconcile DB state names with the GeoJSON's ST_NM property.
const NAME_ALIASES: Record<string, string> = {
  'Andaman and Nicobar Islands': 'Andaman & Nicobar',
  'Jammu and Kashmir': 'Jammu & Kashmir',
};

// Standard 2-letter Indian state/UT codes (the ones on number-plates / IN-ISO).
export const STATE_CODES: Record<string, string> = {
  'Andaman & Nicobar': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh': 'CH',
  'Chhattisgarh': 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DN',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu & Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Ladakh': 'LA',
  'Lakshadweep': 'LD',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'ML',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil Nadu': 'TN',
  'Telangana': 'TG',
  'Tripura': 'TR',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UK',
  'West Bengal': 'WB',
};

export const stateCode = (name: string | null | undefined): string => {
  if (!name) return '?';
  const key = NAME_ALIASES[name] ?? name;
  return STATE_CODES[key] ?? name.slice(0, 3).toUpperCase();
};

const formatAmount = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

interface FeatureProps {
  ST_NM: string;
}

interface RsmGeography {
  rsmKey: string;
  properties: FeatureProps;
  geometry: unknown;
}

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

// Some states are tiny; nudge their labels to avoid spilling into the sea or
// onto neighbouring states. Offsets are in degrees (lng, lat).
const LABEL_OFFSETS: Record<string, [number, number]> = {
  'Goa': [-0.4, -0.3],
  'Sikkim': [0.3, 0.4],
  'Delhi': [0.6, 0.3],
  'Chandigarh': [-0.5, 0.4],
  'Puducherry': [0.4, -0.3],
  'Lakshadweep': [-1.2, 0],
  'Andaman & Nicobar': [0, -0.5],
  'Dadra and Nagar Haveli and Daman and Diu': [-0.7, 0.2],
};

export default function IndiaStateMap({ data, metric, onStateClick, selectedState, showAllStatesScrollable, sellerPoints }: Props) {
  type GeoFeatureCollection = {
    type: 'FeatureCollection';
    features: { type: 'Feature'; properties: FeatureProps; geometry: unknown }[];
  };
  const [geo, setGeo] = useState<GeoFeatureCollection | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; state: string; count: number; amount: number } | null>(null);
  const [sellerTip, setSellerTip] = useState<{ x: number; y: number; seller: SellerPoint } | null>(null);

  // Radius scale for seller pins: sqrt so area ~ value, clamped to a readable range.
  const pinRadius = useMemo(() => {
    const pts = sellerPoints ?? [];
    const max = Math.max(...pts.map((p) => p[metric] || 0), 1);
    return (v: number) => {
      const r = Math.sqrt(Math.max(v, 0) / max) * 14;
      return Math.max(3, Math.min(16, r));
    };
  }, [sellerPoints, metric]);

  useEffect(() => {
    fetch('/india-states.geojson')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  // Map GeoJSON state name → DB row.
  const byGeoName = useMemo(() => {
    const m = new Map<string, StateRow>();
    for (const r of data) {
      if (!r.state) continue;
      const k = NAME_ALIASES[r.state] ?? r.state;
      m.set(k, r);
    }
    return m;
  }, [data]);

  const colorScale = useMemo(() => {
    const max = Math.max(...data.map((r) => r[metric] || 0), 1);
    return scaleQuantize<string>()
      .domain([1, max])
      .range([
        '#3b0764', // very low
        '#581c87',
        '#6b21a8',
        '#7e22ce',
        '#9333ea',
        '#a855f7',
        '#c026d3',
        '#d946ef',
        '#e879f9', // very high
      ]);
  }, [data, metric]);

  const top = useMemo(
    () => {
      const sorted = [...data].filter((r) => r.state).sort((a, b) => b[metric] - a[metric]);
      return showAllStatesScrollable ? sorted : sorted.slice(0, 10);
    },
    [data, metric, showAllStatesScrollable]
  );

  const grand = useMemo(
    () =>
      data.reduce(
        (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
        { count: 0, amount: 0 }
      ),
    [data]
  );

  if (!geo) {
    return (
      <div className="h-[640px] flex items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
          Loading India map…
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${showAllStatesScrollable ? 'items-stretch' : 'items-start'}`}>
      {/* MAP */}
      <div className="lg:col-span-2 relative bg-slate-950/40 rounded-2xl border border-white/5 overflow-hidden">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 1100, center: [82.5, 23] }}
          width={800}
          height={680}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={geo}>
            {({ geographies }: { geographies: RsmGeography[] }) => (
              <>
                {/* Filled state shapes */}
                {geographies.map((g) => {
                  const name = g.properties.ST_NM;
                  const row = byGeoName.get(name);
                  const value = row?.[metric] || 0;
                  const fill = value > 0 ? colorScale(value) : '#1e1b4b';
                  return (
                    <Geography
                      key={g.rsmKey}
                      geography={g}
                      fill={fill}
                      stroke="#0f172a"
                      strokeWidth={0.6}
                      onClick={() => onStateClick?.(name)}
                      onMouseMove={(e: React.MouseEvent) =>
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          state: name,
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
                          cursor: onStateClick ? 'pointer' : 'default',
                          filter: 'drop-shadow(0 0 14px rgba(217,70,239,0.6))',
                        },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                })}
                {/* Labels — every state gets its 2-letter code; states with
                    data also get the metric value on a second line. */}
                {geographies.map((g) => {
                  const name = g.properties.ST_NM;
                  const row = byGeoName.get(name);
                  const value = row?.[metric] || 0;
                  const hasData = value > 0;
                  // d3-geo expects a Feature; the rsm Geography object is shaped like one.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const [lng, lat] = geoCentroid(g as any);
                  const off = LABEL_OFFSETS[name] || [0, 0];
                  const code = stateCode(name);
                  return (
                    <Marker
                      key={`label-${g.rsmKey}`}
                      coordinates={[lng + off[0], lat + off[1]]}
                    >
                      {/* State code — first line, bolder. Dim for states with no data. */}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        y={hasData ? -6 : 0}
                        style={{
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          fill: hasData ? '#fff' : 'rgba(255,255,255,0.55)',
                          paintOrder: 'stroke',
                          stroke: '#000',
                          strokeWidth: 2.5,
                          strokeLinecap: 'round',
                          strokeLinejoin: 'round',
                          pointerEvents: 'none',
                          userSelect: 'none',
                        }}
                      >
                        {code}
                      </text>
                      {/* Metric value — second line, only when there's data. */}
                      {hasData && (
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          y={6}
                          style={{
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            fontSize: 9,
                            fontWeight: 600,
                            fill: '#fde68a',
                            paintOrder: 'stroke',
                            stroke: '#000',
                            strokeWidth: 2.5,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            pointerEvents: 'none',
                            userSelect: 'none',
                          }}
                        >
                          {formatShort(value, metric)}
                        </text>
                      )}
                    </Marker>
                  );
                })}
              </>
            )}
          </Geographies>

          {/* Seller operating-location pins — one per seller at their lat/long. */}
          {sellerPoints?.map((p) => {
            const r = pinRadius(p[metric] || 0);
            return (
              <Marker key={`seller-${p.sellerId}`} coordinates={[p.lng, p.lat]}>
                <circle
                  r={r}
                  fill="rgba(253,224,71,0.55)"
                  stroke="#fde047"
                  strokeWidth={1}
                  style={{ cursor: 'pointer', transition: 'r 150ms ease' }}
                  onMouseMove={(e: React.MouseEvent) =>
                    setSellerTip({ x: e.clientX, y: e.clientY, seller: p })
                  }
                  onMouseLeave={() => setSellerTip(null)}
                />
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Legend */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center gap-4">
          <span className="text-xs text-purple-300 uppercase tracking-wider font-semibold">Low</span>
          <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-[#3b0764] via-[#9333ea] to-[#e879f9] shadow-[0_0_18px_rgba(217,70,239,0.4)]" />
          <span className="text-xs text-purple-300 uppercase tracking-wider font-semibold">High</span>
        </div>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="fixed z-[60] px-4 py-3 rounded-xl bg-slate-900/95 backdrop-blur border border-fuchsia-400/40 text-white text-xs shadow-[0_0_30px_rgba(217,70,239,0.4)] pointer-events-none"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40 tracking-wider">
                {stateCode(tooltip.state)}
              </span>
              <span className="font-bold text-fuchsia-300 text-sm">{tooltip.state}</span>
            </div>
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

        {/* Seller pin tooltip */}
        {sellerTip && (
          <div
            className="fixed z-[60] px-4 py-3 rounded-xl bg-slate-900/95 backdrop-blur border border-amber-300/40 text-white text-xs shadow-[0_0_30px_rgba(253,224,71,0.35)] pointer-events-none max-w-[260px]"
            style={{ left: sellerTip.x + 14, top: sellerTip.y + 14 }}
          >
            <div className="font-bold text-amber-200 text-sm mb-1 truncate">
              {sellerTip.seller.businessName || 'Unknown seller'}
            </div>
            <div className="text-white/60 mb-1.5">
              {[sellerTip.seller.city, sellerTip.seller.state].filter(Boolean).join(', ') || '—'}
            </div>
            <div className="tabular-nums">
              <span className="text-white/60">Orders:</span>{' '}
              <span className="font-semibold">{sellerTip.seller.count.toLocaleString()}</span>
            </div>
            <div className="tabular-nums">
              <span className="text-white/60">Revenue:</span>{' '}
              <span className="font-semibold text-amber-200">{formatAmount(sellerTip.seller.amount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL — top states */}
      <div className={`space-y-4 ${showAllStatesScrollable ? 'flex flex-col min-h-0' : ''}`}>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-purple-300 uppercase tracking-wide">States</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{data.filter((r) => r.state).length}</div>
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

        <div className={`bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col ${showAllStatesScrollable ? 'flex-1 min-h-0' : ''}`}>
          <div className="px-4 py-3 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">{showAllStatesScrollable ? `All states (${top.length})` : 'Top 10 states'}</h3>
              {showAllStatesScrollable && <span className="text-[10px] text-purple-300/70">click row to drill into cities</span>}
            </div>
            <p className="text-[11px] text-purple-300 mt-0.5">
              by {metric === 'count' ? 'order count' : 'revenue'}
            </p>
          </div>
          <ol className={`divide-y divide-white/5 ${showAllStatesScrollable ? 'overflow-y-auto flex-1' : ''}`}>
            {top.map((r, i) => {
              const value = r[metric];
              const max = top[0]?.[metric] || 1;
              const pct = (value / max) * 100;
              const isSelected = !!(r.state && selectedState && r.state === selectedState);
              const compact = showAllStatesScrollable;
              return (
                <li
                  key={r.state || i}
                  onClick={() => r.state && onStateClick?.(r.state)}
                  className={`${compact ? 'px-3 py-1' : 'px-4 py-2.5'} flex items-center gap-2 transition-colors ${onStateClick ? 'cursor-pointer' : ''} ${isSelected ? 'bg-fuchsia-500/15 ring-1 ring-inset ring-fuchsia-400/40' : 'hover:bg-white/5'}`}
                >
                  <div className={`${compact ? 'w-4 text-[10px]' : 'w-6 text-xs'} text-purple-300 font-bold tabular-nums`}>{i + 1}</div>
                  <span className={`inline-flex items-center justify-center ${compact ? 'min-w-[24px] px-1 text-[9px]' : 'min-w-[28px] px-1.5 text-[10px]'} py-0.5 rounded font-bold bg-gradient-to-br from-fuchsia-500/30 to-purple-500/30 text-fuchsia-200 border border-fuchsia-400/40 tracking-wider`} title={r.state || ''}>
                    {stateCode(r.state)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-white ${compact ? 'text-xs' : 'text-sm'} truncate`}>{r.state}</div>
                    {!compact && (
                      <div className="h-1 rounded-full bg-white/5 mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {compact && (
                    <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="text-right tabular-nums flex items-baseline gap-1.5 shrink-0">
                    <div className={`text-white ${compact ? 'text-xs' : 'text-sm'} font-semibold`}>
                      {metric === 'count' ? r.count.toLocaleString() : formatAmount(r.amount)}
                    </div>
                    <div className="text-[10px] text-purple-300/70">
                      {metric === 'count' ? formatAmount(r.amount) : `${r.count.toLocaleString()}`}
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
