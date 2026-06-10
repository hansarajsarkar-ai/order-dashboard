import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface OriginRow {
  sellerId: string;
  businessName: string | null;
  city: string | null;
  state: string | null;
  lat: string;
  lng: string;
  count: string;
  amount: string;
}

interface DestRow {
  city: string | null;
  state: string | null;
  lat: string;
  lng: string;
  count: string;
  amount: string;
}

const DEST_LIMIT = 120;

const GROSS = `(po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))`;

// Origins (brand warehouses) + destinations (delivery cities) for the animated
// delivery-flow map. Both sides constrained to India's bbox so arcs never run
// off-map. Requires ?brand=<comma-separated brand prefixes>; without it returns
// empty (the UI prompts the user to pick a brand first).
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');

  if (!brand) {
    return NextResponse.json({
      origins: [], destinations: [], brand: null, year,
      destLimit: DEST_LIMIT, truncated: false, timestamp: new Date().toISOString(),
    });
  }

  try {
    // $1 = brand (shared); date params appended per query.
    const baseFilters = `
      po."isTest"          = FALSE
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
      AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($1, ','))`;

    const buildDate = (params: (string | number)[]): string => {
      if (startDate || endDate) {
        let d = '';
        if (startDate) { params.push(startDate); d += ` AND po."markedPendingTime"::date >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   d += ` AND po."markedPendingTime"::date <= $${params.length}`; }
        return d;
      }
      params.push(year);
      return ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    };

    // --- Origins: the brand's seller warehouses with coordinates ---
    const oParams: (string | number)[] = [brand];
    const oDate = buildDate(oParams);
    const originSql = `
      SELECT
        s."id"                       AS "sellerId",
        s."businessName"             AS "businessName",
        s."city"                     AS city,
        s."state"                    AS state,
        s."lattitude"::numeric::text AS lat,
        s."longitude"::numeric::text AS lng,
        COUNT(*)                     AS count,
        COALESCE(SUM(${GROSS}), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE ${baseFilters}
        AND s."lattitude" IS NOT NULL AND s."longitude" IS NOT NULL
        AND s."lattitude"::numeric BETWEEN 6 AND 38
        AND s."longitude"::numeric BETWEEN 68 AND 98
        ${oDate}
      GROUP BY s."id", s."businessName", s."city", s."state", s."lattitude", s."longitude"
      ORDER BY count DESC;
    `;

    // --- Destinations: delivery cities (avg buyer coords) for the brand ---
    const dParams: (string | number)[] = [brand];
    const dDate = buildDate(dParams);
    const destSql = `
      SELECT
        b."city"                                  AS city,
        b."state"                                 AS state,
        ROUND(AVG(b."lattitude"::numeric), 5)::text AS lat,
        ROUND(AVG(b."longitude"::numeric), 5)::text AS lng,
        COUNT(*)                                  AS count,
        COALESCE(SUM(${GROSS}), 0)::text          AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE ${baseFilters}
        AND b."lattitude" IS NOT NULL AND b."longitude" IS NOT NULL
        AND b."lattitude"::numeric BETWEEN 6 AND 38
        AND b."longitude"::numeric BETWEEN 68 AND 98
        ${dDate}
      GROUP BY b."city", b."state"
      ORDER BY count DESC
      LIMIT ${DEST_LIMIT + 1};
    `;

    // --- Island destinations: offshore UTs (Andaman & Nicobar / Lakshadweep)
    // ship 1–2 orders per city, so they rank below the top-120 cut and get
    // truncated. Pull them unconditionally (no LIMIT) so the map's island inset
    // always reflects them. Same filters as destSql — only the bbox narrows. ---
    const iParams: (string | number)[] = [brand];
    const iDate = buildDate(iParams);
    const islandSql = `
      SELECT
        b."city"                                  AS city,
        b."state"                                 AS state,
        ROUND(AVG(b."lattitude"::numeric), 5)::text AS lat,
        ROUND(AVG(b."longitude"::numeric), 5)::text AS lng,
        COUNT(*)                                  AS count,
        COALESCE(SUM(${GROSS}), 0)::text          AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE ${baseFilters}
        AND b."lattitude" IS NOT NULL AND b."longitude" IS NOT NULL
        AND (
          (b."longitude"::numeric >= 90 AND b."lattitude"::numeric <= 16)
          OR (b."longitude"::numeric BETWEEN 71 AND 74.5 AND b."lattitude"::numeric BETWEEN 8 AND 12.5)
        )
        ${iDate}
      GROUP BY b."city", b."state"
      ORDER BY count DESC;
    `;

    const [originRows, destRows, islandRows] = await Promise.all([
      query<OriginRow>(originSql, oParams),
      query<DestRow>(destSql, dParams),
      query<DestRow>(islandSql, iParams),
    ]);

    const truncated = destRows.length > DEST_LIMIT;
    const origins = originRows.map((r) => ({
      sellerId: r.sellerId,
      businessName: r.businessName,
      city: r.city,
      state: r.state,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    }));
    const mapDest = (r: DestRow) => ({
      city: r.city,
      state: r.state,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    });
    const destinations = destRows.slice(0, DEST_LIMIT).map(mapDest);
    // Graft in any island cities the top-120 cut dropped (dedupe by city+state).
    const seenDest = new Set(destinations.map((d) => `${d.city}|${d.state}`));
    for (const r of islandRows) {
      const key = `${r.city}|${r.state}`;
      if (!seenDest.has(key)) { destinations.push(mapDest(r)); seenDest.add(key); }
    }

    const totalDelivered = destinations.reduce((a, r) => a + r.count, 0);
    const totalAmount = destinations.reduce((a, r) => a + r.amount, 0);

    return NextResponse.json({
      origins,
      destinations,
      totalDelivered,
      totalAmount,
      destLimit: DEST_LIMIT,
      truncated,
      brand,
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
