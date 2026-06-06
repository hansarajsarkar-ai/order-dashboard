import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Bucket {
  bucketStart: string;
  bucketEnd: string;
  rejectedCount: number;
  cancelledCount: number;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
  avgRefundProcessingHours: number | null;
}

interface Summary {
  totalOrders: number;
  totalPaidAmount: number;
  refundedOrders: number;
  totalRefundedAmount: number;
  pendingRefundAmount: number;
  refundRate: number;
  avgRefundAmount: number;
  avgRefundProcessingHours: number | null;
  avgHoursTillRefund: number | null;
  medianRefundProcessingHours: number | null;
}

interface SellerSummary {
  sellerId: string;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  orderCount: number;
  paidAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundedOrders: number;
  totalOrders: number;
  totalAmount: number;
  deliveredOrders: number;
  deliveredAmount: number;
  refundOrderPctOfTotal: number;
}

interface ResultRow {
  result: {
    summary: Summary;
    summaryAllTime: Summary;
    buckets: Bucket[] | null;
    topSellers: SellerSummary[] | null;
    alertsCount: number;
  } | null;
}

// Shared filters. The payment/refund predicates live INSIDE the pre-aggregation
// subqueries (pop_agg / pfc_agg) — putting them at the top-level join would
// re-introduce Cartesian-product duplication for POs with multiple payment
// or refund rows. paid > 0 is enforced by the INNER JOIN on pop_agg.
const BASE_WHERE = `
  a."status" IN ('REJECTED', 'CANCELLED')
  AND a."isTest" = FALSE
  AND b."isTest" = FALSE
`;

// One row per PO: total paid across all COMPLETED FULL/PARTIAL_ADVANCE payments,
// plus a STRING_AGG of the distinct payment events. Used everywhere refund-
// dashboard math needs to be per-PO.
const POP_AGG_JOIN = `
  JOIN (
    SELECT
      "purchaseOrderId",
      SUM("paidAmount"::numeric)               AS total_paid,
      SUM(COALESCE("appliedWalletAmount", 0)::numeric) AS total_wallet,
      STRING_AGG(DISTINCT "event", ', ' ORDER BY "event") AS payment_event
    FROM "purchaseOrder"."purchaseOrderPayment"
    WHERE "status" = 'COMPLETED'
      AND "event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
    GROUP BY "purchaseOrderId"
    HAVING SUM("paidAmount"::numeric) > 0
  ) AS pop_agg ON pop_agg."purchaseOrderId" = a."id"
`;

// One row per PO: total refunded across all COMPLETED refund records, plus the
// latest completion / initiation timestamps and the latest ARN. LEFT JOIN so
// POs with no completed refund still appear (and surface as fully pending).
const PFC_AGG_JOIN = `
  LEFT JOIN (
    SELECT
      "purchaseOrderId",
      SUM("refundAmount"::numeric)                                                                       AS total_refund,
      -- All three "latest" fields come from the SAME (latest-completed) row, so
      -- refund_processing_hours = completed - initiated is meaningful even when
      -- a PO has multiple refund records.
      (ARRAY_AGG("markedStatusCompletedTime" ORDER BY "markedStatusCompletedTime" DESC NULLS LAST))[1]   AS latest_completed_time,
      (ARRAY_AGG("markedStatusInitiatedTime" ORDER BY "markedStatusCompletedTime" DESC NULLS LAST))[1]   AS latest_initiated_time,
      (ARRAY_AGG("refundARN"                 ORDER BY "markedStatusCompletedTime" DESC NULLS LAST))[1]   AS latest_refund_arn
    FROM "payments"."paymentRefundRecord"
    WHERE "status" = 'COMPLETED'
    GROUP BY "purchaseOrderId"
  ) AS pfc_agg ON pfc_agg."purchaseOrderId" = a."id"
`;

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const startDate = searchParams.get('startDate') || yyyymmdd(yearStart);
  const endDate   = searchParams.get('endDate')   || yyyymmdd(today);
  const granularityParam = (searchParams.get('granularity') || 'month').toLowerCase();
  const granularity = (['day', 'week', 'month'] as const).includes(granularityParam as 'day' | 'week' | 'month')
    ? (granularityParam as 'day' | 'week' | 'month')
    : 'month';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    // One SQL statement, one round-trip. The heavy join is run ONCE
    // (`WITH source AS MATERIALIZED ...`) and every aggregation reads from
    // the materialized in-memory set. The date predicate is a sargable
    // range scan so indexes on "markedPendingTime" can be used.
    const sql = `
      WITH source AS MATERIALIZED (
        SELECT
          a."status"                                              AS po_status,
          COALESCE(a."markedRejectedTime", a."markedCancelledTime") AS rejected_or_cancelled_time,
          s."id"                                                  AS seller_id,
          s."phone"                                               AS seller_phone,
          s."businessName"                                        AS seller_business_name,
          pop_agg.total_paid                                      AS order_paid_amount,
          pfc_agg.total_refund                                    AS refund_amount,
          EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time - pfc_agg.latest_initiated_time)) / 3600
                                                                  AS refund_processing_hours,
          EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time
            - COALESCE(a."markedRejectedTime", a."markedCancelledTime"))) / 3600
                                                                  AS hours_till_refund
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
        JOIN "users"."seller" s   ON s."id" = a."sellerId"
        ${POP_AGG_JOIN}
        ${PFC_AGG_JOIN}
        WHERE ${BASE_WHERE}
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime")::date >= $1::date
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime")::date <= $2::date
      ),
      summary_agg AS (
        SELECT
          COUNT(*)                                                          AS total_orders,
          COALESCE(SUM(order_paid_amount), 0)                               AS total_paid_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)                 AS refunded_orders,
          COALESCE(SUM(refund_amount), 0)                                   AS total_refunded_amount,
          COALESCE(SUM(order_paid_amount) FILTER (WHERE refund_amount IS NULL), 0) AS pending_refund_amount,
          AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL) AS avg_refund_time_hours,
          AVG(hours_till_refund)       FILTER (WHERE hours_till_refund IS NOT NULL)       AS avg_time_till_refund_hours,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY refund_processing_hours)
            FILTER (WHERE refund_processing_hours IS NOT NULL)                            AS median_refund_time_hours
        FROM source
      ),
      /* All-time summary — same join as source but WITHOUT the year predicate.
         Only computes aggregates, doesn't materialize row data, so it stays cheap. */
      all_time_summary_agg AS (
        -- Uses the same pre-aggregated joins as source so each PO contributes
        -- exactly ONE row, regardless of how many payment/refund records it has.
        SELECT
          COUNT(*)                                                          AS total_orders,
          COALESCE(SUM(pop_agg.total_paid), 0)                              AS total_paid_amount,
          COUNT(*) FILTER (WHERE pfc_agg.total_refund IS NOT NULL)          AS refunded_orders,
          COALESCE(SUM(pfc_agg.total_refund), 0)                            AS total_refunded_amount,
          -- Pending = paid amount of POs with NO completed refund record at all.
          COALESCE(SUM(pop_agg.total_paid) FILTER (WHERE pfc_agg.total_refund IS NULL), 0)
                                                                            AS pending_refund_amount,
          AVG(EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time - pfc_agg.latest_initiated_time)) / 3600)
            FILTER (WHERE pfc_agg.latest_initiated_time IS NOT NULL
                      AND pfc_agg.latest_completed_time IS NOT NULL)        AS avg_refund_time_hours,
          AVG(EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time
            - COALESCE(a."markedRejectedTime", a."markedCancelledTime"))) / 3600)
            FILTER (WHERE pfc_agg.latest_completed_time IS NOT NULL
                      AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") IS NOT NULL)
                                                                            AS avg_time_till_refund_hours,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time - pfc_agg.latest_initiated_time)) / 3600
          ) FILTER (WHERE pfc_agg.latest_initiated_time IS NOT NULL
                      AND pfc_agg.latest_completed_time IS NOT NULL)        AS median_refund_time_hours
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
        JOIN "users"."seller" s   ON s."id" = a."sellerId"
        ${POP_AGG_JOIN}
        ${PFC_AGG_JOIN}
        WHERE ${BASE_WHERE}
      ),
      bucket_agg AS (
        SELECT
          date_trunc('${granularity}', rejected_or_cancelled_time)::date AS bucket_start,
          ${granularity === 'day'
            ? `date_trunc('day', rejected_or_cancelled_time)::date`
            : granularity === 'week'
              ? `(date_trunc('week', rejected_or_cancelled_time) + interval '6 days')::date`
              : `(date_trunc('month', rejected_or_cancelled_time) + interval '1 month' - interval '1 day')::date`} AS bucket_end,
          COUNT(*) FILTER (WHERE po_status = 'REJECTED')               AS rejected_count,
          COUNT(*) FILTER (WHERE po_status = 'CANCELLED')              AS cancelled_count,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COALESCE(SUM(order_paid_amount) FILTER (WHERE refund_amount IS NULL), 0) AS pending_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders,
          AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL) AS avg_refund_processing_hours
        FROM source
        WHERE rejected_or_cancelled_time IS NOT NULL
        GROUP BY date_trunc('${granularity}', rejected_or_cancelled_time)
      ),
      seller_agg AS (
        SELECT
          seller_id,
          MAX(seller_phone)                                            AS seller_phone,
          MAX(seller_business_name)                                    AS seller_business_name,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COALESCE(SUM(order_paid_amount) FILTER (WHERE refund_amount IS NULL), 0) AS pending_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders
        FROM source
        GROUP BY seller_id
        ORDER BY SUM(order_paid_amount) DESC NULLS LAST
        LIMIT 25
      ),
      /* All-time order context per seller — independent of the date range filter.
         Two buckets so the UI can show both "what the seller put through" (placed
         = any non-DRAFT) and "what actually shipped" (delivered + completed).
         Refund % is computed against the placed bucket. Restricted to seller_ids
         already in seller_agg to avoid scanning the full PO table. */
      seller_total_agg AS (
        SELECT
          a."sellerId"                                                                                       AS seller_id,
          COUNT(*) FILTER (WHERE a."status" <> 'DRAFT')                                                      AS total_orders,
          COALESCE(SUM(a."amount"::numeric) FILTER (WHERE a."status" <> 'DRAFT'), 0)                         AS total_amount,
          COUNT(*) FILTER (WHERE a."status" IN ('DELIVERED', 'COMPLETED'))                                   AS delivered_orders,
          COALESCE(SUM(a."amount"::numeric) FILTER (WHERE a."status" IN ('DELIVERED', 'COMPLETED')), 0)      AS delivered_amount
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer" b ON b."id" = a."buyerId"
        WHERE a."sellerId" IN (SELECT seller_id FROM seller_agg)
          AND a."isTest" = FALSE
          AND b."isTest" = FALSE
        GROUP BY a."sellerId"
      ),
      /* Lightweight count of orders still pending refund > 10 minutes; the full
         alerts payload is fetched lazily via /api/refund-order-amount/alerts.
         This count powers the red badge on the Alerts tab. */
      alerts_count AS (
        SELECT COUNT(*) AS alert_count
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b ON b."id" = a."buyerId"
        ${POP_AGG_JOIN}
        ${PFC_AGG_JOIN}
        WHERE ${BASE_WHERE}
          AND pfc_agg.total_refund IS NULL
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") IS NOT NULL
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") < NOW() - INTERVAL '10 minutes'
      )
      SELECT json_build_object(
        'summary', (
          SELECT json_build_object(
            'totalOrders',                total_orders,
            'totalPaidAmount',            total_paid_amount,
            'refundedOrders',             refunded_orders,
            'totalRefundedAmount',        total_refunded_amount,
            'pendingRefundAmount',        pending_refund_amount,
            'refundRate',                 CASE WHEN total_orders > 0 THEN ROUND((refunded_orders::numeric / total_orders) * 100, 2) ELSE 0 END,
            'avgRefundAmount',            CASE WHEN refunded_orders > 0 THEN total_refunded_amount / refunded_orders ELSE 0 END,
            'avgRefundProcessingHours',   avg_refund_time_hours,
            'avgHoursTillRefund',         avg_time_till_refund_hours,
            'medianRefundProcessingHours', median_refund_time_hours
          )
          FROM summary_agg
        ),
        'summaryAllTime', (
          SELECT json_build_object(
            'totalOrders',                total_orders,
            'totalPaidAmount',            total_paid_amount,
            'refundedOrders',             refunded_orders,
            'totalRefundedAmount',        total_refunded_amount,
            'pendingRefundAmount',        pending_refund_amount,
            'refundRate',                 CASE WHEN total_orders > 0 THEN ROUND((refunded_orders::numeric / total_orders) * 100, 2) ELSE 0 END,
            'avgRefundAmount',            CASE WHEN refunded_orders > 0 THEN total_refunded_amount / refunded_orders ELSE 0 END,
            'avgRefundProcessingHours',   avg_refund_time_hours,
            'avgHoursTillRefund',         avg_time_till_refund_hours,
            'medianRefundProcessingHours', median_refund_time_hours
          )
          FROM all_time_summary_agg
        ),
        'buckets', (
          SELECT json_agg(json_build_object(
            'bucketStart',                TO_CHAR(bucket_start, 'YYYY-MM-DD'),
            'bucketEnd',                  TO_CHAR(bucket_end, 'YYYY-MM-DD'),
            'rejectedCount',              rejected_count,
            'cancelledCount',             cancelled_count,
            'orderCount',                 order_count,
            'paidAmount',                 paid_amount,
            'refundedAmount',             refunded_amount,
            'pendingAmount',              pending_amount,
            'refundedOrders',             refunded_orders,
            'avgRefundProcessingHours',   avg_refund_processing_hours
          ) ORDER BY bucket_start DESC)
          FROM bucket_agg
        ),
        'topSellers', (
          SELECT json_agg(json_build_object(
            'sellerId',                   sa.seller_id::text,
            'sellerPhone',                sa.seller_phone,
            'sellerBusinessName',         sa.seller_business_name,
            'orderCount',                 sa.order_count,
            'paidAmount',                 sa.paid_amount,
            'refundedAmount',             sa.refunded_amount,
            'pendingAmount',              sa.pending_amount,
            'refundedOrders',             sa.refunded_orders,
            'totalOrders',                COALESCE(sta.total_orders, 0),
            'totalAmount',                COALESCE(sta.total_amount, 0),
            'deliveredOrders',            COALESCE(sta.delivered_orders, 0),
            'deliveredAmount',            COALESCE(sta.delivered_amount, 0),
            'refundOrderPctOfTotal',      CASE
                                            WHEN COALESCE(sta.total_orders, 0) > 0
                                              THEN ROUND((sa.refunded_orders::numeric * 100) / sta.total_orders, 2)
                                            ELSE 0
                                          END
          ))
          FROM seller_agg sa
          LEFT JOIN seller_total_agg sta ON sta.seller_id = sa.seller_id
        ),
        'alertsCount', (SELECT alert_count FROM alerts_count)
      ) AS result;
    `;

    const rows = await query<ResultRow>(sql, [startDate, endDate]);
    const r = rows[0]?.result;

    if (!r) {
      const emptySummary = {
        totalOrders: 0, totalPaidAmount: 0, refundedOrders: 0, totalRefundedAmount: 0,
        pendingRefundAmount: 0, refundRate: 0, avgRefundAmount: 0,
        avgRefundProcessingHours: null, avgHoursTillRefund: null,
        medianRefundProcessingHours: null,
      };
      return NextResponse.json({
        summary: emptySummary,
        summaryAllTime: emptySummary,
        buckets: [], topSellers: [], alertsCount: 0,
        granularity, startDate, endDate,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      summary: r.summary,
      summaryAllTime: r.summaryAllTime,
      buckets:     r.buckets     ?? [],
      topSellers:  r.topSellers  ?? [],
      alertsCount: r.alertsCount ?? 0,
      granularity, startDate, endDate,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
