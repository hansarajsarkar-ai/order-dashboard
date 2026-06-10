import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

// P&L — "Orders Not Pushed" feed.
// Not-pushed = PENDING/INPROGRESS D2R-brand orders on a THIRD_PARTY INTERCITY
// route that do NOT yet have an intercityDelivery record (never handed to a
// courier). Because there is no delivery leg, there is no expected-delivery
// loss or P&L here — only the three discount % dimensions the dashboard
// buckets into slabs: Coupon Applied %, Payment Discount %, Item Discount %.
const SQL = `
with x as (SELECT DISTINCT
        po."poNumber",
        po."id" as "purchaseOrderId",
        to_char(po."markedPendingTime", 'YYYY-MM-DD') AS "MarkedpendingTime",
        po."amount" AS "ItemTotal",
        COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0) AS "GrossAmount",
        COALESCE(po."platformMarginDiscount"::numeric, 0) AS "ItemDiscount",
        po."appliedOfferDiscount" AS "CoupanApplied",
        po."status" AS "orderStatus",
        pop."discountBySeller",
        pop."discountByBadho",
        pop."appliedWalletAmount",
        po."appliedVolumeDiscountAmount",
        po."paymentInfo"->>'option' AS PaymentOption,
        s."phone" as sellerPhone,
        s."businessName" as sellerBusinessName,
        -COALESCE(pop."UpiDiscountBySeller",0) as "UpiDiscountBySeller",
        pf."refundAmount",
        po."deliveryStatus" as "poDeliveryStatus",
        po."totalDiscount"

    FROM "purchaseOrder"."purchaseOrder" po
    JOIN "users"."buyer" AS b ON b."id" = po."buyerId"
    JOIN "users"."seller" s ON po."sellerId" = s."id"

    LEFT JOIN
    (
        SELECT "purchaseOrderId", sum("refundAmount"::numeric) as "refundAmount"
        FROM "payments"."paymentRefundRecord"
        WHERE "status" = 'COMPLETED'
        GROUP BY 1
    ) AS pf ON pf."purchaseOrderId" = po."id"
    LEFT JOIN
    (
        SELECT
            "purchaseOrderId",
            sum("paidAmount") as "paidAmount",
            sum(COALESCE(("breakup"->>'discount_on_payment_preference_for_seller')::float, 0)) as "discountBySeller",
            sum(COALESCE(("breakup"->>'discount_on_payment_preference_from_badho')::float, 0)) as "discountByBadho",
            sum(COALESCE(("breakup"->>'payment_method_adjustment')::float, 0)) as "UpiDiscountBySeller",
            SUM(COALESCE("appliedWalletAmount"::numeric, 0)) AS "appliedWalletAmount",
            string_agg("event", ',') as "event"
        FROM "purchaseOrder"."purchaseOrderPayment"
        WHERE "status" = 'COMPLETED'
          AND "event" NOT IN ('DAAS', 'DAAS_FIRST_MILE','DAAS_LAST_MILE','DAAS_REDELIVERY_PAYMENT')
        GROUP BY 1
    ) AS pop ON pop."purchaseOrderId" = po."id"

    WHERE s."isD2RBrandSeller" = TRUE AND s."isTest" = FALSE AND s."businessName" NOT ILIKE '%test%'
      AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
      AND po."isTest" = FALSE AND po."markedPendingTime" IS NOT NULL
      AND po."deliveryNetwork" = 'THIRD_PARTY' AND po."deliveryType" = 'INTERCITY'
      AND po."isFalseOrder" = FALSE AND po."status" IN ('PENDING','INPROGRESS')
      and po."id" not in (select "purchaseOrderId" from "deliveries"."intercityDelivery"))

      SELECT
    *,

    -- 1. Item Discount %
    ROUND((COALESCE("ItemDiscount"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "ItemDiscount%",

    -- 2. Coupon Applied %
    ROUND((COALESCE("CoupanApplied"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "CouponApplied%",

    -- 3. Payment Discount % (discountByBadho)
    ROUND((COALESCE("discountByBadho"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "PaymentDiscount%"

FROM x

      order by "MarkedpendingTime" desc
`;

async function _GET(_req: NextRequest) {
  try {
    const rows = await query<Record<string, unknown>>(SQL);
    // Column order as returned by Postgres (follows the SELECT list).
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return NextResponse.json({
      rows,
      columns,
      count: rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
