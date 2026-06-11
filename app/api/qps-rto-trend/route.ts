import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  month_date: string;
  placed: number;
  delivered: number;
  delivered_cnt: number;
  rto: number;
  rto_cnt: number;
}

// Monthly delivery health across the scheme (D2R brand sellers, INTERCITY /
// THIRD_PARTY), bucketed by order-placed month (markedPendingTime).
// RTO is the dedicated deliveryStatus = 'RTO' flag (an actual return-to-origin),
// NOT status = 'REJECTED' (which also covers auto/seller rejections).
// delivered = COMPLETED/DELIVERED. The UI derives:
//   RTO amount % = rto / (delivered + rto), RTO count % = rto_cnt / (delivered_cnt + rto_cnt).
async function _GET() {
  try {
    const rows = await cached('qps-rto-trend', 120_000, () => query<Row>(`
      SELECT
        to_char(date_trunc('month', po."markedPendingTime"), 'YYYY-MM-DD') AS month_date,
        SUM(CASE WHEN po."status" NOT IN ('DRAFT','CANCELLED')   THEN po."amount" ELSE 0 END)::int AS placed,
        SUM(CASE WHEN po."status" IN ('COMPLETED','DELIVERED')   THEN po."amount" ELSE 0 END)::int AS delivered,
        COUNT(*) FILTER (WHERE po."status" IN ('COMPLETED','DELIVERED'))::int                AS delivered_cnt,
        SUM(CASE WHEN po."deliveryStatus" = 'RTO'                THEN po."amount" ELSE 0 END)::int AS rto,
        COUNT(*) FILTER (WHERE po."deliveryStatus" = 'RTO')::int                             AS rto_cnt
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE po."isTest"          = FALSE
        AND po."deliveryType"    = 'INTERCITY'
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."markedPendingTime" >= '2026-03-01'
        AND s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName"     NOT ILIKE '%test%'
        AND b."isTest"           = FALSE
        AND b."businessName"     NOT ILIKE '%test%'
        AND s."id" != $1
      GROUP BY 1
      ORDER BY 1
    `, [EXCLUDED_SELLER]));

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
