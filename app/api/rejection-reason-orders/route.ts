import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

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
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;
  paidAmount: string | null;
  poAmount: string | null;
  ItemTotal: string | number | null;
  GrossAmount: string | number | null;
  OrderMarginDiscount: string | number | null;
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
  RefundAmount: string | null;
  codAmountToBeCollected: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  deliveryStatusPo: string | null;
  reason_category: string;
  pushedStatus: string;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
}

const REASON_CASE = `
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
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
      THEN 'Brand SLA Breach'
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%serviceab%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%serviceab%'
      THEN 'Serviceability Issue'
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%address%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%address%'
      THEN 'Address Issue'
    ELSE 'Other Reasons'
  END
`;

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reasonCategory = searchParams.get('reason') || '';
  const month = searchParams.get('month'); // YYYY-MM for granularity=month
  const week = searchParams.get('week');   // week number for granularity=week
  const day = searchParams.get('day');     // day number for granularity=day
  const dayMonth = searchParams.get('dayMonth'); // month context for day mode
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const orderStatus = searchParams.get('orderStatus');
  const deliveryStatusParam = searchParams.get('deliveryStatus');

  if (!reasonCategory) {
    return NextResponse.json({ error: 'reason parameter is required' }, { status: 400 });
  }

  try {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [year, reasonCategory];
    let paramIdx = 3;

    if (month) {
      conditions.push(`TO_CHAR(po."markedPendingTime", 'YYYY-MM') = $${paramIdx++}`);
      params.push(month);
    }

    if (week) {
      conditions.push(`EXTRACT(WEEK FROM po."markedPendingTime") = $${paramIdx++}`);
      params.push(parseInt(week));
    }

    if (day) {
      conditions.push(`EXTRACT(DAY FROM po."markedPendingTime") = $${paramIdx++}`);
      params.push(parseInt(day));
      if (dayMonth) {
        conditions.push(`EXTRACT(MONTH FROM po."markedPendingTime") = $${paramIdx++}`);
        params.push(parseInt(dayMonth));
      }
    }

    if (orderStatus && orderStatus !== 'N/A') {
      conditions.push(`po."status" = $${paramIdx++}`);
      params.push(orderStatus);
    }

    if (deliveryStatusParam !== null) {
      if (deliveryStatusParam === 'N/A' || deliveryStatusParam === '') {
        conditions.push(`po."deliveryStatus" IS NULL`);
      } else {
        conditions.push(`po."deliveryStatus" = $${paramIdx++}`);
        params.push(deliveryStatusParam);
      }
    }

    const extraConditions = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT DISTINCT
        po."poNumber",
        po."markedPendingTime"                                                                AS "MarkedpendingTime",
        pop."created_at"                                                                      AS "paymentDate",
        pop."event"                                                                           AS "paymentEvent",
        s."phone"                                                                             AS "sellerPhone",
        s."businessName"                                                                      AS "sellerBusinessName",
        b."phone"                                                                             AS "buyerPhone",
        b."businessName"                                                                      AS "buyerBusinessName",
        b."addressLine1"                                                                      AS "buyerAddressLine1",
        b."landmark"                                                                          AS "buyerLandmark",
        b."pincode"                                                                           AS "buyerPincode",
        b."city"                                                                              AS "buyerCity",
        b."district"                                                                          AS "buyerDistrict",
        b."state"                                                                             AS "buyerState",
        pop."paidAmount"                                                                      AS "paidAmount",
        (po."amount" + COALESCE(po."platformMarginDiscount", 0))                                                                           AS "poAmount",
        po."amount" AS "ItemTotal",
        (COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0)) AS "GrossAmount",
        COALESCE(po."platformMarginDiscount"::numeric, 0) AS "OrderMarginDiscount",
        po."appliedOfferDiscount"                                                             AS "CoupanAmount",
        po."status"                                                                           AS "orderStatus",
        COALESCE((pop."breakup" ->> 'discount_on_payment_preference_for_seller')::float, 0)   AS "discountBySeller",
        COALESCE((pop."breakup" ->> 'discount_on_payment_preference_from_badho')::float, 0)   AS "PaymentOptionDiscountByBadho",
        pop."appliedWalletAmount",
        po."paymentInfo" ->> 'option'                                                         AS "PaymentOption",
        dv."trackingInfo" ->> 'awbNumber'                                                     AS "awbNumber",
        dv."trackingInfo" ->> 'courierName'                                                   AS "courierName",
        dv."status"                                                                           AS "deliveryStatusDv",
        pf."markedStatusInitiatedTime"                                                        AS "RefundIntiatedTime",
        pf."markedStatusCompletedTime"                                                        AS "RefundCompletedTime",
        pf."refundAmount"::text                                                               AS "RefundAmount",
        dv."codAmountToBeCollected",
        po."rejectReason",
        po."rejectedBy",
        po."reasonAddedByBadhoTeam",
        po."deliveryStatus"                                                                   AS "deliveryStatusPo",
        ${REASON_CASE}                                                                        AS reason_category,
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END             AS "pushedStatus",
        CASE po."status"
          WHEN 'REJECTED'    THEN po."markedRejectedTime"
          WHEN 'CANCELLED'   THEN po."markedCancelledTime"
          WHEN 'DELIVERED'   THEN po."markedDeliveredTime"
          WHEN 'COMPLETED'   THEN po."markedCompletedTime"
          WHEN 'DISPATCHED'  THEN po."markedDispatchedTime"
          WHEN 'IN_TRANSIT'  THEN po."markedInTransitTime"
          WHEN 'IN_PROGRESS' THEN po."markedInProgressTime"
          WHEN 'INPROGRESS'  THEN po."markedInProgressTime"
          WHEN 'PARTIAL'     THEN po."markedPartialTime"
          ELSE NULL
        END                                                                                   AS "statusMarkedTime",
        EXTRACT(EPOCH FROM (
          CASE po."status"
            WHEN 'REJECTED'    THEN po."markedRejectedTime"
            WHEN 'CANCELLED'   THEN po."markedCancelledTime"
            WHEN 'DELIVERED'   THEN po."markedDeliveredTime"
            WHEN 'COMPLETED'   THEN po."markedCompletedTime"
            WHEN 'DISPATCHED'  THEN po."markedDispatchedTime"
            WHEN 'IN_TRANSIT'  THEN po."markedInTransitTime"
            WHEN 'IN_PROGRESS' THEN po."markedInProgressTime"
            WHEN 'INPROGRESS'  THEN po."markedInProgressTime"
            WHEN 'PARTIAL'     THEN po."markedPartialTime"
            WHEN 'PENDING'     THEN NOW()
            ELSE NOW()
          END
          - po."markedPendingTime"
        ))::float AS "statusDurationSec"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId", di."trackingInfo", di."status", di."codAmountToBeCollected"
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
        AND (${REASON_CASE}) = $2
        ${extraConditions}
      ORDER BY "MarkedpendingTime" DESC
      LIMIT 5000;
    `;

    const rows = await query<OrderDetailRow>(sql, params);

    const data = rows.map((r) => ({
      ...r,
      itemTotal: r.ItemTotal != null ? Number(r.ItemTotal) : null,
      grossAmount: r.GrossAmount != null ? Number(r.GrossAmount) : null,
      orderMarginDiscount: r.OrderMarginDiscount != null ? Number(r.OrderMarginDiscount) : null,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      filters: { reason: reasonCategory, month, year, orderStatus, deliveryStatus: deliveryStatusParam },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
