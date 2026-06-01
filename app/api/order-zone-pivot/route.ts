import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Seller × Delhivery zone × delivery status pivot. Each cell shows the
// delivery count and the *mode* charged weight (kg) — the single charged-
// weight value that occurs most often in the bucket. Zone + charged_weight
// come from the first element of intercityDelivery.deliveryCostReportJSON.

interface Row {
  seller: string;
  zone: string;
  status: string;
  weight_g: string | null;
  cnt: string;
}

type Cell = { count: number; modeKg: number };

const ZONE_ORDER = ['A', 'B', 'C1', 'C2', 'D1', 'D2', 'E', 'F'];

// Pick the weight_g with the highest count; tie-break on the smaller weight
// for stable output. Returns kg.
function modeFrom(weightHist: Map<number, number>): number {
  let bestG = 0;
  let bestC = -1;
  for (const [g, c] of weightHist) {
    if (c > bestC || (c === bestC && g < bestG)) {
      bestG = g;
      bestC = c;
    }
  }
  return bestG / 1000;
}

function totalCount(weightHist: Map<number, number>): number {
  let total = 0;
  for (const c of weightHist.values()) total += c;
  return total;
}

function mergeInto(target: Map<number, number>, source: Map<number, number>) {
  for (const [g, c] of source) target.set(g, (target.get(g) || 0) + c);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = searchParams.get('startDate') || fmt(firstOfMonth);
  const endDate = searchParams.get('endDate') || fmt(today);

  try {
    // Group at the finest (seller, zone, status, weight_g) so we can compute
    // mode at any rollup level in JS without re-querying.
    const sql = `
      SELECT
        COALESCE(s."businessName", '(unknown)')                                  AS seller,
        a."deliveryCostReportJSON" -> 0 ->> 'zone'                               AS zone,
        a."status"                                                               AS status,
        NULLIF(a."deliveryCostReportJSON" -> 0 ->> 'charged_weight', '')::numeric AS weight_g,
        COUNT(*)::text                                                           AS cnt
      FROM "deliveries"."intercityDelivery" a
      JOIN "purchaseOrder"."purchaseOrder" b ON b."id" = a."purchaseOrderId"
      JOIN "users"."seller"                s ON s."id" = b."sellerId"
      JOIN "users"."buyer"                 c ON c."id" = b."buyerId"
      WHERE a."created_at"::date >= $1
        AND a."created_at"::date <= $2
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND c."isTest" = FALSE
        AND c."businessName" NOT ILIKE '%test%'
        AND a."deliveryPartnerId" = 'DELHIVERY'
        AND a."deliveryCostReportJSON" -> 0 ->> 'zone' IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY seller, zone, status;
    `;

    const rows = await query<Row>(sql, [startDate, endDate]);

    // Histogram store: cellHist[seller][zone][status] = Map<weight_g, count>
    const cellHist: Record<string, Record<string, Record<string, Map<number, number>>>> = {};
    const sellerHist = new Map<string, Map<number, number>>();
    const zoneHist   = new Map<string, Map<number, number>>();
    const statusHist = new Map<string, Map<number, number>>();
    const grandHist  = new Map<number, number>();
    // Roll-ups needed by the UI (collapsed-zone and expanded footer).
    const sellerZoneHist: Record<string, Record<string, Map<number, number>>> = {};
    const zoneStatusHist: Record<string, Record<string, Map<number, number>>> = {};

    const zoneSet = new Set<string>();
    const statusSet = new Set<string>();

    const ensure = <K, V>(m: Map<K, V>, k: K, mk: () => V) => {
      let v = m.get(k);
      if (!v) { v = mk(); m.set(k, v); }
      return v;
    };

    for (const r of rows) {
      const seller = r.seller;
      const zone = r.zone || '(none)';
      const status = r.status || '(unknown)';
      const weightG = r.weight_g ? Math.round(parseFloat(r.weight_g)) : 0;
      const cnt = parseInt(r.cnt);
      if (cnt === 0) continue;

      zoneSet.add(zone);
      statusSet.add(status);

      cellHist[seller] = cellHist[seller] || {};
      cellHist[seller][zone] = cellHist[seller][zone] || {};
      const h = cellHist[seller][zone][status] = cellHist[seller][zone][status] || new Map<number, number>();
      h.set(weightG, (h.get(weightG) || 0) + cnt);

      sellerZoneHist[seller] = sellerZoneHist[seller] || {};
      const sz = sellerZoneHist[seller][zone] = sellerZoneHist[seller][zone] || new Map<number, number>();
      sz.set(weightG, (sz.get(weightG) || 0) + cnt);

      zoneStatusHist[zone] = zoneStatusHist[zone] || {};
      const zs = zoneStatusHist[zone][status] = zoneStatusHist[zone][status] || new Map<number, number>();
      zs.set(weightG, (zs.get(weightG) || 0) + cnt);

      ensure(sellerHist, seller, () => new Map()).set(weightG, (sellerHist.get(seller)!.get(weightG) || 0) + cnt);
      ensure(zoneHist,   zone,   () => new Map()).set(weightG, (zoneHist.get(zone)!.get(weightG)     || 0) + cnt);
      ensure(statusHist, status, () => new Map()).set(weightG, (statusHist.get(status)!.get(weightG) || 0) + cnt);
      grandHist.set(weightG, (grandHist.get(weightG) || 0) + cnt);
    }

    // Build cells with count + modeKg.
    const data: Record<string, Record<string, Record<string, Cell>>> = {};
    for (const [seller, byZone] of Object.entries(cellHist)) {
      data[seller] = {};
      for (const [zone, byStatus] of Object.entries(byZone)) {
        data[seller][zone] = {};
        for (const [status, hist] of Object.entries(byStatus)) {
          data[seller][zone][status] = {
            count: totalCount(hist),
            modeKg: modeFrom(hist),
          };
        }
      }
    }

    const buildTotals = (m: Map<string, Map<number, number>>) => {
      const out: Record<string, Cell> = {};
      for (const [k, h] of m) {
        out[k] = { count: totalCount(h), modeKg: modeFrom(h) };
      }
      return out;
    };

    const zoneIndex = (z: string) => {
      const i = ZONE_ORDER.indexOf(z);
      return i === -1 ? ZONE_ORDER.length : i;
    };
    const zones = Array.from(zoneSet).sort((a, b) => {
      const ai = zoneIndex(a);
      const bi = zoneIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    const sellerTotals = buildTotals(sellerHist);
    const zoneTotals   = buildTotals(zoneHist);
    const statusTotals = buildTotals(statusHist);

    const sellerZoneRollup: Record<string, Record<string, Cell>> = {};
    for (const [seller, byZone] of Object.entries(sellerZoneHist)) {
      sellerZoneRollup[seller] = {};
      for (const [zone, hist] of Object.entries(byZone)) {
        sellerZoneRollup[seller][zone] = { count: totalCount(hist), modeKg: modeFrom(hist) };
      }
    }
    const zoneStatusRollup: Record<string, Record<string, Cell>> = {};
    for (const [zone, byStatus] of Object.entries(zoneStatusHist)) {
      zoneStatusRollup[zone] = {};
      for (const [status, hist] of Object.entries(byStatus)) {
        zoneStatusRollup[zone][status] = { count: totalCount(hist), modeKg: modeFrom(hist) };
      }
    }

    const sellers = Array.from(sellerHist.keys())
      .sort((a, b) => (sellerTotals[b].count - sellerTotals[a].count));

    const statuses = Array.from(statusSet).sort((a, b) => {
      const ac = statusTotals[a]?.count || 0;
      const bc = statusTotals[b]?.count || 0;
      return bc - ac;
    });

    return NextResponse.json({
      startDate,
      endDate,
      sellers,
      zones,
      statuses,
      data,
      sellerTotals,
      zoneTotals,
      statusTotals,
      sellerZoneRollup,
      zoneStatusRollup,
      grand: { count: totalCount(grandHist), modeKg: modeFrom(grandHist) },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
