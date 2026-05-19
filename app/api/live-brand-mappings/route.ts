import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  seller_email: string | null;
  minimum_order_value: string | null;
  commission_pct: string | null;
  brand_id: string;
  brand_label: string;
  is_live: boolean | string;
  last_order_at: string | null;
  days_since_last_order: string | null;
  seller_total_orders: string;
  seller_total_amount: string;
  seller_states_covered: string;
  seller_districts_covered: string;
}

// One row per (seller, brand) mapping from "users"."seller_brand".
// is_live = TRUE iff the row satisfies the user's canonical "active brand" query:
//   - s.isD2RBrandSeller = TRUE
//   - s.isActive          = TRUE
//   - s.deliveryType      = 'INTERCITY'
//   - s.deliveryNetwork   = 'THIRD_PARTY'
//   - s.pickupAddressName IS NOT NULL
//   - s.isTest            = FALSE, businessName NOT ILIKE '%test%'/%milko%'
//   - sbm.isActive        = TRUE
//   - sbm.fulfilmentZone  IS NOT NULL AND != '[]'
// Counting rows where is_live = TRUE reproduces the canonical 33-row answer.
//
// Activity columns (last_order_at, total_orders, total_amount, states/districts) are
// at the seller grain — a seller with N brand mappings produces N rows that all share
// the same numbers, so a row-level SUM would double-count. The tab's KPI tiles and
// footer dedupe by seller_id before summing GMV.
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
      WITH all_mappings AS (
        SELECT
          s."id"::text                                                  AS seller_id,
          s."phone"                                                     AS seller_phone,
          s."businessName"                                              AS seller_business_name,
          s."email"                                                     AS seller_email,
          s."minimumOrderValue"                                         AS minimum_order_value,
          (s."deliveryChargesJSON" -> 'badhoFees' ->> 'value')::numeric AS commission_pct,
          s."isActive"                                                  AS seller_is_active,
          s."deliveryType"                                              AS seller_delivery_type,
          s."deliveryNetwork"                                           AS seller_delivery_network,
          s."pickupAddressName"                                         AS seller_pickup_address,
          sbm."brandId"::text                                           AS brand_id,
          sbm."isActive"                                                AS mapping_is_active,
          sbm."fulfilmentZone"::text                                    AS fulfilment_zone_text,
          br."label"                                                    AS brand_label
        FROM "users"."seller" s
        JOIN "users"."seller_brand" sbm ON sbm."sellerId" = s."id"
        JOIN "brands"."brand"        br  ON br."id"       = sbm."brandId"
        WHERE s."isD2RBrandSeller" = TRUE
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
      ),
      last_all AS (
        SELECT
          po."sellerId"::text         AS seller_id,
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
          AND po."status" IN ('DELIVERED', 'COMPLETED')
          AND po."markedPendingTime" IS NOT NULL
        GROUP BY po."sellerId"
      ),
      windowed AS (
        SELECT
          po."sellerId"::text                                                                   AS seller_id,
          COUNT(*)                                                                              AS total_orders,
          COALESCE(SUM(po."amount"::numeric), 0)                                                AS total_amount,
          COUNT(DISTINCT b."state")    FILTER (WHERE b."state"    IS NOT NULL)                  AS states_covered,
          COUNT(DISTINCT b."district") FILTER (WHERE b."district" IS NOT NULL)                  AS districts_covered
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
          AND po."status" IN ('DELIVERED', 'COMPLETED')
          AND po."markedPendingTime" IS NOT NULL
          ${whereDate}
        GROUP BY po."sellerId"
      )
      SELECT
        am.seller_id,
        am.seller_phone,
        am.seller_business_name,
        am.seller_email,
        am.minimum_order_value::text                                                          AS minimum_order_value,
        am.commission_pct::text                                                               AS commission_pct,
        am.brand_id,
        am.brand_label,
        (
              am.seller_is_active        = TRUE
          AND am.seller_delivery_type    = 'INTERCITY'
          AND am.seller_delivery_network = 'THIRD_PARTY'
          AND am.seller_pickup_address IS NOT NULL
          AND am.mapping_is_active       = TRUE
          AND am.fulfilment_zone_text   IS NOT NULL
          AND am.fulfilment_zone_text   != '[]'
        )                                                                                     AS is_live,
        la.last_order_at,
        EXTRACT(DAY FROM (NOW() - la.last_order_at))::int::text                               AS days_since_last_order,
        COALESCE(w.total_orders, 0)::text                                                     AS seller_total_orders,
        COALESCE(w.total_amount, 0)::text                                                     AS seller_total_amount,
        COALESCE(w.states_covered, 0)::text                                                   AS seller_states_covered,
        COALESCE(w.districts_covered, 0)::text                                                AS seller_districts_covered
      FROM all_mappings am
      LEFT JOIN last_all la ON la.seller_id = am.seller_id
      LEFT JOIN windowed  w ON w.seller_id  = am.seller_id
      ORDER BY
        (
              am.seller_is_active        = TRUE
          AND am.seller_delivery_type    = 'INTERCITY'
          AND am.seller_delivery_network = 'THIRD_PARTY'
          AND am.seller_pickup_address IS NOT NULL
          AND am.mapping_is_active       = TRUE
          AND am.fulfilment_zone_text   IS NOT NULL
          AND am.fulfilment_zone_text   != '[]'
        ) DESC,
        COALESCE(w.total_orders, 0) DESC,
        am.brand_label ASC;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => {
      const days = r.days_since_last_order ? parseInt(r.days_since_last_order) : null;
      const isLive = r.is_live === true || r.is_live === 'true' || r.is_live === 't';
      return {
        sellerId: r.seller_id,
        sellerPhone: r.seller_phone,
        sellerBusinessName: r.seller_business_name,
        sellerEmail: r.seller_email,
        minimumOrderValue: r.minimum_order_value !== null ? parseFloat(r.minimum_order_value) : null,
        commissionPct: r.commission_pct !== null ? parseFloat(r.commission_pct) : null,
        brandId: r.brand_id,
        brandLabel: r.brand_label,
        isLive,
        lastOrderAt: r.last_order_at,
        daysSinceLastOrder: days,
        sellerTotalOrders: parseInt(r.seller_total_orders || '0'),
        sellerTotalAmount: parseFloat(r.seller_total_amount || '0'),
        sellerStatesCovered: parseInt(r.seller_states_covered || '0'),
        sellerDistrictsCovered: parseInt(r.seller_districts_covered || '0'),
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
