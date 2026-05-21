import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

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
}

interface ListItem {
  purchaseOrderId: string;
  status: string;
  deliveryStatus: string | null;
  amount: number;
  createdAt: string | null;
  markedPendingTime: string | null;
  markedRejectedTime: string | null;
  markedCancelledTime: string | null;
  rejectedOrCancelledTime: string | null;
  poNumber: string;
  paymentOption: string | null;
  paymentEvent: string | null;
  paymentAttemptId: string | null;
  appliedWalletAmount: number | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  orderPaidAmount: number;
  refundAmount: number | null;
  refundARN: string | null;
  markedStatusCompletedTime: string | null;
  markedStatusInitiatedTime: string | null;
  refundProcessingHours: number | null;
  hoursTillRefund: number | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  reasonCategory: string;
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

interface ResultRow {
  result: {
    summary: Summary;
    summaryAllTime: Summary;
    byDay: Bucket[] | null;
    byWeek: Bucket[] | null;
    byMonth: Bucket[] | null;
    topSellers: SellerSummary[] | null;
    list: ListItem[] | null;
    alerts: AlertItem[] | null;
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
      SUM("refundAmount"::numeric)                       AS total_refund,
      MAX("markedStatusCompletedTime")                   AS latest_completed_time,
      MAX("markedStatusInitiatedTime")                   AS latest_initiated_time,
      (ARRAY_AGG("refundARN" ORDER BY "markedStatusCompletedTime" DESC NULLS LAST))[1] AS latest_refund_arn
    FROM "payments"."paymentRefundRecord"
    WHERE "status" = 'COMPLETED'
    GROUP BY "purchaseOrderId"
  ) AS pfc_agg ON pfc_agg."purchaseOrderId" = a."id"
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Date range filter, applied to rejected_or_cancelled_time (the user-provided
  // base query filters here too). Defaults to current year if missing.
  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const startDate = searchParams.get('startDate') || yyyymmdd(yearStart);
  const endDate   = searchParams.get('endDate')   || yyyymmdd(today);

  // Basic validation — must be YYYY-MM-DD-ish (Postgres will reject anything weirder).
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
          a."id"                                  AS purchase_order_id,
          a."status"                              AS po_status,
          a."amount"::numeric                     AS po_amount,
          a."created_at"                          AS created_at,
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
          pop_agg.total_paid                      AS order_paid_amount,
          pop_agg.payment_event                   AS payment_event,
          pop_agg.total_wallet                    AS applied_wallet_amount,
          poa."id"                                AS payment_attempt_id,
          pfc_agg.total_refund                    AS refund_amount,
          pfc_agg.latest_refund_arn               AS refund_arn,
          pfc_agg.latest_completed_time           AS marked_status_completed_time,
          pfc_agg.latest_initiated_time           AS marked_status_initiated_time,
          EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time - pfc_agg.latest_initiated_time)) / 3600
                                                  AS refund_processing_hours,
          EXTRACT(EPOCH FROM (pfc_agg.latest_completed_time
            - COALESCE(a."markedRejectedTime", a."markedCancelledTime"))) / 3600
                                                  AS hours_till_refund,
          a."rejectReason"                        AS reject_reason,
          a."rejectedBy"                          AS rejected_by,
          a."reasonAddedByBadhoTeam"              AS reason_added_by_badho_team,
          a."deliveryStatus"                      AS delivery_status,
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
          AVG(hours_till_refund)       FILTER (WHERE hours_till_refund IS NOT NULL)       AS avg_time_till_refund_hours
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
                                                                            AS avg_time_till_refund_hours
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b   ON b."id" = a."buyerId"
        JOIN "users"."seller" s   ON s."id" = a."sellerId"
        ${POP_AGG_JOIN}
        ${PFC_AGG_JOIN}
        WHERE ${BASE_WHERE}
      ),
      day_agg AS (
        SELECT
          date_trunc('day', rejected_or_cancelled_time)::date          AS bucket_start,
          date_trunc('day', rejected_or_cancelled_time)::date          AS bucket_end,
          COUNT(*) FILTER (WHERE po_status = 'REJECTED')               AS rejected_count,
          COUNT(*) FILTER (WHERE po_status = 'CANCELLED')              AS cancelled_count,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders,
          AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL) AS avg_refund_processing_hours
        FROM source
        WHERE rejected_or_cancelled_time IS NOT NULL
        GROUP BY date_trunc('day', rejected_or_cancelled_time)
      ),
      week_agg AS (
        SELECT
          date_trunc('week', rejected_or_cancelled_time)::date                                  AS bucket_start,
          (date_trunc('week', rejected_or_cancelled_time) + interval '6 days')::date            AS bucket_end,
          COUNT(*) FILTER (WHERE po_status = 'REJECTED')               AS rejected_count,
          COUNT(*) FILTER (WHERE po_status = 'CANCELLED')              AS cancelled_count,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders,
          AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL) AS avg_refund_processing_hours
        FROM source
        WHERE rejected_or_cancelled_time IS NOT NULL
        GROUP BY date_trunc('week', rejected_or_cancelled_time)
      ),
      month_agg AS (
        SELECT
          date_trunc('month', rejected_or_cancelled_time)::date                                          AS bucket_start,
          (date_trunc('month', rejected_or_cancelled_time) + interval '1 month' - interval '1 day')::date AS bucket_end,
          COUNT(*) FILTER (WHERE po_status = 'REJECTED')               AS rejected_count,
          COUNT(*) FILTER (WHERE po_status = 'CANCELLED')              AS cancelled_count,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders,
          AVG(refund_processing_hours) FILTER (WHERE refund_processing_hours IS NOT NULL) AS avg_refund_processing_hours
        FROM source
        WHERE rejected_or_cancelled_time IS NOT NULL
        GROUP BY date_trunc('month', rejected_or_cancelled_time)
      ),
      seller_agg AS (
        SELECT
          seller_id,
          MAX(seller_phone)                                            AS seller_phone,
          MAX(seller_business_name)                                    AS seller_business_name,
          COUNT(*)                                                     AS order_count,
          COALESCE(SUM(order_paid_amount), 0)                          AS paid_amount,
          COALESCE(SUM(refund_amount), 0)                              AS refunded_amount,
          COUNT(*) FILTER (WHERE refund_amount IS NOT NULL)            AS refunded_orders
        FROM source
        GROUP BY seller_id
        ORDER BY SUM(order_paid_amount) DESC NULLS LAST
        LIMIT 25
      ),
      list_data AS (
        SELECT *
        FROM source
        ORDER BY rejected_or_cancelled_time DESC NULLS LAST
        LIMIT 2000
      ),
      /* Alerts — orders pending refund > 10 minutes. Always ALL-TIME so the
         Alerts tab is independent of whatever preset is active on the other
         tabs (it's a current-state ops view, not a historical slice). */
      alerts_data AS (
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
          AND pfc_agg.total_refund IS NULL   -- no completed refund records at all
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") IS NOT NULL
          AND COALESCE(a."markedRejectedTime", a."markedCancelledTime") < NOW() - INTERVAL '10 minutes'
        ORDER BY COALESCE(a."markedRejectedTime", a."markedCancelledTime") ASC
        LIMIT 500
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
            'avgHoursTillRefund',         avg_time_till_refund_hours
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
            'avgHoursTillRefund',         avg_time_till_refund_hours
          )
          FROM all_time_summary_agg
        ),
        'byDay', (
          SELECT json_agg(json_build_object(
            'bucketStart',                TO_CHAR(bucket_start, 'YYYY-MM-DD'),
            'bucketEnd',                  TO_CHAR(bucket_end, 'YYYY-MM-DD'),
            'rejectedCount',              rejected_count,
            'cancelledCount',             cancelled_count,
            'orderCount',                 order_count,
            'paidAmount',                 paid_amount,
            'refundedAmount',             refunded_amount,
            'pendingAmount',              GREATEST(paid_amount - refunded_amount, 0),
            'refundedOrders',             refunded_orders,
            'avgRefundProcessingHours',   avg_refund_processing_hours
          ) ORDER BY bucket_start DESC)
          FROM day_agg
        ),
        'byWeek', (
          SELECT json_agg(json_build_object(
            'bucketStart',                TO_CHAR(bucket_start, 'YYYY-MM-DD'),
            'bucketEnd',                  TO_CHAR(bucket_end, 'YYYY-MM-DD'),
            'rejectedCount',              rejected_count,
            'cancelledCount',             cancelled_count,
            'orderCount',                 order_count,
            'paidAmount',                 paid_amount,
            'refundedAmount',             refunded_amount,
            'pendingAmount',              GREATEST(paid_amount - refunded_amount, 0),
            'refundedOrders',             refunded_orders,
            'avgRefundProcessingHours',   avg_refund_processing_hours
          ) ORDER BY bucket_start DESC)
          FROM week_agg
        ),
        'byMonth', (
          SELECT json_agg(json_build_object(
            'bucketStart',                TO_CHAR(bucket_start, 'YYYY-MM-DD'),
            'bucketEnd',                  TO_CHAR(bucket_end, 'YYYY-MM-DD'),
            'rejectedCount',              rejected_count,
            'cancelledCount',             cancelled_count,
            'orderCount',                 order_count,
            'paidAmount',                 paid_amount,
            'refundedAmount',             refunded_amount,
            'pendingAmount',              GREATEST(paid_amount - refunded_amount, 0),
            'refundedOrders',             refunded_orders,
            'avgRefundProcessingHours',   avg_refund_processing_hours
          ) ORDER BY bucket_start DESC)
          FROM month_agg
        ),
        'topSellers', (
          SELECT json_agg(json_build_object(
            'sellerId',                   seller_id::text,
            'sellerPhone',                seller_phone,
            'sellerBusinessName',         seller_business_name,
            'orderCount',                 order_count,
            'paidAmount',                 paid_amount,
            'refundedAmount',             refunded_amount,
            'pendingAmount',              GREATEST(paid_amount - refunded_amount, 0),
            'refundedOrders',             refunded_orders
          ))
          FROM seller_agg
        ),
        'list', (
          SELECT json_agg(json_build_object(
            'purchaseOrderId',            purchase_order_id::text,
            'status',                     po_status,
            'deliveryStatus',             delivery_status,
            'amount',                     po_amount,
            'createdAt',                  created_at,
            'markedPendingTime',          marked_pending_time,
            'markedRejectedTime',         marked_rejected_time,
            'markedCancelledTime',        marked_cancelled_time,
            'rejectedOrCancelledTime',    rejected_or_cancelled_time,
            'poNumber',                   po_number,
            'paymentOption',              payment_option,
            'paymentEvent',               payment_event,
            'paymentAttemptId',           payment_attempt_id::text,
            'appliedWalletAmount',        applied_wallet_amount,
            'buyerPhone',                 buyer_phone,
            'buyerBusinessName',          buyer_business_name,
            'sellerPhone',                seller_phone,
            'sellerBusinessName',         seller_business_name,
            'orderPaidAmount',            order_paid_amount,
            'refundAmount',               refund_amount,
            'refundARN',                  refund_arn,
            'markedStatusCompletedTime',  marked_status_completed_time,
            'markedStatusInitiatedTime',  marked_status_initiated_time,
            'refundProcessingHours',      refund_processing_hours,
            'hoursTillRefund',            hours_till_refund,
            'rejectReason',               reject_reason,
            'rejectedBy',                 rejected_by,
            'reasonAddedByBadhoTeam',     reason_added_by_badho_team,
            'reasonCategory',             reason_category
          ))
          FROM list_data
        ),
        'alerts', (
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
          ))
          FROM alerts_data
        )
      ) AS result;
    `;

    const rows = await query<ResultRow>(sql, [startDate, endDate]);
    const r = rows[0]?.result;

    if (!r) {
      // No matching orders in range — return empty shells so the UI can render.
      const emptySummary = {
        totalOrders: 0, totalPaidAmount: 0, refundedOrders: 0, totalRefundedAmount: 0,
        pendingRefundAmount: 0, refundRate: 0, avgRefundAmount: 0,
        avgRefundProcessingHours: null, avgHoursTillRefund: null,
      };
      return NextResponse.json({
        summary: emptySummary,
        summaryAllTime: emptySummary,
        byDay: [], byWeek: [], byMonth: [], topSellers: [], list: [], alerts: [],
        startDate, endDate,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      summary: r.summary,
      summaryAllTime: r.summaryAllTime,
      byDay:      r.byDay      ?? [],
      byWeek:     r.byWeek     ?? [],
      byMonth:    r.byMonth    ?? [],
      topSellers: r.topSellers ?? [],
      list:       r.list       ?? [],
      alerts:     r.alerts     ?? [],
      startDate, endDate,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
