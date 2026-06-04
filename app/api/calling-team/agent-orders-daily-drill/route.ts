import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop } from '@/lib/db';
import { parseFilters, buildWhere } from '../_filters';

export const dynamic = 'force-dynamic';

// Drill-down behind a single (agentName, day) cell of the Agent × Day matrix.
// Reuses the exact same scope + last-touch attribution as /agent-orders-daily,
// then returns the full order detail for each attributed PO (same columns as
// /api/order-list) plus the attributing call's duration and recording URL.
interface Row {
  poNumber: string;
  MarkedpendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: number | null;
  poAmount: number | null;
  CoupanAmount: number | null;
  orderStatus: string;
  discountBySeller: number;
  PaymentOptionDiscountByBadho: number;
  appliedWalletAmount: number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: string | null;
  codAmountToBeCollected: number | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  buyer_address_line1: string | null;
  buyer_landmark: string | null;
  buyer_pincode: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_state: string | null;
  seller_address_line1: string | null;
  seller_city: string | null;
  seller_state: string | null;
  created_at: string;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callTs: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentName = searchParams.get('agentName');
  const day = searchParams.get('day'); // YYYY-MM-DD
  if (!agentName || !day) {
    return NextResponse.json({ error: 'agentName and day are required' }, { status: 400 });
  }

  // Scope the call side to exactly the clicked day (start_date text compare).
  const f = parseFilters(req);
  f.startDate = day;
  f.endDate = day;
  const { sql: where, params } = buildWhere(f);

  // Index-friendly IST timestamp bounds for the order side (the clicked day).
  const startTs = `${day}T00:00:00+05:30`;
  const endExclusive = new Date(`${day}T00:00:00+05:30`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const pStart = params.push(startTs);
  const pEnd = params.push(endExclusive.toISOString());
  const pAgent = params.push(agentName);

  try {
    const rows = await queryNoNestloop<Row>(
      `
      WITH ct AS MATERIALIZED (
        SELECT
          agent_name,
          CASE WHEN call_to_number LIKE '%-%'
            THEN RIGHT(REGEXP_REPLACE(SPLIT_PART(call_to_number, '-', 1), '[^0-9]', '', 'g'), 10)
            ELSE RIGHT(REGEXP_REPLACE(call_to_number, '[^0-9]', '', 'g'), 10) END AS phone,
          start_date::date AS call_date,
          start_stamp::timestamp AS call_ts,
          (call_status = 'Answer') AS connected,
          COALESCE(NULLIF(duration,'')::int, 0) AS dur,
          recording_url
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND (LOWER(direction) = 'outbound' OR direction = 'Manual')
          AND campaign_name IN ('Warm_Lead', 'Cold Lead Campaign')
          AND agent_name IS NOT NULL AND agent_name <> ''
          AND call_to_number IS NOT NULL AND call_to_number <> ''
      ),
      buyer_orders AS MATERIALIZED (
        SELECT
          po."id" AS po_id,
          po."poNumber" AS po_number,
          RIGHT(REGEXP_REPLACE(b."phone", '[^0-9]', '', 'g'), 10) AS phone,
          (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')::date AS order_date
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        JOIN "users"."buyer" b ON b."id" = po."buyerId"
        WHERE po."markedPendingTime" >= $${pStart}::timestamptz
          AND po."markedPendingTime" <  $${pEnd}::timestamptz
          AND po."status" != 'DRAFT'
          AND s."isD2RBrandSeller" = TRUE
          AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest" = FALSE AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
          AND po."isTest" = FALSE AND po."isFalseOrder" = FALSE
          AND po."deliveryNetwork" = 'THIRD_PARTY' AND po."deliveryType" = 'INTERCITY'
      ),
      assigned AS (
        -- Last-touch: each order to the agent of the most recent answered call
        -- to that buyer that day (tiebreak: longest call, then agent name).
        SELECT po_id, po_number, agent_name, day, call_dur, call_url, call_ts FROM (
          SELECT o.po_id, o.po_number, b.agent_name, o.order_date AS day,
            b.dur AS call_dur, b.recording_url AS call_url, b.call_ts,
            ROW_NUMBER() OVER (
              PARTITION BY o.po_number
              ORDER BY b.call_ts DESC, b.dur DESC, b.agent_name
            ) AS rn
          FROM ct b
          JOIN buyer_orders o ON o.phone = b.phone AND o.order_date = b.call_date
          WHERE b.connected
        ) x WHERE rn = 1
      )
      SELECT DISTINCT
        po."poNumber"::text AS "poNumber",
        po."markedPendingTime" AS "MarkedpendingTime",
        pop."created_at" AS "paymentDate",
        pop."event" AS "paymentEvent",
        s."phone" AS "sellerPhone",
        s."businessName" AS "sellerBusinessName",
        b."phone" AS "buyerPhone",
        b."businessName" AS "buyerBusinessName",
        pop."paidAmount" AS "paidAmount",
        (po."amount" + COALESCE(po."platformMarginDiscount", 0)) AS "poAmount",
        po."appliedOfferDiscount" AS "CoupanAmount",
        po."status" AS "orderStatus",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0) AS "discountBySeller",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0) AS "PaymentOptionDiscountByBadho",
        pop."appliedWalletAmount",
        po."paymentInfo"->>'option' AS "PaymentOption",
        dv."trackingInfo"->>'awbNumber' AS "awbNumber",
        dv."trackingInfo"->>'courierName' AS "courierName",
        dv."status" AS "deliveryStatus",
        pf."markedStatusInitiatedTime" AS "RefundIntiatedTime",
        pf."markedStatusCompletedTime" AS "RefundCompletedTime",
        pf."refundAmount"::text        AS "RefundAmount",
        dv."codAmountToBeCollected" AS "codAmountToBeCollected",
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
        po."rejectReason",
        po."rejectedBy" AS "rejectedBy",
        po."reasonAddedByBadhoTeam" AS "reasonAddedByBadhoTeam",
        b."addressLine1" AS buyer_address_line1,
        b."landmark" AS buyer_landmark,
        b."pincode" AS buyer_pincode,
        b."city" AS buyer_city,
        b."district" AS buyer_district,
        b."state" AS buyer_state,
        s."addressLine1" AS seller_address_line1,
        s."city" AS seller_city,
        s."state" AS seller_state,
        po."created_at" AS created_at,
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
        END AS "statusMarkedTime",
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
        ))::float AS "statusDurationSec",
        a.call_dur::int AS "callDurationSec",
        a.call_url       AS "callRecordingUrl",
        a.call_ts::text  AS "callTs"
      FROM assigned a
      JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = a.po_id
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId",
               di."trackingInfo",
               di."status",
               di."codAmountToBeCollected"
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
            AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      WHERE a.agent_name = $${pAgent}
      ORDER BY "MarkedpendingTime" DESC NULLS LAST
      LIMIT 5000;
      `,
      params,
    );

    const data = rows.map((r) => ({
      poNumber: r.poNumber,
      MarkedpendingTime: r.MarkedpendingTime,
      paymentDate: r.paymentDate,
      paymentEvent: r.paymentEvent,
      sellerPhone: r.sellerPhone,
      sellerBusinessName: r.sellerBusinessName,
      buyerPhone: r.buyerPhone,
      buyerBusinessName: r.buyerBusinessName,
      paidAmount: r.paidAmount,
      poAmount: r.poAmount,
      CoupanAmount: r.CoupanAmount,
      orderStatus: r.orderStatus,
      status: r.orderStatus,
      discountBySeller: r.discountBySeller,
      PaymentOptionDiscountByBadho: r.PaymentOptionDiscountByBadho,
      appliedWalletAmount: r.appliedWalletAmount,
      PaymentOption: r.PaymentOption,
      awbNumber: r.awbNumber,
      courierName: r.courierName,
      deliveryStatus: r.deliveryStatus,
      RefundIntiatedTime: r.RefundIntiatedTime,
      RefundCompletedTime: r.RefundCompletedTime,
      RefundAmount: r.RefundAmount != null ? parseFloat(String(r.RefundAmount)) : null,
      codAmountToBeCollected: r.codAmountToBeCollected,
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
      amount: r.poAmount != null ? Number(r.poAmount) : 0,
      buyerAddress: [r.buyer_address_line1, r.buyer_city, r.buyer_state].filter(Boolean).join(', '),
      buyerFullAddress: [
        r.buyer_address_line1,
        r.buyer_landmark,
        r.buyer_pincode,
        r.buyer_city,
        r.buyer_district,
        r.buyer_state,
      ].filter((v) => v != null && String(v).trim() !== '').join(', '),
      buyerAddressLine1: r.buyer_address_line1,
      buyerLandmark: r.buyer_landmark,
      buyerPincode: r.buyer_pincode,
      buyerCity: r.buyer_city,
      buyerDistrict: r.buyer_district,
      buyerState: r.buyer_state,
      sellerAddress: [r.seller_address_line1, r.seller_city, r.seller_state].filter(Boolean).join(', '),
      markedPendingTime: r.MarkedpendingTime,
      createdAt: r.created_at,
      statusMarkedTime: r.statusMarkedTime,
      statusDurationSec: r.statusDurationSec != null ? Number(r.statusDurationSec) : null,
      callDurationSec: r.callDurationSec != null ? Number(r.callDurationSec) : null,
      callRecordingUrl: r.callRecordingUrl,
      callTs: r.callTs,
    }));

    return NextResponse.json({ data, count: data.length, agentName, day });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    console.error('agent-orders-daily-drill error', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
