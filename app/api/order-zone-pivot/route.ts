import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

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

type Cell = { count: number; modeKg: number; avgKg: number; medianKg: number };

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

function avgFrom(weightHist: Map<number, number>): number {
  let total = 0;
  let sum = 0;
  for (const [g, c] of weightHist) { total += c; sum += g * c; }
  return total === 0 ? 0 : (sum / total) / 1000;
}

function medianFrom(weightHist: Map<number, number>): number {
  let total = 0;
  for (const c of weightHist.values()) total += c;
  if (total === 0) return 0;
  const target = total / 2;
  const sorted = Array.from(weightHist.entries()).sort((a, b) => a[0] - b[0]);
  let running = 0;
  for (const [g, c] of sorted) {
    running += c;
    if (running >= target) return g / 1000;
  }
  return 0;
}

function totalCount(weightHist: Map<number, number>): number {
  let total = 0;
  for (const c of weightHist.values()) total += c;
  return total;
}

function cellFrom(hist: Map<number, number>): Cell {
  return {
    count: totalCount(hist),
    modeKg: modeFrom(hist),
    avgKg: avgFrom(hist),
    medianKg: medianFrom(hist),
  };
}

function mergeInto(target: Map<number, number>, source: Map<number, number>) {
  for (const [g, c] of source) target.set(g, (target.get(g) || 0) + c);
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = searchParams.get('startDate') || fmt(firstOfMonth);
  const endDate = searchParams.get('endDate') || fmt(today);

  try {
    const params: (string | number)[] = [startDate, endDate];
    const monthsFilter = appendMonthsFilter(searchParams.get('months'), 'a."created_at"', params);
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
        ${monthsFilter}
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND c."isTest" = FALSE
        AND c."businessName" NOT ILIKE '%test%'
        AND a."deliveryPartnerId" = 'DELHIVERY'
        AND a."deliveryCostReportJSON" -> 0 ->> 'zone' IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY seller, zone, status;
    `;

    const rows = await query<Row>(sql, params);

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
          data[seller][zone][status] = cellFrom(hist);
        }
      }
    }

    const buildTotals = (m: Map<string, Map<number, number>>) => {
      const out: Record<string, Cell> = {};
      for (const [k, h] of m) {
        out[k] = cellFrom(h);
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
        sellerZoneRollup[seller][zone] = cellFrom(hist);
      }
    }
    const zoneStatusRollup: Record<string, Record<string, Cell>> = {};
    for (const [zone, byStatus] of Object.entries(zoneStatusHist)) {
      zoneStatusRollup[zone] = {};
      for (const [status, hist] of Object.entries(byStatus)) {
        zoneStatusRollup[zone][status] = cellFrom(hist);
      }
    }

    const sellers = Array.from(sellerHist.keys())
      .sort((a, b) => (sellerTotals[b].count - sellerTotals[a].count));

    const statuses = Array.from(statusSet).sort((a, b) => {
      const ac = statusTotals[a]?.count || 0;
      const bc = statusTotals[b]?.count || 0;
      return bc - ac;
    });

    // Fetch one address per distinct businessName for the sellers in this window.
    // DISTINCT ON keeps the most recently created seller row when names collide.
    const sellerAddresses: Record<string, string> = {};
    if (sellers.length > 0) {
      const addrSql = `
        SELECT DISTINCT ON (s."businessName")
          s."businessName"  AS seller,
          s."addressLine1"  AS "addressLine1",
          s."landmark"      AS "landmark",
          s."pincode"       AS "pincode",
          s."city"          AS "city",
          s."district"      AS "district",
          s."state"         AS "state"
        FROM "users"."seller" s
        WHERE s."businessName" = ANY($1::text[])
        ORDER BY s."businessName", s."created_at" DESC NULLS LAST
      `;
      type AddrRow = {
        seller: string;
        addressLine1: string | null;
        landmark: string | null;
        pincode: string | null;
        city: string | null;
        district: string | null;
        state: string | null;
      };
      const addrRows = await query<AddrRow>(addrSql, [sellers]);
      for (const r of addrRows) {
        const parts = [r.addressLine1, r.landmark, r.pincode, r.city, r.district, r.state]
          .map((p) => (p ?? '').toString().trim())
          .filter((p) => p.length > 0);
        if (parts.length > 0) sellerAddresses[r.seller] = parts.join('_');
      }
    }

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
      sellerAddresses,
      grand: cellFrom(grandHist),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
