import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Margin Overview — per-order drill-down for a single day.
 *
 * Returns the individual D2R / third-party INTERCITY orders that make up one
 * row of the daily P&L table (same filters & cost model as /api/margin-overview).
 * Requires `date` (the bucket key = intercity-delivery created_at date,
 * YYYY-MM-DD), matching the parent table which now buckets by delivery date
 * rather than PO creation date. The delivery lookback window must match the
 * parent table, so pass the same `days` OR `startDate`+`endDate` params.
 */

interface Row {
  poId: string;
  poNumber: string | null;
  orderDate: string;
  sellerName: string | null;
  buyerName: string | null;
  poAmount: string | null;
  marginRs: string | null;
  'badhoComission%': string | null;
  deliveryStatus: string | null;
  couponRs: string | null;
  badhoPaymentDiscountRs: string | null;
  rewardRs: string | null;
  deliveryChargeRs: string | null;
  rtoChargeRs: string | null;
  operationalCostRs: string | null;
  profitAndLossRs: string | null;
  status: string;
  markedPendingTime: string | null;
  orderStatus: string | null;
  paidAmount: string | null;
  appliedWalletAmount: string | null;
  discountBySeller: string | null;
  paymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  buyerPhone: string | null;
  sellerPhone: string | null;
  forwardDeliveryCostToSeller: string | null;
  dbDeliveryChargeRs: string | null;
  codAmountRs: string | null;
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;
  refundInitiatedTime: string | null;
  refundCompletedTime: string | null;
  refundAmount: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!date || !isoDate.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const useCustom = !!startDate && !!endDate && isoDate.test(startDate) && isoDate.test(endDate);

  const daysRaw = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

  // Keep the latest-delivery window identical to the parent table so the order
  // set matches exactly, then filter down to the clicked order_date.
  const deliveryFilter = useCustom
    ? `di."created_at" >= $1::date AND di."created_at" < ($2::date + 1)`
    : `di."created_at" >= CURRENT_DATE - make_interval(days => $1)`;
  const params: unknown[] = useCustom ? [startDate, endDate, date] : [days, date];
  const dateParam = useCustom ? '$3' : '$2';

  const sql = `
    WITH latest_delivery AS (
      SELECT DISTINCT ON (di."purchaseOrderId")
        di."id" AS "deliveryId",
        di."purchaseOrderId",
        di."status",
        di."created_at",
        di."deliveryCharge",
        di."trackingInfo",
        di."codAmountToBeCollected"
      FROM "deliveries"."intercityDelivery" di
      WHERE ${deliveryFilter}
      ORDER BY di."purchaseOrderId", di."created_at" DESC, di."id" DESC
    ),
    wallet_txns AS (
      SELECT
        "purchaseOrderId",
        SUM(CASE WHEN "type" = 'CREDIT' AND ("comment" ILIKE '%Reward for PO%' OR "comment" ILIKE '%Yah Reward Aapko%') THEN "amount" END) AS "rewardAmount"
      FROM "promotions"."sellerWalletTransaction"
      WHERE "purchaseOrderId" IN (SELECT "purchaseOrderId" FROM latest_delivery)
      GROUP BY 1
    ),
    -- Pre-aggregate refunds to one row per PO so the LEFT JOIN below cannot
    -- multiply order rows (which would inflate the P&L totals).
    refunds AS (
      SELECT
        "purchaseOrderId",
        MIN("markedStatusInitiatedTime") AS refund_initiated_time,
        MAX("markedStatusCompletedTime") AS refund_completed_time,
        SUM("refundAmount"::numeric)     AS refund_amount
      FROM "payments"."paymentRefundRecord"
      WHERE "status" = 'COMPLETED'
        AND "purchaseOrderId" IN (SELECT "purchaseOrderId" FROM latest_delivery)
      GROUP BY 1
    ),
    order_base AS (
      SELECT DISTINCT
        po."id" AS po_id,
        po."poNumber" AS po_number,
        dv."created_at"::date AS order_date,
        s."businessName" AS seller_name,
        b."businessName" AS buyer_name,
        (po."amount" + COALESCE(po."platformMarginDiscount", 0)) AS po_amount,
        (po."amount" + COALESCE(po."platformMarginDiscount", 0)) * (COALESCE((s."deliveryChargesJSON"->'badhoFees'->>'value')::numeric, 0) / 100.0) AS badho_margin_rs,
        COALESCE((s."deliveryChargesJSON"->'badhoFees'->>'value')::numeric, 0) AS "badhoComission%",
        dv."status" AS delivery_status,
        COALESCE(po."appliedOfferDiscount", 0) AS coupon_rs,
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0) AS badho_payment_discount_rs,
        COALESCE(wt."rewardAmount", 0) AS reward_rs,
        CASE WHEN LOWER(s."deliveryChargesJSON"->>'forwardDeliveryCostToSeller') = 'false'
          THEN COALESCE(dv."deliveryCharge", 0)
          ELSE 0
        END AS delivery_charge_rs,
        -- RTO return charge = 90% of the raw DB delivery charge, billed to us only
        -- when the shipment went RTO *and* the PO was REJECTED. This is a loss.
        CASE WHEN dv."status" ILIKE '%rto%' AND po."status" = 'REJECTED'
          THEN ROUND(0.9 * COALESCE(dv."deliveryCharge", 0)::numeric, 2)
          ELSE 0
        END AS rto_charge_rs,
        -- Detailed order-list fields (appended to the P&L drill-down so the
        -- modal mirrors the Monthly Breakdown by Order Status drill-down).
        po."markedPendingTime"                                   AS marked_pending_time,
        po."status"                                              AS order_status,
        pop."paidAmount"                                         AS paid_amount,
        pop."appliedWalletAmount"                                AS applied_wallet_amount,
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0) AS discount_by_seller,
        po."paymentInfo"->>'option'                              AS payment_option,
        dv."trackingInfo"->>'awbNumber'                          AS awb_number,
        dv."trackingInfo"->>'courierName'                        AS courier_name,
        pop."created_at"                                         AS payment_date,
        pop."event"                                              AS payment_event,
        b."phone"                                                AS buyer_phone,
        s."phone"                                                AS seller_phone,
        s."deliveryChargesJSON"->>'forwardDeliveryCostToSeller'  AS forward_delivery_cost_to_seller,
        COALESCE(dv."deliveryCharge", 0)                         AS db_delivery_charge,
        dv."codAmountToBeCollected"                              AS cod_amount,
        b."addressLine1"                                         AS buyer_address_line1,
        b."landmark"                                             AS buyer_landmark,
        b."pincode"                                              AS buyer_pincode,
        b."city"                                                 AS buyer_city,
        b."district"                                             AS buyer_district,
        b."state"                                                AS buyer_state,
        rf.refund_initiated_time                                 AS refund_initiated_time,
        rf.refund_completed_time                                 AS refund_completed_time,
        rf.refund_amount::text                                   AS refund_amount,
        po."rejectReason"                                        AS reject_reason,
        po."rejectedBy"                                          AS rejected_by,
        po."reasonAddedByBadhoTeam"                              AS reason_added_by_badho_team,
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
        END                                                      AS status_marked_time,
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
        ))::float                                                AS status_duration_sec
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN latest_delivery dv ON dv."purchaseOrderId" = po."id"
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
             ON pop."purchaseOrderId" = po."id"
            AND pop."status" = 'COMPLETED'
            AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      LEFT JOIN wallet_txns as wt ON wt."purchaseOrderId" = po."id"
      LEFT JOIN refunds      as rf ON rf."purchaseOrderId" = po."id"
      WHERE s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isTest"          = FALSE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."isFalseOrder"    = FALSE
    )
    SELECT
      po_id                                              AS "poId",
      po_number::text                                    AS "poNumber",
      order_date                                         AS "orderDate",
      seller_name                                        AS "sellerName",
      buyer_name                                         AS "buyerName",
      po_amount                                          AS "poAmount",
      badho_margin_rs                                    AS "marginRs",
      "badhoComission%"                                  AS "badhoComission%",
      delivery_status                                    AS "deliveryStatus",
      coupon_rs                                          AS "couponRs",
      badho_payment_discount_rs                          AS "badhoPaymentDiscountRs",
      reward_rs                                          AS "rewardRs",
      delivery_charge_rs                                 AS "deliveryChargeRs",
      rto_charge_rs                                      AS "rtoChargeRs",
      (coupon_rs + badho_payment_discount_rs + reward_rs + delivery_charge_rs + rto_charge_rs) AS "operationalCostRs",
      badho_margin_rs - (coupon_rs + badho_payment_discount_rs + reward_rs + delivery_charge_rs + rto_charge_rs) AS "profitAndLossRs",
      CASE
        WHEN badho_margin_rs - (coupon_rs + badho_payment_discount_rs + reward_rs + delivery_charge_rs + rto_charge_rs) > 0 THEN 'Profit'
        WHEN badho_margin_rs - (coupon_rs + badho_payment_discount_rs + reward_rs + delivery_charge_rs + rto_charge_rs) < 0 THEN 'Loss'
        ELSE 'Breakeven'
      END AS "status",
      marked_pending_time                                AS "markedPendingTime",
      order_status                                       AS "orderStatus",
      paid_amount                                        AS "paidAmount",
      applied_wallet_amount                              AS "appliedWalletAmount",
      discount_by_seller                                 AS "discountBySeller",
      payment_option                                     AS "paymentOption",
      awb_number                                         AS "awbNumber",
      courier_name                                       AS "courierName",
      payment_date                                       AS "paymentDate",
      payment_event                                      AS "paymentEvent",
      buyer_phone                                        AS "buyerPhone",
      seller_phone                                       AS "sellerPhone",
      forward_delivery_cost_to_seller                    AS "forwardDeliveryCostToSeller",
      db_delivery_charge                                 AS "dbDeliveryChargeRs",
      cod_amount                                         AS "codAmountRs",
      buyer_address_line1                                AS "buyerAddressLine1",
      buyer_landmark                                     AS "buyerLandmark",
      buyer_pincode                                      AS "buyerPincode",
      buyer_city                                         AS "buyerCity",
      buyer_district                                     AS "buyerDistrict",
      buyer_state                                        AS "buyerState",
      refund_initiated_time                              AS "refundInitiatedTime",
      refund_completed_time                              AS "refundCompletedTime",
      refund_amount                                      AS "refundAmount",
      reject_reason                                      AS "rejectReason",
      rejected_by                                        AS "rejectedBy",
      reason_added_by_badho_team                         AS "reasonAddedByBadhoTeam",
      status_marked_time                                 AS "statusMarkedTime",
      status_duration_sec                                AS "statusDurationSec"
    FROM order_base
    WHERE order_date = ${dateParam}::date
    ORDER BY (badho_margin_rs - (coupon_rs + badho_payment_discount_rs + reward_rs + delivery_charge_rs)) ASC;
  `;

  try {
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poId: r.poId,
      poNumber: r.poNumber,
      orderDate: r.orderDate,
      sellerName: r.sellerName,
      buyerName: r.buyerName,
      poAmount: Number(r.poAmount) || 0,
      marginRs: Number(r.marginRs) || 0,
      badhoCommissionPct: Number(r['badhoComission%']) || 0,
      deliveryStatus: r.deliveryStatus ?? null,
      couponRs: Number(r.couponRs) || 0,
      badhoPaymentDiscountRs: Number(r.badhoPaymentDiscountRs) || 0,
      rewardRs: Number(r.rewardRs) || 0,
      deliveryChargeRs: Number(r.deliveryChargeRs) || 0,
      rtoChargeRs: Number(r.rtoChargeRs) || 0,
      operationalCostRs: Number(r.operationalCostRs) || 0,
      profitAndLossRs: Number(r.profitAndLossRs) || 0,
      status: r.status,
      markedPendingTime: r.markedPendingTime ?? null,
      orderStatus: r.orderStatus ?? null,
      paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
      appliedWalletAmount: r.appliedWalletAmount != null ? Number(r.appliedWalletAmount) : null,
      discountBySeller: Number(r.discountBySeller) || 0,
      paymentOption: r.paymentOption ?? null,
      awbNumber: r.awbNumber ?? null,
      courierName: r.courierName ?? null,
      paymentDate: r.paymentDate ?? null,
      paymentEvent: r.paymentEvent ?? null,
      buyerPhone: r.buyerPhone ?? null,
      sellerPhone: r.sellerPhone ?? null,
      forwardDeliveryCostToSeller: r.forwardDeliveryCostToSeller ?? null,
      dbDeliveryChargeRs: r.dbDeliveryChargeRs != null ? Number(r.dbDeliveryChargeRs) : null,
      codAmountRs: r.codAmountRs != null ? Number(r.codAmountRs) : null,
      buyerFullAddress: [
        r.buyerAddressLine1,
        r.buyerLandmark,
        r.buyerPincode,
        r.buyerCity,
        r.buyerDistrict,
        r.buyerState,
      ].filter((v) => v != null && String(v).trim() !== '').join(', ') || null,
      refundInitiatedTime: r.refundInitiatedTime ?? null,
      refundCompletedTime: r.refundCompletedTime ?? null,
      refundAmount: r.refundAmount != null ? parseFloat(String(r.refundAmount)) : null,
      rejectReason: r.rejectReason ?? null,
      rejectedBy: r.rejectedBy ?? null,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam ?? null,
      statusMarkedTime: r.statusMarkedTime ?? null,
      statusDurationSec: r.statusDurationSec != null ? Number(r.statusDurationSec) : null,
    }));

    const totals = data.reduce(
      (acc, d) => {
        acc.poAmount += d.poAmount;
        acc.marginRs += d.marginRs;
        acc.couponRs += d.couponRs;
        acc.badhoPaymentDiscountRs += d.badhoPaymentDiscountRs;
        acc.rewardRs += d.rewardRs;
        acc.deliveryChargeRs += d.deliveryChargeRs;
        acc.rtoChargeRs += d.rtoChargeRs;
        acc.operationalCostRs += d.operationalCostRs;
        acc.profitAndLossRs += d.profitAndLossRs;
        return acc;
      },
      { poAmount: 0, marginRs: 0, couponRs: 0, badhoPaymentDiscountRs: 0, rewardRs: 0, deliveryChargeRs: 0, rtoChargeRs: 0, operationalCostRs: 0, profitAndLossRs: 0 }
    );

    return NextResponse.json({
      date,
      count: data.length,
      data,
      totals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
