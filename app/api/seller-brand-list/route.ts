import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  last_order_at: string | null;
  days_since_last_order: string | null;
  total_orders: string;
  total_amount: string;
  delivered_orders: string;
  delivered_amount: string;
  states_covered: string;
  districts_covered: string;
}

// Lists all D2R brand sellers with their visibility footprint:
// - lastOrderAt + daysSinceLastOrder → drives the Active / Inactive badge (active = last order within 30 days)
// - totalOrders / totalAmount over the requested window (defaults: current year, markedPendingTime-bucketed)
// - deliveredOrders / deliveredAmount: subset where status IN ('DELIVERED','COMPLETED')
// - statesCovered / districtsCovered: distinct buyer states / districts the brand has shipped to
//
// Date filter uses startDate/endDate. last_order_at is ALL-TIME so the activity badge isn't biased by the window.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
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
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    const sql = `
      WITH brand_orders AS (
        SELECT
          po."sellerId",
          po."amount"::numeric AS amount,
          po."status",
          po."markedPendingTime",
          b."state"    AS buyer_state,
          b."district" AS buyer_district
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
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."status" != 'DRAFT'
          AND po."markedPendingTime" IS NOT NULL
          ${whereDate}
      ),
      brand_last AS (
        SELECT
          po."sellerId",
          MAX(po."markedPendingTime") AS last_order_at
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
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."status" != 'DRAFT'
          AND po."markedPendingTime" IS NOT NULL
        GROUP BY po."sellerId"
      )
      SELECT
        s."id"::text                                                   AS seller_id,
        s."phone"                                                      AS seller_phone,
        s."businessName"                                               AS seller_business_name,
        bl."last_order_at"                                             AS last_order_at,
        EXTRACT(DAY FROM (NOW() - bl."last_order_at"))::int::text      AS days_since_last_order,
        COUNT(bo.*)                                                    AS total_orders,
        COALESCE(SUM(bo."amount"), 0)::text                            AS total_amount,
        COUNT(*) FILTER (WHERE bo."status" IN ('DELIVERED','COMPLETED')) AS delivered_orders,
        COALESCE(SUM(bo."amount") FILTER (WHERE bo."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(DISTINCT bo."buyer_state")    FILTER (WHERE bo."buyer_state" IS NOT NULL)    AS states_covered,
        COUNT(DISTINCT bo."buyer_district") FILTER (WHERE bo."buyer_district" IS NOT NULL) AS districts_covered
      FROM "users"."seller" s
      LEFT JOIN brand_last bl ON bl."sellerId" = s."id"
      LEFT JOIN brand_orders bo ON bo."sellerId" = s."id"
      WHERE s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
      GROUP BY s."id", s."phone", s."businessName", bl."last_order_at"
      ORDER BY total_orders DESC NULLS LAST, s."businessName" ASC;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => {
      const total = parseInt(r.total_orders || '0');
      const days = r.days_since_last_order ? parseInt(r.days_since_last_order) : null;
      const isActive = days !== null && days <= 30;
      return {
        sellerId: r.seller_id,
        sellerPhone: r.seller_phone,
        sellerBusinessName: r.seller_business_name,
        lastOrderAt: r.last_order_at,
        daysSinceLastOrder: days,
        isActive,
        totalOrders: total,
        totalAmount: parseFloat(r.total_amount || '0'),
        deliveredOrders: parseInt(r.delivered_orders || '0'),
        deliveredAmount: parseFloat(r.delivered_amount || '0'),
        statesCovered: parseInt(r.states_covered || '0'),
        districtsCovered: parseInt(r.districts_covered || '0'),
      };
    });

    return NextResponse.json({
      data,
      year,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
