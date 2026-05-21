import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  purchase_order_id: string;
  status: string;
  amount: string;
  marked_rejected_time: string | null;
  marked_cancelled_time: string | null;
  rejected_or_cancelled_time: string | null;
  po_number: string;
  payment_option: string | null;
  buyer_phone: string | null;
  buyer_business_name: string | null;
  seller_phone: string | null;
  seller_business_name: string | null;
  order_paid_amount: string | null;
  refund_amount: string | null;
  marked_status_completed_time: string | null;
  marked_status_initiated_time: string | null;
  refund_processing_hours: string | null;
  hours_till_refund: string | null;
  reject_reason: string | null;
  rejected_by: string | null;
  reason_added_by_badho_team: string | null;
  reason_category: string;
  delivery_status: string | null;
  marked_pending_time: string | null;
  created_at: string | null;
  payment_event: string | null;
  payment_attempt_id: string | null;
  applied_wallet_amount: string | null;
  refund_arn: string | null;
}

// Mirrors the source CTE in the main route.
const BASE_WHERE = `
  a."status" IN ('REJECTED', 'CANCELLED')
  AND pop."status" = 'COMPLETED'
  AND pop."event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
  AND a."isTest" = FALSE
  AND b."isTest" = FALSE
  AND pop."paidAmount" > 0
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const status = searchParams.get('status');             // 'REJECTED' | 'CANCELLED' | null
  const refundState = searchParams.get('refundState');   // 'refunded' | 'pending' | null

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const params: (string | number)[] = [startDate, endDate];
    const extraClauses: string[] = [];

    if (status === 'REJECTED' || status === 'CANCELLED') {
      params.push(status);
      extraClauses.push(`AND a."status" = $${params.length}`);
    }
    if (refundState === 'refunded') {
      extraClauses.push(`AND pfc."refundAmount" IS NOT NULL`);
    } else if (refundState === 'pending') {
      extraClauses.push(`AND pfc."refundAmount" IS NULL`);
    }

    const sql = `
      SELECT
        a."id"::text                                                          AS purchase_order_id,
        a."status"                                                            AS status,
        a."amount"::text                                                      AS amount,
        a."markedRejectedTime"::text                                          AS marked_rejected_time,
        a."markedCancelledTime"::text                                         AS marked_cancelled_time,
        COALESCE(a."markedRejectedTime", a."markedCancelledTime")::text       AS rejected_or_cancelled_time,
        a."poNumber"                                                          AS po_number,
        a."paymentInfo"->>'option'                                            AS payment_option,
        b."phone"                                                             AS buyer_phone,
        b."businessName"                                                      AS buyer_business_name,
        s."phone"                                                             AS seller_phone,
        s."businessName"                                                      AS seller_business_name,
        pop."paidAmount"::text                                                AS order_paid_amount,
        pfc."refundAmount"::text                                              AS refund_amount,
        pfc."markedStatusCompletedTime"::text                                 AS marked_status_completed_time,
        pfc."markedStatusInitiatedTime"::text                                 AS marked_status_initiated_time,
        (EXTRACT(EPOCH FROM (pfc."markedStatusCompletedTime" - pfc."markedStatusInitiatedTime")) / 3600)::text
                                                                              AS refund_processing_hours,
        (EXTRACT(EPOCH FROM (pfc."markedStatusCompletedTime"
          - COALESCE(a."markedRejectedTime", a."markedCancelledTime"))) / 3600)::text
                                                                              AS hours_till_refund,
        a."rejectReason"                                                      AS reject_reason,
        a."rejectedBy"                                                        AS rejected_by,
        a."reasonAddedByBadhoTeam"                                            AS reason_added_by_badho_team,
        a."created_at"::text                                                  AS created_at,
        a."markedPendingTime"::text                                           AS marked_pending_time,
        a."deliveryStatus"                                                    AS delivery_status,
        pop."event"                                                           AS payment_event,
        poa."id"::text                                                        AS payment_attempt_id,
        pop."appliedWalletAmount"::text                                       AS applied_wallet_amount,
        pfc."refundARN"                                                       AS refund_arn,
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
        END                                                                   AS reason_category
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
      JOIN "users"."seller" s   ON s."id" = a."sellerId"
      JOIN "purchaseOrder"."purchaseOrderPayment" pop ON pop."purchaseOrderId" = a."id"
      LEFT JOIN LATERAL (
        SELECT poa_inner."id"
        FROM "purchaseOrder"."purchaseOrderPaymentAttempt" poa_inner
        WHERE poa_inner."purchaseOrderPaymentId" = pop."id"
          AND poa_inner."status" = 'COMPLETED'
        LIMIT 1
      ) AS poa ON TRUE
      LEFT JOIN "payments"."paymentRefundRecord" pfc
        ON pfc."purchaseOrderId" = a."id"
       AND pfc."status" = 'COMPLETED'
      WHERE ${BASE_WHERE}
        AND COALESCE(a."markedRejectedTime", a."markedCancelledTime")::date >= $1::date
        AND COALESCE(a."markedRejectedTime", a."markedCancelledTime")::date <= $2::date
        ${extraClauses.join(' ')}
      ORDER BY COALESCE(a."markedRejectedTime", a."markedCancelledTime") DESC
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const orders = rows.map((r) => ({
      purchaseOrderId: r.purchase_order_id,
      status: r.status,
      amount: parseFloat(r.amount || '0'),
      markedRejectedTime: r.marked_rejected_time,
      markedCancelledTime: r.marked_cancelled_time,
      rejectedOrCancelledTime: r.rejected_or_cancelled_time,
      poNumber: r.po_number,
      paymentOption: r.payment_option,
      buyerPhone: r.buyer_phone,
      buyerBusinessName: r.buyer_business_name,
      sellerPhone: r.seller_phone,
      sellerBusinessName: r.seller_business_name,
      orderPaidAmount: r.order_paid_amount ? parseFloat(r.order_paid_amount) : 0,
      refundAmount: r.refund_amount ? parseFloat(r.refund_amount) : null,
      markedStatusCompletedTime: r.marked_status_completed_time,
      markedStatusInitiatedTime: r.marked_status_initiated_time,
      refundProcessingHours: r.refund_processing_hours ? parseFloat(r.refund_processing_hours) : null,
      hoursTillRefund: r.hours_till_refund ? parseFloat(r.hours_till_refund) : null,
      rejectReason: r.reject_reason,
      rejectedBy: r.rejected_by,
      reasonAddedByBadhoTeam: r.reason_added_by_badho_team,
      reasonCategory: r.reason_category,
      createdAt: r.created_at,
      markedPendingTime: r.marked_pending_time,
      deliveryStatus: r.delivery_status,
      paymentEvent: r.payment_event,
      paymentAttemptId: r.payment_attempt_id,
      appliedWalletAmount: r.applied_wallet_amount ? parseFloat(r.applied_wallet_amount) : null,
      refundARN: r.refund_arn,
    }));

    return NextResponse.json({
      orders,
      count: orders.length,
      startDate,
      endDate,
      status: status || null,
      refundState: refundState || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
