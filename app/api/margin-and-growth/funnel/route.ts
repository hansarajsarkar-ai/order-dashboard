import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  bucket: string;
  dau: string;
  cart_buyers: string;
  order_buyers: string;
  orders: string;
}

const GRANULARITIES: Record<string, 'day' | 'week' | 'month'> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

// Engagement / conversion funnel per bucket:
//   DAU            – distinct active buyers (buyer-app sessions)
//   cart_buyers    – distinct buyers who created a cart (any purchaseOrder)
//   order_buyers   – distinct buyers who actually placed an order (status != DRAFT)
//   orders         – count of placed orders
// Carts/orders are platform-wide (test/false excluded) so the % reads cleanly
// against platform-wide DAU.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const granParam = (searchParams.get('granularity') || 'month').toLowerCase();
  const gran = GRANULARITIES[granParam] || 'month';

  // Date window:
  //  - day  : the selected month (defaults to the current month)
  //  - week : the current calendar year to date
  //  - month: the current calendar year to date
  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (gran === 'day') {
    const monthParam = searchParams.get('month') || '';
    const valid = /^\d{4}-\d{2}$/.test(monthParam);
    const y = valid ? parseInt(monthParam.slice(0, 4), 10) : now.getUTCFullYear();
    const m = valid ? parseInt(monthParam.slice(5, 7), 10) : now.getUTCMonth() + 1; // 1-based
    startDate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of month m
  } else {
    startDate = `${now.getUTCFullYear()}-01-01`;
    endDate = now.toISOString().slice(0, 10);
  }

  try {
    const params: (string | number)[] = [gran, startDate, endDate];

    const sql = `
      WITH dau AS (
        SELECT
          date_trunc($1, h."sessionStartTimestamp")::date AS bucket,
          COUNT(DISTINCT h."buyerId")                     AS dau
        FROM history.session h
        JOIN "users"."buyer" b ON b."id" = h."buyerId"
        WHERE h."isTest"        = FALSE
          AND h."buyerId" IS NOT NULL
          AND h."userType"      = 'buyer'
          AND h."appUsed"       = 'buyer-app'
          AND h."isMasterLogin" = FALSE
          AND b."isTest"        = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND h."sessionStartTimestamp"::date >= $2::date
          AND h."sessionStartTimestamp"::date <= $3::date
        GROUP BY 1
      ),
      po_agg AS (
        SELECT
          date_trunc($1, po."created_at")::date AS bucket,
          COUNT(DISTINCT po."buyerId")                                          AS cart_buyers,
          COUNT(DISTINCT po."buyerId") FILTER (WHERE po."status" != 'DRAFT')    AS order_buyers,
          COUNT(*) FILTER (WHERE po."status" != 'DRAFT')                        AS orders
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."buyer" b ON b."id" = po."buyerId"
        WHERE po."isTest"      = FALSE
          AND po."isFalseOrder" = FALSE
          AND b."isTest"        = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND po."created_at"::date >= $2::date
          AND po."created_at"::date <= $3::date
        GROUP BY 1
      )
      SELECT
        COALESCE(d.bucket, p.bucket)::date::text AS bucket,
        COALESCE(d.dau, 0)::text                 AS dau,
        COALESCE(p.cart_buyers, 0)::text         AS cart_buyers,
        COALESCE(p.order_buyers, 0)::text        AS order_buyers,
        COALESCE(p.orders, 0)::text              AS orders
      FROM dau d
      FULL OUTER JOIN po_agg p ON p.bucket = d.bucket
      ORDER BY 1;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      bucket: r.bucket,
      dau: parseInt(r.dau, 10),
      cartBuyers: parseInt(r.cart_buyers, 10),
      orderBuyers: parseInt(r.order_buyers, 10),
      orders: parseInt(r.orders, 10),
    }));

    const totals = data.reduce(
      (a, r) => ({
        dau: a.dau + r.dau,
        cartBuyers: a.cartBuyers + r.cartBuyers,
        orderBuyers: a.orderBuyers + r.orderBuyers,
        orders: a.orders + r.orders,
      }),
      { dau: 0, cartBuyers: 0, orderBuyers: 0, orders: 0 }
    );

    return NextResponse.json({
      data,
      totals,
      granularity: gran,
      startDate,
      endDate,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
