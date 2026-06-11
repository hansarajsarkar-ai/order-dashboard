import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  month_date: string;
  qualified: number;
  retained: number;   // qualified this month AND the previous month
  new_buyers: number; // first-ever qualifying month is this month
  reactivated: number; // qualified this month, not last month, but qualified some earlier month
}

// Month-over-month requalification cohort. A buyer "qualifies" in a month when
// their monthly DELIVERED/COMPLETED spend with D2R brand sellers is >= ₹3,000
// (L1 threshold). The UI derives churned(M) = qualified(M-1) - retained(M) and
// retention% = retained(M) / qualified(M-1).
async function _GET() {
  try {
    const rows = await cached('qps-retention', 120_000, () => query<Row>(`
      WITH mq AS (
        SELECT po."buyerId" AS buyer_id,
               date_trunc('month', po."markedPendingTime")::date AS m,
               SUM(po."amount") AS amt
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        WHERE po."status" IN ('DELIVERED','COMPLETED')
          AND po."isTest"          = FALSE
          AND po."deliveryType"    = 'INTERCITY'
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."markedPendingTime" >= '2026-03-01'
          AND s."isD2RBrandSeller" = TRUE
          AND s."isTest"           = FALSE
          AND s."businessName"     NOT ILIKE '%test%'
          AND b."isTest"           = FALSE
          AND b."businessName"     NOT ILIKE '%test%'
          AND s."id" != $1
        GROUP BY 1, 2
      ),
      q  AS (SELECT buyer_id, m FROM mq WHERE amt >= 3000),
      fq AS (SELECT buyer_id, MIN(m) AS first_m FROM q GROUP BY buyer_id)
      SELECT
        to_char(q.m, 'YYYY-MM-DD')                                                   AS month_date,
        COUNT(*)::int                                                                AS qualified,
        COUNT(*) FILTER (WHERE prev.buyer_id IS NOT NULL)::int                        AS retained,
        COUNT(*) FILTER (WHERE fq.first_m = q.m)::int                                 AS new_buyers,
        COUNT(*) FILTER (WHERE prev.buyer_id IS NULL AND fq.first_m < q.m)::int       AS reactivated
      FROM q
      LEFT JOIN q prev ON prev.buyer_id = q.buyer_id AND prev.m = (q.m - INTERVAL '1 month')
      JOIN fq ON fq.buyer_id = q.buyer_id
      GROUP BY q.m
      ORDER BY q.m
    `, [EXCLUDED_SELLER]));

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
