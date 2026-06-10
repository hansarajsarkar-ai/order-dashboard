import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

// P&L — "Orders Pushed" feed.
// Pushed = PENDING/INPROGRESS D2R-brand orders on a THIRD_PARTY INTERCITY
// Delhivery delivery. Returns one row per PO with the full P&L breakdown
// (gross, operational cost, expected commission, P&L amount/%, and the
// per-dimension discount % columns the dashboard buckets into slabs).
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
        dv."deliveryCharge",
        dv."status" AS deliveryStatus,
        dv."trackingInfo"->>'awbNumber' as "AWBNumber",
        dv."trackingInfo"->>'courierName' as "CourierName",
        po."paymentInfo"->>'option' AS PaymentOption,
        b."phone" as "buyerPhone",
        b."businessName" as "buyerBusinessName",
        s."phone" as sellerPhone,
        s."businessName" as sellerBusinessName,
        -COALESCE(pop."UpiDiscountBySeller",0) as "UpiDiscountBySeller",
        dvw."netDeducted" as "deliveryCHargeWithWDC",
        CASE WHEN COALESCE(swt."SDeliveryChargeDeducted",0) = 0 THEN 'Yes' ELSE 'No' END AS "SellerPaysDelivery",
        (s."deliveryChargesJSON"->'badhoFees'->>'value')::numeric AS "badhoCharge_Percent",
        pf."refundAmount",

        CASE WHEN COALESCE(swt."SDeliveryChargeDeducted",0) = 0 THEN
            (
                COALESCE(po."platformMarginDiscount"::numeric, 0) +
                COALESCE(pop."discountByBadho",0) +
                COALESCE(pop."appliedWalletAmount"::numeric, 0) +
                COALESCE(swt."SRewardCredited"::numeric, 0) +  COALESCE(po."totalDiscount"::numeric, 0) +
                (CASE WHEN po."appliedOfferSnapshotJSON"->'offer'->>'owner' = 'PLATFORM' THEN COALESCE(po."appliedOfferDiscount"::numeric, 0) ELSE 0 END)
            )
        ELSE
            (
                COALESCE(po."platformMarginDiscount"::numeric, 0) +
                COALESCE(pop."discountByBadho",0) +
                COALESCE(pop."appliedWalletAmount"::numeric, 0) +
                COALESCE(swt."SRewardCredited"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0) +
                (CASE WHEN po."appliedOfferSnapshotJSON"->'offer'->>'owner' = 'PLATFORM' THEN COALESCE(po."appliedOfferDiscount"::numeric, 0) ELSE 0 END) +
                COALESCE(dvw."netDeducted"::numeric, 0)
            )
        END AS "OperationalCost",

       (((COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0) +
       COALESCE(swt."SRewardCredited"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0)
       )
        - COALESCE(pop."discountBySeller",0) - (-COALESCE(pop."UpiDiscountBySeller",0)) - (COALESCE(po."appliedVolumeDiscountAmount",0))))
        AS "amountTobePaidSeller",

        (
    (COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0))
    *
    (
        CASE
            WHEN s."phone" = '9451818824' THEN 30.0
            ELSE (s."deliveryChargesJSON"->'badhoFees'->>'value')::numeric
        END
    ) / 100.0
) AS "expectedCommission",

        swt."SRewardCredited",
        swt."SPayoutRefundCredited",
        swt."SCommissionDeducted", swt."SDeliveryChargeDeducted",
        po."deliveryStatus" as "poDeliveryStatus",
        po."totalDiscount"

    FROM "purchaseOrder"."purchaseOrder" po
    JOIN "users"."buyer" AS b ON b."id" = po."buyerId"
    JOIN "users"."seller" s ON po."sellerId" = s."id"
    LEFT JOIN LATERAL (
      SELECT idv."status", idv."codAmountToBeCollected", idv."deliveryCharge", idv."deliveryPartnerId",
      idv."trackingInfo"
      FROM "deliveries"."intercityDelivery" idv
      WHERE idv."purchaseOrderId" = po."id"
      ORDER BY idv."created_at" DESC
      LIMIT 1
    ) AS dv ON TRUE
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

    LEFT JOIN public.seller_purchase_order_wallet_summary AS swt ON swt."purchaseOrderId" = po."id"
    left join  "deliveries"."delhiveryWalletRecon" as dvw on dvw."poNumber" = po."poNumber"
    WHERE s."isD2RBrandSeller" = TRUE AND s."isTest" = FALSE AND s."businessName" NOT ILIKE '%test%'
      AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
      AND po."isTest" = FALSE AND po."markedPendingTime" IS NOT NULL
      AND po."deliveryNetwork" = 'THIRD_PARTY' AND po."deliveryType" = 'INTERCITY'
      AND po."isFalseOrder" = FALSE AND po."status" IN ('PENDING','INPROGRESS')
      and dv."deliveryPartnerId" = 'DELHIVERY')


      SELECT
    *,

    ("expectedCommission" - "OperationalCost")*100/NULLIF("GrossAmount",0) as "p&l%",
    ("expectedCommission" - "OperationalCost") as "P&LAmount",

    -- 1. Item Discount %
    ROUND((COALESCE("ItemDiscount"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "ItemDiscount%",

    -- 2. Coupon Applied %
    ROUND((COALESCE("CoupanApplied"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "CouponApplied%",

    -- 3. Payment Discount % (discountByBadho)
    ROUND((COALESCE("discountByBadho"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "PaymentDiscount%",

    -- 4. Expected Delivery Loss %
    ROUND(((COALESCE("deliveryCharge"::numeric, 0) * 2) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "ExpectedDeliveryLoss%",

    -- 5. Operational Cost %
    ROUND((COALESCE("OperationalCost"::numeric, 0) * 100.0) / NULLIF("GrossAmount"::numeric, 0), 2) AS "OperationalCost%"

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
