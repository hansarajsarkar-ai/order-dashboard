import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  month: string;
  pincode_covered: string;
  pincode_orders: string;
  pincode_amount: string;
  city_covered: string;
  city_orders: string;
  city_amount: string;
  district_covered: string;
  district_orders: string;
  district_amount: string;
  state_covered: string;
  state_orders: string;
  state_amount: string;
}

type GeoKey = 'pincode' | 'city' | 'district' | 'state';
type Cell = { covered: number; count: number; amount: number };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
        EXTRACT(MONTH FROM po."markedPendingTime")::int AS month,

        COUNT(DISTINCT b."pincode") FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> '')::text AS pincode_covered,
        COUNT(*) FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> '')::text AS pincode_orders,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> ''), 0)::text AS pincode_amount,

        COUNT(DISTINCT (b."state", b."city")) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> '')::text AS city_covered,
        COUNT(*) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> '')::text AS city_orders,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> ''), 0)::text AS city_amount,

        COUNT(DISTINCT (b."state", b."district")) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> '')::text AS district_covered,
        COUNT(*) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> '')::text AS district_orders,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> ''), 0)::text AS district_amount,

        COUNT(DISTINCT b."state") FILTER (WHERE b."state" IS NOT NULL AND b."state" <> '')::text AS state_covered,
        COUNT(*) FILTER (WHERE b."state" IS NOT NULL AND b."state" <> '')::text AS state_orders,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."state" IS NOT NULL AND b."state" <> ''), 0)::text AS state_amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status"         != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
      GROUP BY EXTRACT(MONTH FROM po."markedPendingTime")
      ORDER BY month;
    `;

    const rows = await query<Row>(sql, [year]);

    // Yearly distinct counts (for the Total column) — need a separate query
    // because COUNT(DISTINCT) doesn't sum across months.
    const totalsSql = `
      SELECT
        COUNT(DISTINCT b."pincode") FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> '')::text AS pincode_covered,
        COUNT(DISTINCT (b."state", b."city")) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> '')::text AS city_covered,
        COUNT(DISTINCT (b."state", b."district")) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> '')::text AS district_covered,
        COUNT(DISTINCT b."state") FILTER (WHERE b."state" IS NOT NULL AND b."state" <> '')::text AS state_covered
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status"         != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1;
    `;
    const totalsRows = await query<{ pincode_covered: string; city_covered: string; district_covered: string; state_covered: string }>(totalsSql, [year]);
    const yearlyCovered = totalsRows[0] || { pincode_covered: '0', city_covered: '0', district_covered: '0', state_covered: '0' };

    // months[geoKey][month] = { covered, count, amount }
    const months: Record<GeoKey, Record<number, Cell>> = {
      pincode: {}, city: {}, district: {}, state: {},
    };
    const totalsByMonth: Record<number, { count: number; amount: number }> = {};
    const totalByGeo: Record<GeoKey, { count: number; amount: number }> = {
      pincode: { count: 0, amount: 0 },
      city:    { count: 0, amount: 0 },
      district:{ count: 0, amount: 0 },
      state:   { count: 0, amount: 0 },
    };

    for (const r of rows) {
      const m = parseInt(String(r.month));
      months.pincode[m]  = { covered: parseInt(r.pincode_covered),  count: parseInt(r.pincode_orders),  amount: parseFloat(r.pincode_amount) };
      months.city[m]     = { covered: parseInt(r.city_covered),     count: parseInt(r.city_orders),     amount: parseFloat(r.city_amount) };
      months.district[m] = { covered: parseInt(r.district_covered), count: parseInt(r.district_orders), amount: parseFloat(r.district_amount) };
      months.state[m]    = { covered: parseInt(r.state_covered),    count: parseInt(r.state_orders),    amount: parseFloat(r.state_amount) };

      // Use the pincode row for grand totals (same denominator as count(*))
      totalsByMonth[m] = { count: parseInt(r.pincode_orders), amount: parseFloat(r.pincode_amount) };
      (Object.keys(totalByGeo) as GeoKey[]).forEach((k) => {
        totalByGeo[k].count  += months[k][m].count;
        totalByGeo[k].amount += months[k][m].amount;
      });
    }

    const totalCovered: Record<GeoKey, number> = {
      pincode:  parseInt(yearlyCovered.pincode_covered),
      city:     parseInt(yearlyCovered.city_covered),
      district: parseInt(yearlyCovered.district_covered),
      state:    parseInt(yearlyCovered.state_covered),
    };

    const grand = {
      count:  totalByGeo.pincode.count,   // pincode row has the broadest non-null pool, but tie all to same total
      amount: totalByGeo.pincode.amount,
    };

    const data = (['pincode', 'city', 'district', 'state'] as GeoKey[]).map((geo) => ({
      geo,
      months: months[geo],
      total: { covered: totalCovered[geo], count: totalByGeo[geo].count, amount: totalByGeo[geo].amount },
    }));

    return NextResponse.json({
      data,
      totals: { byMonth: totalsByMonth, grand },
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
