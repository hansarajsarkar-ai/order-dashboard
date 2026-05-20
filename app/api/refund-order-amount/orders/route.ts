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
}

// Mirrors the source CTE in the main route.
const BASE_WHERE = `
  a."status" IN ('REJECTED', 'CANCELLED')
  AND s."isD2RBrandSeller" = TRUE
  AND s."isTest" = FALSE
  AND b."isTest" = FALSE
  AND b."businessName" NOT ILIKE '%test%'
  AND s."businessName" NOT ILIKE '%test%'
  AND pop."status" = 'COMPLETED'
  AND pop."event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
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
                                                                              AS hours_till_refund
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
      JOIN "users"."seller" s   ON s."id" = a."sellerId"
      JOIN "purchaseOrder"."purchaseOrderPayment" pop ON pop."purchaseOrderId" = a."id"
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
