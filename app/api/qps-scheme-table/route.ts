import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  month: string;
  delivered_buyers: string;
  qualified_buyers: string;
  level1: string;
  level2: string;
  level3: string;
}

export async function GET() {
  try {
    const rows = await query<Row>(`
      WITH monthly AS (
        SELECT
          b."id" AS "buyerId",
          date_trunc('month', po."markedPendingTime")::date AS "month",
          SUM(po."amount") AS "totalAmount"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."buyer"  b ON b."id"  = po."buyerId"
        JOIN "users"."seller" s ON s."id"  = po."sellerId"
        WHERE po."status" IN ('DELIVERED', 'COMPLETED')
          AND s."isD2RBrandSeller" = TRUE
          AND s."isTest" = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND b."isTest" = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND po."isTest" = FALSE
          AND po."markedPendingTime" >= date_trunc('year', NOW())
          AND s."id" != $1
        GROUP BY 1, 2
      )
      SELECT
        TO_CHAR("month", 'Mon YYYY') AS month,
        "month" AS month_date,
        COUNT(DISTINCT "buyerId")::text                                                                      AS delivered_buyers,
        COUNT(DISTINCT CASE WHEN "totalAmount" >= 3000 THEN "buyerId" END)::text                            AS qualified_buyers,
        COUNT(DISTINCT CASE WHEN "totalAmount" >= 3000 AND "totalAmount" < 5000  THEN "buyerId" END)::text  AS level1,
        COUNT(DISTINCT CASE WHEN "totalAmount" >= 5000 AND "totalAmount" < 10000 THEN "buyerId" END)::text  AS level2,
        COUNT(DISTINCT CASE WHEN "totalAmount" >= 10000 THEN "buyerId" END)::text                           AS level3
      FROM monthly
      GROUP BY "month"
      ORDER BY "month" DESC
    `, [EXCLUDED_SELLER]);

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
