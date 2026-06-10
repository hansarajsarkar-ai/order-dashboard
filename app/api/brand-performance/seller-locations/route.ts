import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  sellerId: string;
  businessName: string | null;
  city: string | null;
  state: string | null;
  lat: string;
  lng: string;
  count: string;
  amount: string;
}

// Seller operating locations (lat/long) for the brand-performance map.
// One row per D2R brand seller that delivered orders in the window, with the
// seller's stored coordinates and their delivered order count / GMV.
// Coordinates are constrained to India's bounding box so junk rows (0,0 or
// swapped lat/long) don't drop pins into the ocean.
// Optional ?brand=<comma-separated brand prefixes> narrows to those brands.
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');

  try {
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    // Note the DB column typo: the seller latitude column is "lattitude".
    const sql = `
      SELECT
        s."id"                                       AS "sellerId",
        s."businessName"                             AS "businessName",
        s."city"                                     AS city,
        s."state"                                    AS state,
        s."lattitude"::numeric::text                 AS lat,
        s."longitude"::numeric::text                 AS lng,
        COUNT(*)                                     AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text AS amount
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
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        AND s."lattitude" IS NOT NULL
        AND s."longitude" IS NOT NULL
        AND s."lattitude"::numeric BETWEEN 6 AND 38
        AND s."longitude"::numeric BETWEEN 68 AND 98
        ${whereDate}
        ${brandFilter}
      GROUP BY s."id", s."businessName", s."city", s."state", s."lattitude", s."longitude"
      ORDER BY count DESC;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      sellerId: r.sellerId,
      businessName: r.businessName,
      city: r.city,
      state: r.state,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    }));

    const grand = data.reduce(
      (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      data,
      grand,
      sellers: data.length,
      brand: brand || null,
      year,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
