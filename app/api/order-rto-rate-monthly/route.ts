import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  month: string;
  rto_count: string;
  delivered_count: string;
  rto_rate_pct: string | null;
}

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

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    // Cohort definition: bucket by markedPendingTime (order-placed month).
    // For each month X: numerator = orders placed in X that ended REJECTED + deliveryStatus%RTO%.
    // Denominator = orders placed in X that ended (DELIVERED + COMPLETED + that same RTO subset).
    const sql = `
      SELECT
        EXTRACT(MONTH FROM po."markedPendingTime")::int AS month,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%') AS rto_count,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                       AS delivered_count,
        ROUND(
          COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%')::numeric
          / NULLIF(
              COUNT(*) FILTER (
                WHERE (po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%')
                   OR po."status" IN ('DELIVERED','COMPLETED')
              )::numeric
          , 0) * 100
        , 2) AS rto_rate_pct
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${STD_FILTERS}
      GROUP BY EXTRACT(MONTH FROM po."markedPendingTime")
      ORDER BY month;
    `;
    const rows = await query<Row>(sql, [year]);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const data = rows.map((r) => {
      const m = parseInt(r.month);
      return {
        month: m,
        label: monthNames[m - 1] || String(m),
        rtoCount: parseInt(r.rto_count),
        deliveredCount: parseInt(r.delivered_count),
        rtoRate: r.rto_rate_pct === null ? 0 : parseFloat(r.rto_rate_pct),
      };
    });

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
