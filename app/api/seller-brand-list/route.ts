import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand_name: string;
  seller_ids: string;
  seller_business_names: string;
  brand_labels: string | null;
  is_live: boolean | string;
  last_order_at: string | null;
  days_since_last_order: string | null;
  total_orders: string;
  total_amount: string;
  delivered_orders: string;
  delivered_amount: string;
  states_covered: string;
  districts_covered: string;
}

// Returns two distinct status flags per brand:
//   - is_active = recency-based (last order within 30 days). Used by Geography UI.
//   - is_live   = configuration-based, from the user's canonical "active brand" query:
//                   seller is D2R, isActive, INTERCITY × THIRD_PARTY, has pickup address,
//                   not test/milko, and has at least one active seller_brand mapping with
//                   a non-empty fulfilmentZone.
//                 Used by the Live brand tab.
//
// Display brand name groups by TRIM(SPLIT_PART(businessName, '-', 1)) so
// "ChukDe - GT" + "ChukDe - NonGT" collapse into one row; actual brand record
// labels from "brands"."brand" are surfaced alongside via the brand_labels column.
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
      WITH eligible_sellers AS (
        -- User's canonical "active brand" query, distilled to seller IDs.
        SELECT DISTINCT s."id"::text AS seller_id
        FROM "users"."seller" s
        JOIN "users"."seller_brand" sbm ON sbm."sellerId" = s."id"
        WHERE s."isD2RBrandSeller" = TRUE
          AND s."isActive"          = TRUE
          AND s."deliveryType"      = 'INTERCITY'
          AND s."deliveryNetwork"   = 'THIRD_PARTY'
          AND s."pickupAddressName" IS NOT NULL
          AND s."isTest"            = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
          AND sbm."isActive"        = TRUE
          AND sbm."fulfilmentZone"  IS NOT NULL
          AND sbm."fulfilmentZone"::text != '[]'
      ),
      brand_labels_per_seller AS (
        -- Resolve human-readable brand labels per seller from brands.brand.
        SELECT
          s."id"::text AS seller_id,
          STRING_AGG(DISTINCT br."label", ', ') AS brand_labels
        FROM "users"."seller" s
        JOIN "users"."seller_brand" sbm ON sbm."sellerId" = s."id"
        JOIN "brands"."brand"        br  ON br."id"       = sbm."brandId"
        WHERE sbm."isActive" = TRUE
        GROUP BY s."id"
      ),
      seller_brand AS (
        SELECT
          s."id"::text       AS seller_id,
          s."businessName"   AS seller_business_name,
          TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) AS brand_name
        FROM "users"."seller" s
        WHERE s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."isD2RBrandSeller" = TRUE
      ),
      windowed AS (
        SELECT
          po."sellerId"::text    AS seller_id,
          po."amount"::numeric   AS amount,
          po."status",
          b."state"              AS buyer_state,
          b."district"           AS buyer_district
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
      ),
      last_all AS (
        SELECT
          po."sellerId"::text AS seller_id,
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
      brand_sellers AS (
        SELECT
          sb.brand_name,
          STRING_AGG(sb.seller_id,            ',' ORDER BY sb.seller_id)            AS seller_ids,
          STRING_AGG(sb.seller_business_name, '|' ORDER BY sb.seller_business_name) AS seller_business_names,
          STRING_AGG(blps.brand_labels, ' · ')                                       AS brand_labels,
          BOOL_OR(es.seller_id IS NOT NULL)                                          AS is_live
        FROM seller_brand sb
        LEFT JOIN eligible_sellers          es   ON es.seller_id   = sb.seller_id
        LEFT JOIN brand_labels_per_seller   blps ON blps.seller_id = sb.seller_id
        GROUP BY sb.brand_name
      ),
      brand_metrics AS (
        SELECT
          sb.brand_name,
          COUNT(w.*)                                                                      AS total_orders,
          COALESCE(SUM(w.amount), 0)                                                      AS total_amount,
          COUNT(*) FILTER (WHERE w.status IN ('DELIVERED','COMPLETED'))                   AS delivered_orders,
          COALESCE(SUM(w.amount) FILTER (WHERE w.status IN ('DELIVERED','COMPLETED')), 0) AS delivered_amount,
          COUNT(DISTINCT w.buyer_state)    FILTER (WHERE w.buyer_state    IS NOT NULL)    AS states_covered,
          COUNT(DISTINCT w.buyer_district) FILTER (WHERE w.buyer_district IS NOT NULL)    AS districts_covered
        FROM seller_brand sb
        LEFT JOIN windowed w ON w.seller_id = sb.seller_id
        GROUP BY sb.brand_name
      ),
      brand_last AS (
        SELECT sb.brand_name, MAX(la.last_order_at) AS last_order_at
        FROM seller_brand sb
        LEFT JOIN last_all la ON la.seller_id = sb.seller_id
        GROUP BY sb.brand_name
      )
      SELECT
        bs.brand_name,
        bs.seller_ids,
        bs.seller_business_names,
        bs.brand_labels,
        bs.is_live,
        bl.last_order_at,
        EXTRACT(DAY FROM (NOW() - bl.last_order_at))::int::text AS days_since_last_order,
        bm.total_orders::text,
        bm.total_amount::text,
        bm.delivered_orders::text,
        bm.delivered_amount::text,
        bm.states_covered::text,
        bm.districts_covered::text
      FROM brand_sellers bs
      LEFT JOIN brand_metrics bm ON bm.brand_name = bs.brand_name
      LEFT JOIN brand_last    bl ON bl.brand_name = bs.brand_name
      ORDER BY bm.total_orders DESC NULLS LAST, bs.brand_name ASC;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => {
      const days = r.days_since_last_order ? parseInt(r.days_since_last_order) : null;
      // isActive = recency (used by Geography). isLive = eligibility (used by Live brand tab).
      const isActive = days !== null && days <= 30;
      const isLive = r.is_live === true || r.is_live === 'true' || r.is_live === 't';
      return {
        brandName: r.brand_name || '(no name)',
        sellerIds: (r.seller_ids || '').split(',').filter(Boolean),
        sellerBusinessNames: (r.seller_business_names || '').split('|').filter(Boolean),
        brandLabels: r.brand_labels,
        isActive,
        isLive,
        lastOrderAt: r.last_order_at,
        daysSinceLastOrder: days,
        totalOrders: parseInt(r.total_orders || '0'),
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
