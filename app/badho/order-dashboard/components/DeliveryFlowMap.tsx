'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoMercator } from 'd3-geo';

export interface FlowOrigin {
  sellerId: string;
  businessName: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  amount: number;
}

export interface FlowDest {
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  amount: number;
}

interface Props {
  origins: FlowOrigin[];
  destinations: FlowDest[];
  metric: 'count' | 'amount';
  brandLabel: string;
}

// Match IndiaStateMap's ComposableMap config so projected pixels line up.
const W = 800;
const H = 680;

const formatAmount = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

interface FeatureProps { ST_NM: string; }
interface RsmGeography { rsmKey: string; properties: FeatureProps; geometry: unknown; }

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(s));
};

export default function DeliveryFlowMap({ origins, destinations, metric, brandLabel }: Props) {
  type GeoFeatureCollection = {
    type: 'FeatureCollection';
    features: { type: 'Feature'; properties: FeatureProps; geometry: unknown }[];
  };
  const [geo, setGeo] = useState<GeoFeatureCollection | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string; count: number; amount: number; kind: 'hub' | 'dest' } | null>(null);

  useEffect(() => {
    fetch('/india-states.geojson').then((r) => r.json()).then(setGeo).catch(() => setGeo(null));
  }, []);

  // Projection identical to IndiaStateMap (geoMercator, scale 1100, center [82.5,23]).
  const project = useMemo(() => {
    const p = geoMercator().translate([W / 2, H / 2]).center([82.5, 23]).scale(1100);
    return (lng: number, lat: number): [number, number] | null => {
      const out = p([lng, lat]);
      if (!out || !Number.isFinite(out[0]) || !Number.isFinite(out[1])) return null;
      return [out[0], out[1]];
    };
  }, []);

  const safeOrigins = useMemo(
    () => origins.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng)),
    [origins]
  );

  // Build routes: each destination flows from its nearest warehouse.
  const routes = useMemo(() => {
    if (safeOrigins.length === 0) return [];
    const maxVal = destinations.reduce((m, d) => Math.max(m, d[metric] || 0), 1);
    const out: {
      id: string;
      d: string;          // arc path
      ground: string;     // straight ground line
      x0: number; y0: number; x1: number; y1: number;
      dest: FlowDest;
      w: number;          // stroke width
      dur: number;        // pulse travel seconds
      delay: number;
    }[] = [];
    destinations.forEach((dest, i) => {
      const dp = project(dest.lng, dest.lat);
      if (!dp) return;
      // nearest warehouse
      let best = safeOrigins[0];
      let bestD = Infinity;
      for (const o of safeOrigins) {
        const dd = haversine(o, dest);
        if (dd < bestD) { bestD = dd; best = o; }
      }
      const op = project(best.lng, best.lat);
      if (!op) return;
      const [x0, y0] = op;
      const [x1, y1] = dp;
      const dx = x1 - x0, dy = y1 - y0;
      const dist = Math.hypot(dx, dy) || 1;
      // perpendicular, biased upward → consistent "flight arc" bow
      let px = -dy / dist, py = dx / dist;
      if (py > 0) { px = -px; py = -py; }
      const bend = Math.min(dist * 0.28, 170);
      const cx = (x0 + x1) / 2 + px * bend;
      const cy = (y0 + y1) / 2 + py * bend;
      const val = dest[metric] || 0;
      const w = 0.8 + (val / maxVal) * 3.2;
      out.push({
        id: `r${i}`,
        d: `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`,
        ground: `M${x0},${y0} L${x1},${y1}`,
        x0, y0, x1, y1, dest, w,
        dur: 2.4 + (dist / W) * 3.5,
        delay: (i % 18) * 0.18,
      });
    });
    // draw biggest on top
    return out.sort((a, b) => (a.dest[metric] || 0) - (b.dest[metric] || 0));
  }, [safeOrigins, destinations, metric, project]);

  const destMax = useMemo(() => destinations.reduce((m, d) => Math.max(m, d[metric] || 0), 1), [destinations, metric]);
  const topDest = useMemo(
    () => [...destinations].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, 12),
    [destinations, metric]
  );
  const totals = useMemo(
    () => destinations.reduce((a, d) => ({ count: a.count + d.count, amount: a.amount + d.amount }), { count: 0, amount: 0 }),
    [destinations]
  );

  if (!geo) {
    return (
      <div className="h-[640px] flex items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
          Loading delivery map…
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      {/* MAP */}
      <div
        className="lg:col-span-2 relative rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, #1b1040 0%, #0b0720 55%, #050314 100%)' }}
      >
        {/* subtle 3D tilt of the whole map plane */}
        <div style={{ perspective: '1400px' }}>
          <div style={{ transform: 'rotateX(14deg)', transformOrigin: '50% 38%' }}>
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 1100, center: [82.5, 23] }}
              width={W}
              height={H}
              style={{ width: '100%', height: 'auto' }}
            >
              <defs>
                <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="55%" stopColor="#e879f9" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
                <radialGradient id="hubGrad">
                  <stop offset="0%" stopColor="#fffbeb" />
                  <stop offset="40%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#b45309" />
                </radialGradient>
                <radialGradient id="destGrad">
                  <stop offset="0%" stopColor="#cffafe" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0e7490" />
                </radialGradient>
                <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="softShadow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="4" />
                </filter>
              </defs>

              <Geographies geography={geo}>
                {({ geographies }: { geographies: RsmGeography[] }) =>
                  geographies.map((g) => (
                    <Geography
                      key={g.rsmKey}
                      geography={g}
                      fill="#241a4d"
                      stroke="#0f172a"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none' },
                        hover: { outline: 'none', fill: '#2d2160' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  ))
                }
              </Geographies>

              {/* ground shadows (flatten arcs onto the map for 3D height cue) */}
              <g opacity={0.18}>
                {routes.map((r) => (
                  <path key={`g-${r.id}`} d={r.ground} fill="none" stroke="#000" strokeWidth={r.w} filter="url(#softShadow)" />
                ))}
              </g>

              {/* arcs */}
              {routes.map((r) => (
                <g key={`a-${r.id}`}>
                  <path d={r.d} fill="none" stroke="url(#arcGrad)" strokeWidth={r.w} strokeLinecap="round" opacity={0.7} filter="url(#glow)" />
                  {/* flowing dashes */}
                  <path
                    d={r.d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={Math.max(0.6, r.w * 0.45)}
                    strokeLinecap="round"
                    strokeDasharray="2 16"
                    opacity={0.85}
                    style={{ animation: `flowDash ${r.dur}s linear ${r.delay}s infinite` }}
                  />
                  {/* travelling shipment pulse */}
                  <circle r={Math.max(1.6, r.w * 0.9)} fill="#ffffff" filter="url(#glow)">
                    <animateMotion dur={`${r.dur}s`} begin={`${r.delay}s`} repeatCount="indefinite" path={r.d} rotate="auto" />
                    <animate attributeName="opacity" values="0;1;1;0" dur={`${r.dur}s`} begin={`${r.delay}s`} repeatCount="indefinite" />
                  </circle>
                </g>
              ))}

              {/* destination nodes */}
              {routes.map((r) => {
                const rad = 1.6 + ((r.dest[metric] || 0) / destMax) * 4.5;
                return (
                  <g key={`d-${r.id}`} transform={`translate(${r.x1},${r.y1})`}>
                    <circle r={rad + 2.5} fill="#22d3ee" opacity={0.18}>
                      <animate attributeName="r" values={`${rad};${rad + 6};${rad}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.35;0;0.35" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                    <circle
                      r={rad}
                      fill="url(#destGrad)"
                      stroke="#cffafe"
                      strokeWidth={0.5}
                      style={{ cursor: 'pointer' }}
                      onMouseMove={(e: React.MouseEvent) =>
                        setTip({ x: e.clientX, y: e.clientY, title: r.dest.city || '—', sub: r.dest.state || '', count: r.dest.count, amount: r.dest.amount, kind: 'dest' })
                      }
                      onMouseLeave={() => setTip(null)}
                    />
                  </g>
                );
              })}

              {/* warehouse hubs (drawn last → on top) */}
              {safeOrigins.map((o, i) => {
                const p = project(o.lng, o.lat);
                if (!p) return null;
                const [x, y] = p;
                return (
                  <g key={`hub-${i}`} transform={`translate(${x},${y})`}>
                    {[0, 1].map((k) => (
                      <circle key={k} r={6} fill="none" stroke="#fbbf24" strokeWidth={1.5} opacity={0.7}>
                        <animate attributeName="r" values="6;26" dur="2.4s" begin={`${k * 1.2}s`} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0" dur="2.4s" begin={`${k * 1.2}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    <circle r={8} fill="url(#hubGrad)" stroke="#fffbeb" strokeWidth={1.2} filter="url(#glow)"
                      style={{ cursor: 'pointer' }}
                      onMouseMove={(e: React.MouseEvent) =>
                        setTip({ x: e.clientX, y: e.clientY, title: o.businessName || 'Warehouse', sub: [o.city, o.state].filter(Boolean).join(', '), count: o.count, amount: o.amount, kind: 'hub' })
                      }
                      onMouseLeave={() => setTip(null)}
                    />
                    <text textAnchor="middle" y={3} style={{ fontSize: 9, fontWeight: 900, fill: '#7c2d12', pointerEvents: 'none', userSelect: 'none' }}>★</text>
                  </g>
                );
              })}
            </ComposableMap>
          </div>
        </div>

        {/* heading chip + legend */}
        <div className="absolute top-3 left-4 right-4 flex items-start justify-between pointer-events-none">
          <div className="px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-bold">Delivery network</div>
            <div className="text-sm font-bold text-white">{brandLabel}</div>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-white/10 bg-black/30 backdrop-blur flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5 text-amber-200"><span className="inline-block w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" /> Warehouse</span>
          <span className="flex items-center gap-1.5 text-cyan-200"><span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" /> Delivery city</span>
          <span className="flex items-center gap-1.5 text-fuchsia-200"><span className="inline-block w-6 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-400 to-cyan-400" /> Shipment route (thickness = volume)</span>
        </div>

        {tip && (
          <div className="fixed z-[60] px-4 py-3 rounded-xl bg-slate-900/95 backdrop-blur border text-white text-xs shadow-2xl pointer-events-none max-w-[260px]"
            style={{ left: tip.x + 14, top: tip.y + 14, borderColor: tip.kind === 'hub' ? 'rgba(251,191,36,0.5)' : 'rgba(34,211,238,0.5)' }}>
            <div className={`font-bold text-sm mb-0.5 truncate ${tip.kind === 'hub' ? 'text-amber-200' : 'text-cyan-200'}`}>
              {tip.kind === 'hub' ? '★ ' : ''}{tip.title}
            </div>
            {tip.sub && <div className="text-white/60 mb-1.5">{tip.sub}</div>}
            <div className="tabular-nums"><span className="text-white/60">Orders:</span> <span className="font-semibold">{tip.count.toLocaleString('en-IN')}</span></div>
            <div className="tabular-nums"><span className="text-white/60">Revenue:</span> <span className="font-semibold text-purple-200">{formatAmount(tip.amount)}</span></div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="flex flex-col min-h-0 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-amber-300 uppercase tracking-wide">Warehouses</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{safeOrigins.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-cyan-300 uppercase tracking-wide">Cities</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{destinations.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] text-fuchsia-300 uppercase tracking-wide">Delivered</div>
            <div className="text-xl font-bold text-white tabular-nums mt-0.5">{totals.count.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-white/10 bg-white/5 shrink-0">
            <h3 className="text-sm font-bold text-white">Top delivery cities</h3>
            <p className="text-[11px] text-purple-300 mt-0.5">by {metric === 'count' ? 'order count' : 'revenue'} · {formatAmount(totals.amount)} total</p>
          </div>
          <ol className="divide-y divide-white/5 overflow-y-auto flex-1">
            {topDest.map((d, i) => {
              const val = d[metric];
              const pct = ((d[metric] || 0) / (topDest[0]?.[metric] || 1)) * 100;
              return (
                <li key={`${d.state}-${d.city}-${i}`} className="px-3 py-1.5 flex items-center gap-2">
                  <div className="w-4 text-[10px] text-purple-300 font-bold tabular-nums">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs truncate">{d.city} <span className="text-purple-300/60">· {d.state}</span></div>
                    <div className="h-1 rounded-full bg-white/5 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="text-white text-xs font-semibold">{metric === 'count' ? val.toLocaleString('en-IN') : formatAmount(d.amount)}</div>
                    <div className="text-[10px] text-purple-300/70">{metric === 'count' ? formatAmount(d.amount) : d.count.toLocaleString('en-IN')}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* keyframes for flowing dashes */}
      <style jsx global>{`
        @keyframes flowDash { to { stroke-dashoffset: -180; } }
      `}</style>
    </div>
  );
}
