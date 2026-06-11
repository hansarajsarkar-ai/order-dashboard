import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  gift_name: string;
  buyer_count: string;
}

async function _GET() {
  try {
    const rows = await cached('qps-gifts', 120_000, () => query<Row>(`
      WITH x AS (
        SELECT
          b."id" AS "buyerId",
          SUM(po."amount") AS "totalSpend",
          CASE
            WHEN SUM(po."amount") >= 30000 THEN 'Airfryer/Mixer (Worth 3000)'
            WHEN SUM(po."amount") >= 20000 THEN 'CCTV/Iron (Worth 2000)'
            WHEN SUM(po."amount") >= 10000 THEN 'Speaker (Worth 1000)'
            WHEN SUM(po."amount") >= 5000  THEN 'Mini table fan (Worth 500)'
            WHEN SUM(po."amount") >= 3000  THEN 'Vastu tortoise (Worth 300)'
          END AS "giftWon"
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
          AND po."markedPendingTime" >= date_trunc('month', NOW())
          AND s."id" != $1
        GROUP BY 1
        HAVING SUM(po."amount") >= 3000
      ),
      gifts AS (
        SELECT * FROM (VALUES
          (1, 'Airfryer/Mixer (Worth 3000)'),
          (2, 'CCTV/Iron (Worth 2000)'),
          (3, 'Speaker (Worth 1000)'),
          (4, 'Mini table fan (Worth 500)'),
          (5, 'Vastu tortoise (Worth 300)')
        ) v(pos, "giftName")
      )
      SELECT
        g."giftName"                         AS gift_name,
        COUNT(DISTINCT x."buyerId")::text    AS buyer_count
      FROM gifts g
      LEFT JOIN x ON x."giftWon" = g."giftName"
      GROUP BY g."giftName", g.pos
      ORDER BY g.pos
    `, [EXCLUDED_SELLER]));

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
