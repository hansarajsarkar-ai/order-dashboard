import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  result: AlertItem[] | null;
}

interface AlertItem {
  purchaseOrderId: string;
  status: string;
  poNumber: string;
  paidAmount: number;
  paymentOption: string | null;
  paymentEvent: string | null;
  paymentAttemptId: string | null;
  appliedWalletAmount: number | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  createdAt: string | null;
  markedPendingTime: string | null;
  rejectedOrCancelledTime: string | null;
  minutesPending: number;
  deliveryStatus: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  reasonCategory: string;
}

const BASE_WHERE = `
  a."status" IN ('REJECTED', 'CANCELLED')
  AND a."isTest" = FALSE
  AND b."isTest" = FALSE
`;

const POP_AGG_JOIN = `
  JOIN (
    SELECT
      "purchaseOrderId",
      SUM("paidAmount"::numeric)                                AS total_paid,
      SUM(COALESCE("appliedWalletAmount", 0)::numeric)          AS total_wallet,
      STRING_AGG(DISTINCT "event", ', ' ORDER BY "event")       AS payment_event
    FROM "purchaseOrder"."purchaseOrderPayment"
    WHERE "status" = 'COMPLETED'
      AND "event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
    GROUP BY "purchaseOrderId"
    HAVING SUM("paidAmount"::numeric) > 0
  ) AS pop_agg ON pop_agg."purchaseOrderId" = a."id"
`;

const PFC_AGG_JOIN = `
  LEFT JOIN (
    SELECT
      "purchaseOrderId",
      SUM("refundAmount"::numeric) AS total_refund
    FROM "payments"."paymentRefundRecord"
    WHERE "status" = 'COMPLETED'
    GROUP BY "purchaseOrderId"
  ) AS pfc_agg ON pfc_agg."purchaseOrderId" = a."id"
`;

export async function GET() {
  try {
    const sql = `
      SELECT json_agg(json_build_object(
        'purchaseOrderId',          purchase_order_id::text,
        'status',                   po_status,
        'poNumber',                 po_number,
        'paidAmount',               order_paid_amount,
        'paymentOption',            payment_option,
        'paymentEvent',             payment_event,
        'paymentAttemptId',         payment_attempt_id::text,
        'appliedWalletAmount',      applied_wallet_amount,
        'buyerPhone',               buyer_phone,
        'buyerBusinessName',        buyer_business_name,
        'sellerPhone',              seller_phone,
        'sellerBusinessName',       seller_business_name,
        'createdAt',                created_at,
        'markedPendingTime',        marked_pending_time,
        'rejectedOrCancelledTime',  rejected_or_cancelled_time,
        'minutesPending',           EXTRACT(EPOCH FROM (NOW() - rejected_or_cancelled_time)) / 60,
        'deliveryStatus',           delivery_status,
        'rejectReason',             reject_reason,
        'rejectedBy',               rejected_by,
        'reasonAddedByBadhoTeam',   reason_added_by_badho_team,
        'reasonCategory',           reason_category
      )) AS result
      FROM (
        SELECT
          a."id"                                  AS purchase_order_id,
          a."status"                              AS po_status,
          a."poNumber"                            AS po_number,
          a."paymentInfo"->>'option'              AS payment_option,
          a."deliveryStatus"                      AS delivery_status,
          a."markedPendingTime"                   AS marked_pending_time,
          COALESCE(a."markedRejectedTime", a."markedCancelledTime") AS rejected_or_cancelled_time,
          a."rejectReason"                        AS reject_reason,
          a."rejectedBy"                          AS rejected_by,
          a."reasonAddedByBadhoTeam"              AS reason_added_by_badho_team,
          a."created_at"                          AS created_at,
          b."phone"                               AS buyer_phone,
          b."businessName"                        AS buyer_business_name,
          s."phone"                               AS seller_phone,
          s."businessName"                        AS seller_business_name,
          pop_agg.total_paid                      AS order_paid_amount,
          pop_agg.payment_event                   AS payment_event,
          pop_agg.total_wallet                    AS applied_wallet_amount,
          poa."id"                                AS payment_attempt_id,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM "deliveries"."intercityDelivery" di
              WHERE di."purchaseOrderId" = a."id"
                AND di."status" = 'NOT PICKED'
                AND di."autoRejectionTime" IS NOT NULL
            )
              THEN 'Delivery Partner SLA Breach'
            WHEN a."deliveryStatus" = 'RTO'
              THEN 'Rejected due to RTO'
            WHEN COALESCE(a."rejectReason", '')           ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
              OR COALESCE(a."reasonAddedByBadhoTeam", '') ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
              THEN 'Brand SLA Breach'
            WHEN COALESCE(a."rejectReason", '')           ILIKE '%serviceab%'
              OR COALESCE(a."reasonAddedByBadhoTeam", '') ILIKE '%serviceab%'
              THEN 'Serviceability Issue'
            WHEN COALESCE(a."rejectReason", '')           ILIKE '%address%'
              OR COALESCE(a."reasonAddedByBadhoTeam", '') ILIKE '%address%'
              THEN 'Address Issue'
            ELSE 'Other Reasons'
          END                                     AS reason_category
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
        JOIN "users"."seller" s   ON s."id" = a."sellerId"
        ${POP_AGG_JOIN}
        LEFT JOIN LATERAL (
          SELECT poa_inner."id"
          FROM "purchaseOrder"."purchaseOrderPaymentAttempt" poa_inner
          JOIN "purchaseOrder"."purchaseOrderPayment" pop_x
            ON pop_x."id" = poa_inner."purchaseOrderPaymentId"
          WHERE pop_x."purchaseOrderId" = a."id"
            AND poa_inner."status" = 'COMPLETED'
          LIMIT 1
        ) AS poa ON TRUE
        ${PFC_AGG_JOIN}
        WHERE ${BASE_WHERE}
          AND pfc_agg.total_refund IS NULL
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") IS NOT NULL
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") < NOW() - INTERVAL '10 minutes'
        ORDER BY COALESCE(a."markedRejectedTime", a."markedCancelledTime") ASC
        LIMIT 500
      ) AS alerts_data;
    `;

    const rows = await query<Row>(sql);
    const alerts = rows[0]?.result ?? [];

    return NextResponse.json({
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
