import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SummaryRow {
  total_orders: string;
  total_paid_amount: string;
  refunded_orders: string;
  total_refunded_amount: string;
  avg_refund_time_hours: string | null;
  avg_time_till_refund_hours: string | null;
}
interface BucketRow {
  bucket_start: string;
  bucket_end: string;
  rejected_count: string;
  cancelled_count: string;
  order_count: string;
  paid_amount: string;
  refunded_amount: string;
  refunded_orders: string;
  avg_refund_processing_hours: string | null;
}
interface SellerRow {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  order_count: string;
  paid_amount: string;
  refunded_amount: string;
  refunded_orders: string;
}
interface ListRow {
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

// Shared filters from the user-provided base query
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
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    // Source CTE shared by every aggregation, mirrors the user's base query
    const sourceCte = `
      WITH source AS (
        SELECT
          a."id"                                  AS purchase_order_id,
          a."status"                              AS po_status,
          a."amount"::numeric                     AS po_amount,
          a."markedPendingTime"                   AS marked_pending_time,
          a."markedRejectedTime"                  AS marked_rejected_time,
          a."markedCancelledTime"                 AS marked_cancelled_time,
          COALESCE(a."markedRejectedTime", a."markedCancelledTime") AS rejected_or_cancelled_time,
          a."poNumber"                            AS po_number,
          a."paymentInfo"->>'option'              AS payment_option,
          b."phone"                               AS buyer_phone,
          b."businessName"                        AS buyer_business_name,
          s."id"                                  AS seller_id,
          s."phone"                               AS seller_phone,
          s."businessName"                        AS seller_business_name,
          pop."paidAmount"::numeric               AS order_paid_amount,
          pfc."refundAmount"::numeric             AS refund_amount,
          pfc."markedStatusCompletedTime"         AS marked_status_completed_time,
          pfc."markedStatusInitiatedTime"         AS marked_status_initiated_time,
          EXTRACT(EPOCH FROM (pfc."markedStatusCompletedTime" - pfc."markedStatusInitiatedTime")) / 3600
                                                  AS refund_processing_hours,
          EXTRACT(EPOCH FROM (pfc."markedStatusCompletedTime"
            - COALESCE(a."markedRejectedTime", a."markedCancelledTime"))) / 3600
                                                  AS hours_till_refund
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
        JOIN "users"."seller" s   ON s."id" = a."sellerId"
        JOIN "purchaseOrder"."purchaseOrderPayment" pop ON pop."purchaseOrderId" = a."id"
        LEFT JOIN "payments"."paymentRefundRecord" pfc
          ON pfc."purchaseOrderId" = a."id"
         AND pfc."status" = 'COMPLETED'
        WHERE ${BASE_WHERE}
          AND EXTRACT(YEAR FROM a."markedPendingTime") = $1
      )
    `;

    // 1. Summary KPIs
    const summarySql = `
      ${sourceCte}
      SELECT
        COUNT(*)::text                                                              AS total_orders,
        COALESCE(SUM(order_paid_amount), 0)::text                                   AS total_paid_amount,
        COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)::text                     AS refunded_orders,
        COALESCE(SUM(refund_amount), 0)::text                                       AS total_refunded_amount,
        AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL)::text AS avg_refund_time_hours,
        AVG(hours_till_refund)       FILTER (WHERE hours_till_refund IS NOT NULL)::text       AS avg_time_till_refund_hours
      FROM source;
    `;
    const summaryRows = await query<SummaryRow>(summarySql, [year]);

    // Bucket aggregation — day / week / month all share the same shape.
    // bucketStart / bucketEnd inclusive; used as filter range for the modal endpoint.
    const bucketSql = (trunc: 'day' | 'week' | 'month') => `
      ${sourceCte}
      SELECT
        TO_CHAR(date_trunc('${trunc}', rejected_or_cancelled_time)::date, 'YYYY-MM-DD') AS bucket_start,
        TO_CHAR(
          ${trunc === 'day'
            ? `date_trunc('day', rejected_or_cancelled_time)::date`
            : trunc === 'week'
            ? `(date_trunc('week', rejected_or_cancelled_time) + interval '6 days')::date`
            : `(date_trunc('month', rejected_or_cancelled_time) + interval '1 month' - interval '1 day')::date`
          },
          'YYYY-MM-DD'
        )                                                                                AS bucket_end,
        COUNT(*) FILTER (WHERE po_status = 'REJECTED')::text                             AS rejected_count,
        COUNT(*) FILTER (WHERE po_status = 'CANCELLED')::text                            AS cancelled_count,
        COUNT(*)::text                                                                   AS order_count,
        COALESCE(SUM(order_paid_amount), 0)::text                                        AS paid_amount,
        COALESCE(SUM(refund_amount), 0)::text                                            AS refunded_amount,
        COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)::text                          AS refunded_orders,
        AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL)::text AS avg_refund_processing_hours
      FROM source
      WHERE rejected_or_cancelled_time IS NOT NULL
      GROUP BY date_trunc('${trunc}', rejected_or_cancelled_time)
      ORDER BY date_trunc('${trunc}', rejected_or_cancelled_time) DESC;
    `;
    const [dailyRows, weeklyRows, monthlyRows] = await Promise.all([
      query<BucketRow>(bucketSql('day'),   [year]),
      query<BucketRow>(bucketSql('week'),  [year]),
      query<BucketRow>(bucketSql('month'), [year]),
    ]);

    // 3. Top sellers by paid amount (refunds owed)
    const sellerSql = `
      ${sourceCte}
      SELECT
        seller_id::text                                                              AS seller_id,
        seller_phone,
        seller_business_name,
        COUNT(*)::text                                                              AS order_count,
        COALESCE(SUM(order_paid_amount), 0)::text                                   AS paid_amount,
        COALESCE(SUM(refund_amount), 0)::text                                       AS refunded_amount,
        COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)::text                     AS refunded_orders
      FROM source
      GROUP BY seller_id, seller_phone, seller_business_name
      ORDER BY SUM(order_paid_amount) DESC NULLS LAST
      LIMIT 25;
    `;
    const sellerRows = await query<SellerRow>(sellerSql, [year]);

    // 4. Detailed list — same shape as the user's base query, capped for the UI
    const listSql = `
      ${sourceCte}
      SELECT
        purchase_order_id::text,
        po_status                                                                    AS status,
        po_amount::text                                                              AS amount,
        marked_rejected_time::text,
        marked_cancelled_time::text,
        rejected_or_cancelled_time::text,
        po_number,
        payment_option,
        buyer_phone,
        buyer_business_name,
        seller_phone,
        seller_business_name,
        order_paid_amount::text,
        refund_amount::text,
        marked_status_completed_time::text,
        marked_status_initiated_time::text,
        refund_processing_hours::text,
        hours_till_refund::text
      FROM source
      ORDER BY rejected_or_cancelled_time DESC NULLS LAST
      LIMIT 2000;
    `;
    const listRows = await query<ListRow>(listSql, [year]);

    const sr = summaryRows[0];
    const totalOrders = parseInt(sr?.total_orders || '0');
    const totalPaidAmount = parseFloat(sr?.total_paid_amount || '0');
    const refundedOrders = parseInt(sr?.refunded_orders || '0');
    const totalRefundedAmount = parseFloat(sr?.total_refunded_amount || '0');
    const pendingRefundAmount = Math.max(totalPaidAmount - totalRefundedAmount, 0);
    const refundRate = totalOrders > 0 ? parseFloat(((refundedOrders / totalOrders) * 100).toFixed(2)) : 0;
    const avgRefundAmount = refundedOrders > 0 ? totalRefundedAmount / refundedOrders : 0;
    const avgRefundProcessingHours = sr?.avg_refund_time_hours ? parseFloat(sr.avg_refund_time_hours) : null;
    const avgHoursTillRefund = sr?.avg_time_till_refund_hours ? parseFloat(sr.avg_time_till_refund_hours) : null;

    const mapBucket = (r: BucketRow) => {
      const paid = parseFloat(r.paid_amount);
      const refunded = parseFloat(r.refunded_amount);
      return {
        bucketStart: r.bucket_start,
        bucketEnd: r.bucket_end,
        rejectedCount: parseInt(r.rejected_count),
        cancelledCount: parseInt(r.cancelled_count),
        orderCount: parseInt(r.order_count),
        paidAmount: paid,
        refundedAmount: refunded,
        pendingAmount: Math.max(paid - refunded, 0),
        refundedOrders: parseInt(r.refunded_orders),
        avgRefundProcessingHours: r.avg_refund_processing_hours ? parseFloat(r.avg_refund_processing_hours) : null,
      };
    };
    const byDay   = dailyRows.map(mapBucket);
    const byWeek  = weeklyRows.map(mapBucket);
    const byMonth = monthlyRows.map(mapBucket);

    const topSellers = sellerRows.map((r) => {
      const paid = parseFloat(r.paid_amount);
      const refunded = parseFloat(r.refunded_amount);
      return {
        sellerId: r.seller_id,
        sellerPhone: r.seller_phone,
        sellerBusinessName: r.seller_business_name,
        orderCount: parseInt(r.order_count),
        paidAmount: paid,
        refundedAmount: refunded,
        pendingAmount: Math.max(paid - refunded, 0),
        refundedOrders: parseInt(r.refunded_orders),
      };
    });

    const list = listRows.map((r) => ({
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
      summary: {
        totalOrders,
        totalPaidAmount,
        refundedOrders,
        totalRefundedAmount,
        pendingRefundAmount,
        refundRate,
        avgRefundAmount,
        avgRefundProcessingHours,
        avgHoursTillRefund,
      },
      byDay,
      byWeek,
      byMonth,
      topSellers,
      list,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
