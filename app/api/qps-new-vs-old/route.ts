import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  month: string;
  new_qualified: string;
  old_qualified: string;
}

async function _GET() {
  try {
    const rows = await query<Row>(`
      WITH base AS (
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
      ),
      first_order AS (
        SELECT
          b."id" AS "buyerId",
          date_trunc('month', MIN(po."markedPendingTime"))::date AS "firstMonth"
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
          AND s."id" != $1
        GROUP BY 1
      )
      SELECT
        TO_CHAR(base."month", 'Mon YYYY') AS month,
        base."month" AS month_date,
        COUNT(DISTINCT CASE
          WHEN base."totalAmount" >= 3000 AND base."month" = fo."firstMonth"
          THEN base."buyerId"
        END)::text AS new_qualified,
        COUNT(DISTINCT CASE
          WHEN base."totalAmount" >= 3000 AND base."month" > fo."firstMonth"
          THEN base."buyerId"
        END)::text AS old_qualified
      FROM base
      LEFT JOIN first_order fo ON fo."buyerId" = base."buyerId"
      GROUP BY base."month"
      ORDER BY base."month" DESC
    `, [EXCLUDED_SELLER]);

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
