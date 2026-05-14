import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  day: string;
  orders_count: string;
  orders_amount: string;
  delivered_count: string;
  delivered_amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(currentYear);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    const sql = `
      SELECT
        po."markedPendingTime"::date::text                                                           AS day,
        COUNT(*)                                                                                     AS orders_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                                 AS orders_amount,
        COUNT(*)             FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                 AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text
                                                                                                     AS delivered_amount
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
        AND po."status" != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
      GROUP BY po."markedPendingTime"::date
      ORDER BY day;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      day: r.day,
      ordersCount: parseInt(r.orders_count),
      ordersAmount: parseFloat(r.orders_amount),
      deliveredCount: parseInt(r.delivered_count),
      deliveredAmount: parseFloat(r.delivered_amount),
    }));

    const grand = data.reduce(
      (acc, r) => ({
        ordersCount: acc.ordersCount + r.ordersCount,
        ordersAmount: acc.ordersAmount + r.ordersAmount,
        deliveredCount: acc.deliveredCount + r.deliveredCount,
        deliveredAmount: acc.deliveredAmount + r.deliveredAmount,
      }),
      { ordersCount: 0, ordersAmount: 0, deliveredCount: 0, deliveredAmount: 0 }
    );

    return NextResponse.json({
      data,
      grand,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
