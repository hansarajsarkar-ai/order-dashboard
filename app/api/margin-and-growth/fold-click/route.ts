import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  click_date: string;
  total_clicked: string;
  cart_buyers: string;
  placed_buyers: string;
}

// The ₹1 fold whose clicks we track. Fixed for this dashboard.
const FOLD_ID = 'c73a36d3-5d72-4099-86ab-618e0fe75444';

// Daily ₹1-fold click → cart → order funnel.
//   total_clicked – distinct buyers who clicked the fold that day
//   cart_buyers   – of those, how many created a D2R intercity cart the same day
//   placed_buyers – of those, how many placed a (non-DRAFT/REJECTED/CANCELLED) order
// Carts/orders are scoped to the D2R THIRD_PARTY / INTERCITY universe, test
// buyers/sellers (and "milko") excluded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Default window: current calendar year to date.
  const now = new Date();
  const fromParam = searchParams.get('from') || '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
    ? fromParam
    : `${now.getUTCFullYear()}-01-01`;

  try {
    const sql = `
      WITH FoldClicks AS (
        SELECT DISTINCT
          e."created_at"::date AS click_date,
          e."buyerId"
        FROM "events"."event" e
        WHERE e."foldId" = $1
          AND e."buyerId" IS NOT NULL
          AND e."created_at" >= $2::timestamp
      ),
      CartCreations AS (
        SELECT DISTINCT
          po."created_at"::date AS cart_date,
          b."id"     AS "buyerId",
          po."status" AS "orderStatus"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        WHERE po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND s."isD2RBrandSeller" = TRUE
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND s."deliveryNetwork"  = 'THIRD_PARTY'
          AND s."deliveryType"     = 'INTERCITY'
          AND po."created_at" >= $2::timestamp
      )
      SELECT
        fc.click_date::text                              AS click_date,
        COUNT(DISTINCT fc."buyerId")::text               AS total_clicked,
        COUNT(DISTINCT cc."buyerId")::text               AS cart_buyers,
        COUNT(DISTINCT CASE
          WHEN cc."orderStatus" NOT IN ('DRAFT', 'REJECTED', 'CANCELLED')
          THEN cc."buyerId"
        END)::text                                       AS placed_buyers
      FROM FoldClicks fc
      LEFT JOIN CartCreations cc
        ON cc."buyerId" = fc."buyerId"
       AND cc.cart_date = fc.click_date
      GROUP BY 1
      ORDER BY 1 DESC;
    `;

    const rows = await query<Row>(sql, [FOLD_ID, from]);

    const data = rows.map((r) => ({
      date: r.click_date,
      totalClicked: parseInt(r.total_clicked, 10),
      cartBuyers: parseInt(r.cart_buyers, 10),
      placedBuyers: parseInt(r.placed_buyers, 10),
    }));

    const totals = data.reduce(
      (a, r) => ({
        totalClicked: a.totalClicked + r.totalClicked,
        cartBuyers: a.cartBuyers + r.cartBuyers,
        placedBuyers: a.placedBuyers + r.placedBuyers,
      }),
      { totalClicked: 0, cartBuyers: 0, placedBuyers: 0 },
    );

    return NextResponse.json({ data, totals, from });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
