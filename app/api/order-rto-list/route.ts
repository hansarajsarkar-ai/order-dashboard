import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  order_date: string | null;
  itl_date: string | null;
  marked_rejected_time: string | null;
  marked_rejected_at: string | null;
  latest_attempt_time: string | null;
  po_number: string;
  po_status: string;
  order_value: string;
  coupon_value: string;
  payment_mode: string | null;
  brand_name: string | null;
  shipment_status: string | null;
  final_failure_reason: string | null;
  delivery_attempt: string | null;
  attempt_1_time: string | null;
  attempt_1_remarks: string | null;
  attempt_2_time: string | null;
  attempt_2_remarks: string | null;
  attempt_3_time: string | null;
  attempt_3_remarks: string | null;
  attempt_4_time: string | null;
  attempt_4_remarks: string | null;
  attempt_5_time: string | null;
  attempt_5_remarks: string | null;
  attempt_6_time: string | null;
  attempt_6_remarks: string | null;
  awb_number: string | null;
  logistic_name: string | null;
  cod_collect: string | null;
  buyer_name: string | null;
  buyer_business_name: string | null;
  buyer_phone: string | null;
  buyer_full_address: string | null;
  buyer_longitude: string | null;
  buyer_latitude: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Filter by rejection date. Defaults to the current year.
  // Accepts ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD for a custom window.
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    const params: (string | number)[] = [];
    let dateFilter: string;
    if (startDate || endDate) {
      const clauses: string[] = [];
      if (startDate) {
        params.push(startDate);
        clauses.push(`po."markedRejectedTime"::date >= $${params.length}::date`);
      }
      if (endDate) {
        params.push(endDate);
        clauses.push(`po."markedRejectedTime"::date <= $${params.length}::date`);
      }
      dateFilter = clauses.join(' AND ');
    } else {
      // No range given → current year only
      dateFilter = `EXTRACT(YEAR FROM po."markedRejectedTime") = EXTRACT(YEAR FROM CURRENT_DATE)`;
    }

    const sql = `
      SELECT
        TO_CHAR(po."markedPendingTime",  'DD Mon YYYY HH12:MI AM') AS order_date,
        TO_CHAR(di."created_at",         'DD Mon YYYY HH12:MI AM') AS itl_date,
        TO_CHAR(po."markedRejectedTime", 'DD Mon YYYY HH12:MI AM') AS marked_rejected_time,
        po."markedRejectedTime"                                    AS marked_rejected_at,
        CASE
          WHEN di."status" ILIKE '%out for delivery%'
            THEN attempt_data.out_for_delivery_time
          ELSE attempt_data.latest_attempt_time
        END                                                        AS latest_attempt_time,
        po."poNumber"                                              AS po_number,
        po."status"                                                AS po_status,
        po."amount"::text                                          AS order_value,
        COALESCE(po."appliedOfferDiscount", 0)::text               AS coupon_value,
        po."paymentInfo"->>'option'                                AS payment_mode,
        CASE
          WHEN LOWER(REPLACE(TRIM(SPLIT_PART(s."businessName", '-', 1)), ' ', '')) = 'chukde'
            THEN 'ChukDe'
          ELSE TRIM(SPLIT_PART(s."businessName", '-', 1))
        END                                                        AS brand_name,
        di."status"                                                AS shipment_status,
        attempt_data.final_attempt_reason                          AS final_failure_reason,
        attempt_data.delivery_attempt::text                        AS delivery_attempt,
        attempt_data.attempt_1_time,
        attempt_data.attempt_1_remarks,
        attempt_data.attempt_2_time,
        attempt_data.attempt_2_remarks,
        attempt_data.attempt_3_time,
        attempt_data.attempt_3_remarks,
        attempt_data.attempt_4_time,
        attempt_data.attempt_4_remarks,
        attempt_data.attempt_5_time,
        attempt_data.attempt_5_remarks,
        attempt_data.attempt_6_time,
        attempt_data.attempt_6_remarks,
        di."trackingInfo"->>'awbNumber'                            AS awb_number,
        di."trackingInfo"->>'courierName'                          AS logistic_name,
        COALESCE(di."codAmountToBeCollected", 0)::text             AS cod_collect,
        b."name"                                                   AS buyer_name,
        b."businessName"                                           AS buyer_business_name,
        b."phone"                                                  AS buyer_phone,
        CONCAT_WS(', ',
          b."addressLine1",
          b."addressLine2",
          UPPER(b."landmark"),
          b."city",
          b."district",
          b."state",
          b."pincode"
        )                                                          AS buyer_full_address,
        b."longitude"::text                                        AS buyer_longitude,
        b."lattitude"::text                                        AS buyer_latitude

      FROM "purchaseOrder"."purchaseOrder" po

      JOIN "deliveries"."intercityDelivery" di
        ON po."id" = di."purchaseOrderId"

      JOIN LATERAL (
        SELECT d."id"
        FROM "deliveries"."intercityDelivery" d
        WHERE d."purchaseOrderId" = po."id"
          AND d."isTest" = FALSE
        ORDER BY d."created_at" DESC
        LIMIT 1
      ) di_latest ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE is_valid_attempt = 1) AS delivery_attempt,
          (ARRAY_AGG(attempt_remark ORDER BY scan_date DESC)
             FILTER (WHERE is_valid_attempt = 1))[1]   AS final_attempt_reason,
          MAX(CASE WHEN rn = 1 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_1_time,
          MAX(CASE WHEN rn = 1 THEN attempt_remark END)                                AS attempt_1_remarks,
          MAX(CASE WHEN rn = 2 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_2_time,
          MAX(CASE WHEN rn = 2 THEN attempt_remark END)                                AS attempt_2_remarks,
          MAX(CASE WHEN rn = 3 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_3_time,
          MAX(CASE WHEN rn = 3 THEN attempt_remark END)                                AS attempt_3_remarks,
          MAX(CASE WHEN rn = 4 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_4_time,
          MAX(CASE WHEN rn = 4 THEN attempt_remark END)                                AS attempt_4_remarks,
          MAX(CASE WHEN rn = 5 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_5_time,
          MAX(CASE WHEN rn = 5 THEN attempt_remark END)                                AS attempt_5_remarks,
          MAX(CASE WHEN rn = 6 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_6_time,
          MAX(CASE WHEN rn = 6 THEN attempt_remark END)                                AS attempt_6_remarks,
          MAX(TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM'))
            FILTER (WHERE is_valid_attempt = 1)                                        AS latest_attempt_time,
          (
            SELECT TO_CHAR(MAX((scan->>'date')::timestamp), 'DD Mon YYYY HH12:MI AM')
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                THEN di."latestLogDetails"::jsonb -> 'scans'
                ELSE '[]'::jsonb
              END
            ) AS scan
            WHERE LOWER(scan->>'activity') LIKE '%out for delivery%'
               OR UPPER(scan->>'status')   = 'OUT_FOR_DELIVERY'
          ) AS out_for_delivery_time
        FROM (
          SELECT *, ROW_NUMBER() OVER (ORDER BY scan_date ASC) AS rn
          FROM (
            SELECT DISTINCT ON (scan_date::date, attempt_remark)
              scan_date,
              attempt_remark,
              is_valid_attempt
            FROM (
              SELECT
                (scan->>'date')::timestamp AS scan_date,
                scan->>'activity'          AS attempt_remark,
                CASE
                  WHEN (
                    LOWER(scan->>'activity') LIKE '%attempt%'
                    OR LOWER(scan->>'activity') LIKE '%not delivered%'
                    OR LOWER(scan->>'activity') LIKE '%delivery failed%'
                    OR LOWER(scan->>'activity') LIKE '%customer not%'
                    OR LOWER(scan->>'activity') LIKE '%refused%'
                    OR LOWER(scan->>'activity') LIKE '%unavailable%'
                    OR LOWER(scan->>'activity') LIKE '%no response%'
                  )
                  AND NOT (
                    LOWER(scan->>'activity') LIKE '%maximum attempt%'
                    OR LOWER(scan->>'activity') LIKE '%self collect%'
                  )
                  THEN 1
                  ELSE 0
                END AS is_valid_attempt
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                  THEN di."latestLogDetails"::jsonb -> 'scans'
                  ELSE '[]'::jsonb
                END
              ) AS scan
              WHERE LOWER(scan->>'activity') SIMILAR TO
                    '%(attempt|not delivered|delivery failed|customer not|refused|unavailable|no response)%'
                AND NOT (
                  TRIM(scan->>'activity') ILIKE ANY (ARRAY[
                    'Shipper unavailable',
                    'No client instructions to Reattempt',
                    'Reattempt as per Client''s instruction',
                    'Reattempt - As per NDR instructions',
                    'Maximum attempts reached',
                    'Not attempted'
                  ])
                )
                AND LOWER(scan->>'activity') NOT LIKE '%not attempted%'
            ) raw_scans
            ORDER BY scan_date::date, attempt_remark, scan_date
          ) filtered
        ) final_inner
      ) attempt_data ON TRUE

      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"

      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND di."isTest"          = FALSE
        AND di."id"              = di_latest."id"
        AND ${dateFilter}
        AND di."status" ILIKE '%rto%'
      ORDER BY po."markedRejectedTime" DESC, po."markedPendingTime" DESC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      orderDate: r.order_date,
      itlDate: r.itl_date,
      markedRejectedTime: r.marked_rejected_time,
      markedRejectedAt: r.marked_rejected_at,
      latestAttemptTime: r.latest_attempt_time,
      poNumber: r.po_number,
      poStatus: r.po_status,
      orderValue: parseFloat(r.order_value || '0'),
      couponValue: parseFloat(r.coupon_value || '0'),
      paymentMode: r.payment_mode,
      brandName: r.brand_name,
      shipmentStatus: r.shipment_status,
      finalFailureReason: r.final_failure_reason,
      deliveryAttempt: r.delivery_attempt ? parseInt(r.delivery_attempt) : 0,
      attempt1Time: r.attempt_1_time,
      attempt1Remarks: r.attempt_1_remarks,
      attempt2Time: r.attempt_2_time,
      attempt2Remarks: r.attempt_2_remarks,
      attempt3Time: r.attempt_3_time,
      attempt3Remarks: r.attempt_3_remarks,
      attempt4Time: r.attempt_4_time,
      attempt4Remarks: r.attempt_4_remarks,
      attempt5Time: r.attempt_5_time,
      attempt5Remarks: r.attempt_5_remarks,
      attempt6Time: r.attempt_6_time,
      attempt6Remarks: r.attempt_6_remarks,
      awbNumber: r.awb_number,
      logisticName: r.logistic_name,
      codCollect: parseFloat(r.cod_collect || '0'),
      buyerName: r.buyer_name,
      buyerBusinessName: r.buyer_business_name,
      buyerPhone: r.buyer_phone,
      buyerFullAddress: r.buyer_full_address,
      buyerLongitude: r.buyer_longitude,
      buyerLatitude: r.buyer_latitude,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
