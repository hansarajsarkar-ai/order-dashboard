import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  day: string;
  orders_count: string;
  orders_amount: string;
  avg_order_amount: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '30')));

  try {
    const sql = `
      SELECT
        po."markedCompletedTime"::date::text AS day,
        COUNT(DISTINCT po."id")              AS orders_count,
        COALESCE(
          SUM(
            po."amount"::numeric
            + COALESCE(po."platformMarginDiscount"::numeric, 0)
            + COALESCE(po."totalDiscount"::numeric, 0)
          ),
        0)::text                             AS orders_amount,
        ROUND(
          COALESCE(
            SUM(
              po."amount"::numeric
              + COALESCE(po."platformMarginDiscount"::numeric, 0)
              + COALESCE(po."totalDiscount"::numeric, 0)
            ),
          0)
          / NULLIF(COUNT(DISTINCT po."id"), 0)
        , 2)::text                           AS avg_order_amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE po."status" = 'COMPLETED'
        AND po."markedCompletedTime" >= current_date - ($1 || ' days')::interval
        AND s."isD2RBrandSeller" = TRUE
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."businessName" NOT ILIKE '%milko%'
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType" = 'INTERCITY'
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isFalseOrder" = FALSE
      GROUP BY po."markedCompletedTime"::date
      ORDER BY po."markedCompletedTime"::date;
    `;

    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({
      day: r.day,
      ordersCount: parseInt(r.orders_count),
      ordersAmount: parseFloat(r.orders_amount),
      avgOrderAmount: parseFloat(r.avg_order_amount),
    }));

    const grand = data.reduce(
      (acc, r) => ({
        ordersCount: acc.ordersCount + r.ordersCount,
        ordersAmount: acc.ordersAmount + r.ordersAmount,
      }),
      { ordersCount: 0, ordersAmount: 0 }
    );

    return NextResponse.json({
      data,
      grand,
      days,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
