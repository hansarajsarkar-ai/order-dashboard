import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface OrderDetailRow {
  poNumber: string;
  MarkedpendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: string | null;
  poAmount: string | null;
  CoupanAmount: string | null;
  orderStatus: string | null;
  discountBySeller: string | null;
  PaymentOptionDiscountByBadho: string | null;
  appliedWalletAmount: string | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatusDv: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  codAmountToBeCollected: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  deliveryStatusPo: string | null;
  reason_category: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reasonCategory = searchParams.get('reason') || '';
  const month = searchParams.get('month'); // YYYY-MM
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const orderStatus = searchParams.get('orderStatus'); // optional drill-down
  const deliveryStatus = searchParams.get('deliveryStatus'); // optional drill-down

  if (!reasonCategory) {
    return NextResponse.json({ error: 'reason parameter is required' }, { status: 400 });
  }

  try {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [year];
    let paramIdx = 2;

    conditions.push(`reason_sub.reason_category = $${paramIdx++}`);
    params.push(reasonCategory);

    if (month) {
      conditions.push(`TO_CHAR(po."markedPendingTime", 'YYYY-MM') = $${paramIdx++}`);
      params.push(month);
    }

    if (orderStatus && orderStatus !== 'N/A') {
      conditions.push(`po."status" = $${paramIdx++}`);
      params.push(orderStatus);
    }

    if (deliveryStatus !== null) {
      if (deliveryStatus === 'N/A' || deliveryStatus === '') {
        conditions.push(`po."deliveryStatus" IS NULL`);
      } else if (deliveryStatus) {
        conditions.push(`po."deliveryStatus" = $${paramIdx++}`);
        params.push(deliveryStatus);
      }
    }

    const extraConditions = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `
      WITH reason_sub AS (
        SELECT
          po."id" AS po_id,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM "deliveries"."intercityDelivery" di
              WHERE di."purchaseOrderId" = po."id"
                AND di."status" = 'NOT PICKED'
                AND di."autoRejectionTime" IS NOT NULL
            )
              THEN 'Delivery Partner SLA Breach'
            WHEN po."deliveryStatus" = 'RTO'
              THEN 'Rejected due to RTO'
            WHEN COALESCE(po."rejectReason", '')              ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
              OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
              THEN 'Brand SLA Breach'
            WHEN COALESCE(po."rejectReason", '')              ILIKE '%serviceab%'
              OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%serviceab%'
              THEN 'Serviceability Issue'
            WHEN COALESCE(po."rejectReason", '')              ILIKE '%address%'
              OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%address%'
              THEN 'Address Issue'
            ELSE 'Other Reasons'
          END AS reason_category
        FROM "purchaseOrder"."purchaseOrder" po
      )
      SELECT DISTINCT
        po."poNumber",
        po."markedPendingTime"::date AS "MarkedpendingTime",
        pop."created_at" AS "paymentDate",
        pop."event" AS "paymentEvent",
        s."phone" AS "sellerPhone",
        s."businessName" AS "sellerBusinessName",
        b."phone" AS "buyerPhone",
        b."businessName" AS "buyerBusinessName",
        pop."paidAmount" AS "paidAmount",
        po."amount" AS "poAmount",
        po."appliedOfferDiscount" AS "CoupanAmount",
        po."status" AS "orderStatus",
        COALESCE((pop."breakup" ->> 'discount_on_payment_preference_for_seller')::float, 0) AS "discountBySeller",
        COALESCE((pop."breakup" ->> 'discount_on_payment_preference_from_badho')::float, 0) AS "PaymentOptionDiscountByBadho",
        pop."appliedWalletAmount",
        po."paymentInfo" ->> 'option' AS "PaymentOption",
        dv."trackingInfo" ->> 'awbNumber' AS "awbNumber",
        dv."trackingInfo" ->> 'courierName' AS "courierName",
        dv."status" AS "deliveryStatusDv",
        pf."markedStatusInitiatedTime" AS "RefundIntiatedTime",
        pf."markedStatusCompletedTime" AS "RefundCompletedTime",
        dv."codAmountToBeCollected",
        po."rejectReason",
        po."rejectedBy",
        po."reasonAddedByBadhoTeam",
        po."deliveryStatus" AS "deliveryStatusPo",
        reason_sub.reason_category
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN reason_sub ON reason_sub.po_id = po."id"
      LEFT JOIN LATERAL (
        SELECT di."trackingInfo", di."status", di."codAmountToBeCollected"
        FROM "deliveries"."intercityDelivery" di
        WHERE di."purchaseOrderId" = po."id"
        ORDER BY di."created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      LEFT JOIN "payments"."paymentRefundRecord" pf
        ON pf."purchaseOrderId" = po."id"
        AND pf."status" = 'COMPLETED'
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
        ON pop."purchaseOrderId" = po."id"
        AND pop."status" = 'COMPLETED'
        AND pop."event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      WHERE s."isD2RBrandSeller" = TRUE
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isTest" = FALSE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType" = 'INTERCITY'
        AND po."isFalseOrder" = FALSE
        AND po."status" = 'REJECTED'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${extraConditions}
      ORDER BY po."markedPendingTime" DESC
      LIMIT 5000;
    `;

    const rows = await query<OrderDetailRow>(sql, params);

    return NextResponse.json({
      data: rows,
      count: rows.length,
      filters: { reason: reasonCategory, month, year, orderStatus, deliveryStatus },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
