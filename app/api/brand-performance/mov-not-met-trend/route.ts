import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  bucket: string;
  cart_count: string;
}

// Trend of DRAFT carts that never met the seller's Minimum Order Value (MOV).
// A cart counts when its amount is strictly below the seller's
// effectiveMinimumOrderValue — i.e. the buyer built a cart but it sat below the
// brand's MOV and was never placed (status = 'DRAFT').
//
// ?granularity=day|week|month (default month)
// ?brand=<prefix>[,<prefix>...]  — same brand-prefix multi-select as the rest of
//   the Brand Performance page. Optional ?startDate/?endDate (else ?year).
//
// Bucketed by po."created_at" (DRAFT carts have no markedPendingTime), same
// non-test / D2R brand-seller / intercity 3PL WHERE clause as the other endpoints.
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');
  const gParam = searchParams.get('granularity');
  const granularity: 'day' | 'week' | 'month' =
    gParam === 'day' ? 'day' : gParam === 'week' ? 'week' : 'month';

  try {
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."created_at"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."created_at"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."created_at") = $${params.length}`;
    }

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      SELECT
        DATE_TRUNC('${granularity}', po."created_at")::date                      AS bucket,
        COUNT(DISTINCT po."id")                                                  AS cart_count
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
        AND po."status"          = 'DRAFT'
        AND COALESCE(po."amount", 0)::numeric < COALESCE(s."effectiveMinimumOrderValue", 0)::numeric
        ${whereDate}
        ${brandFilter}
      GROUP BY bucket
      ORDER BY bucket;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      bucket: r.bucket,
      carts: parseInt(r.cart_count),
    }));

    const total = data.reduce((s, p) => s + p.carts, 0);

    return NextResponse.json({
      data,
      total,
      granularity,
      year,
      brand: brand || null,
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
