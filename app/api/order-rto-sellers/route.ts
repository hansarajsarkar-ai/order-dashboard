import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_name: string | null;
  count: string;
}

// Same eligibility/test filters as the RTO trend chart so the dropdown only
// surfaces sellers that actually contribute to the trend.
const STD_FILTERS = `
  AND po."isTest"          = FALSE
  AND po."isFalseOrder"    = FALSE
  AND b."isTest"           = FALSE
  AND b."businessName" NOT ILIKE '%test%'
  AND s."isTest"           = FALSE
  AND s."businessName" NOT ILIKE '%test%'
  AND s."businessName" NOT ILIKE '%milko%'
  AND s."isD2RBrandSeller" = TRUE
  AND po."deliveryNetwork" = 'THIRD_PARTY'
  AND po."deliveryType"    = 'INTERCITY'
`;

// Distinct sellers that have RTO orders in the given year, with their RTO order
// counts. Powers the seller multi-select on the RTO trend chart. Year-scoped
// (not month/granularity-scoped) so the option set stays stable as the user
// changes the trend's date window.
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const params: (string | number)[] = [year];
    const sql = `
      SELECT
        po."sellerId"::text                         AS seller_id,
        MIN(s."businessName")                        AS seller_name,
        COUNT(*)                                     AS count
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status" = 'REJECTED'
        AND po."deliveryStatus" ILIKE '%RTO%'
        AND po."markedRejectedTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedRejectedTime") = $1
        ${STD_FILTERS}
      GROUP BY po."sellerId"
      ORDER BY COUNT(*) DESC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      sellerId: r.seller_id,
      sellerName: r.seller_name || r.seller_id,
      count: parseInt(r.count),
    }));

    return NextResponse.json({
      data,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
