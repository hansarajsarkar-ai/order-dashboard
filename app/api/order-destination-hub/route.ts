import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Destination Hub Tracking — Delhivery RTO / OFD / Reached-At-Destination
// shipments. Surfaces the latest scan, when (and where) the shipment first
// reached the destination hub, plus up to six delivery-attempt slots so ops
// can spot shipments that have stalled at the hub.

interface Row {
  order_datetime: string | null;
  itl_datetime: string | null;
  reached_at_destination_time: string | null;
  reached_at_destination_place: string | null;
  picked_up_time: string | null;
  pickup_to_hub_days: number | null;
  days_since_reached_at_destination: number | null;
  latest_scan_time: string | null;
  latest_scan_place: string | null;
  still_in_destination_hub: string | null;
  po_number: string;
  po_status: string;
  order_value: string | null;
  coupon_value: string | null;
  payment_mode: string | null;
  brand_name: string | null;
  shipment_status: string | null;
  delivery_attempt: string | null;
  attempt_1_time: string | null;  attempt_1_remarks: string | null;
  attempt_2_time: string | null;  attempt_2_remarks: string | null;
  attempt_3_time: string | null;  attempt_3_remarks: string | null;
  attempt_4_time: string | null;  attempt_4_remarks: string | null;
  attempt_5_time: string | null;  attempt_5_remarks: string | null;
  attempt_6_time: string | null;  attempt_6_remarks: string | null;
  awb_number: string | null;
  logistic_name: string | null;
  cod_collect: string | null;
  volumetric_weight: string | null;
  absolute_weight: string | null;
  chargeable_weight: string | null;
  buyer_name: string | null;
  buyer_business_name: string | null;
  buyer_phone: string | null;
  buyer_full_address: string | null;
  buyer_longitude: string | null;
  buyer_latitude: string | null;
  paid_amount: string | null;
  applied_wallet_amount: string | null;
}

async function _GET(_req: NextRequest) {
  try {
    const sql = `
      SELECT
        TO_CHAR(po."markedPendingTime", 'DD Mon YYYY HH12:MI AM') AS order_datetime,
        TO_CHAR(di."created_at", 'DD Mon YYYY HH12:MI AM')        AS itl_datetime,
        rad.reached_at_destination_time                            AS reached_at_destination_time,
        rad.reached_at_destination_place                           AS reached_at_destination_place,
        TO_CHAR(pu.picked_up_ts, 'DD Mon YYYY HH12:MI AM')         AS picked_up_time,
        -- Transit days from pickup to reaching the destination hub.
        CASE WHEN rad.reached_at_destination_ts IS NOT NULL AND pu.picked_up_ts IS NOT NULL
             THEN ROUND(EXTRACT(EPOCH FROM (rad.reached_at_destination_ts - pu.picked_up_ts)) / 86400.0 ::numeric, 2)
             ELSE NULL END                                         AS pickup_to_hub_days,
        CASE
          WHEN rad.reached_at_destination_place IS NULL
            OR latest_scan.latest_scan_place    IS NULL
              THEN NULL
          WHEN TRIM(LOWER(rad.reached_at_destination_place))
             = TRIM(LOWER(latest_scan.latest_scan_place))
              THEN ROUND(
                  EXTRACT(EPOCH FROM (NOW() - rad.reached_at_destination_ts)) / 86400.0
              ::numeric, 2)
          ELSE NULL
        END AS days_since_reached_at_destination,
        latest_scan.latest_scan_time     AS latest_scan_time,
        latest_scan.latest_scan_place    AS latest_scan_place,
        CASE
          WHEN rad.reached_at_destination_place IS NULL
            OR latest_scan.latest_scan_place    IS NULL
              THEN NULL
          WHEN TRIM(LOWER(rad.reached_at_destination_place))
             = TRIM(LOWER(latest_scan.latest_scan_place))
              THEN 'Yes'
          ELSE 'No'
        END AS still_in_destination_hub,
        po."poNumber"                              AS po_number,
        po."status"                                AS po_status,
        (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))::text                          AS order_value,
        COALESCE(po."appliedOfferDiscount", 0)::text AS coupon_value,
        po."paymentInfo"->>'option'                AS payment_mode,
        CASE
          WHEN LOWER(REPLACE(TRIM(SPLIT_PART(s."businessName", '-', 1)), ' ', '')) = 'chukde'
            THEN 'ChukDe'
          ELSE TRIM(SPLIT_PART(s."businessName", '-', 1))
        END                                        AS brand_name,
        di."status"                                AS shipment_status,
        attempt_data.delivery_attempt::text        AS delivery_attempt,
        attempt_data.attempt_1_time   AS attempt_1_time,
        attempt_data.attempt_1_remarks AS attempt_1_remarks,
        attempt_data.attempt_2_time   AS attempt_2_time,
        attempt_data.attempt_2_remarks AS attempt_2_remarks,
        attempt_data.attempt_3_time   AS attempt_3_time,
        attempt_data.attempt_3_remarks AS attempt_3_remarks,
        attempt_data.attempt_4_time   AS attempt_4_time,
        attempt_data.attempt_4_remarks AS attempt_4_remarks,
        attempt_data.attempt_5_time   AS attempt_5_time,
        attempt_data.attempt_5_remarks AS attempt_5_remarks,
        attempt_data.attempt_6_time   AS attempt_6_time,
        attempt_data.attempt_6_remarks AS attempt_6_remarks,
        di."trackingInfo"->>'awbNumber'   AS awb_number,
        di."trackingInfo"->>'courierName' AS logistic_name,
        COALESCE(di."codAmountToBeCollected", 0)::text AS cod_collect,
        -- Weights from latest intercity delivery metaDetails (dims in cm).
        ROUND(((di."metaDetails"->>'length')::numeric * (di."metaDetails"->>'breadth')::numeric * (di."metaDetails"->>'height')::numeric) / 5000.0, 3)::text AS volumetric_weight,
        (di."metaDetails"->>'weight')::numeric::text   AS absolute_weight,
        ROUND(GREATEST(((di."metaDetails"->>'length')::numeric * (di."metaDetails"->>'breadth')::numeric * (di."metaDetails"->>'height')::numeric) / 5000.0, (di."metaDetails"->>'weight')::numeric), 3)::text AS chargeable_weight,
        b."name"         AS buyer_name,
        b."businessName" AS buyer_business_name,
        b."phone"        AS buyer_phone,
        CONCAT_WS(', ',
          b."addressLine1",
          b."addressLine2",
          UPPER(b."landmark"),
          b."city",
          b."district",
          b."state",
          b."pincode"
        ) AS buyer_full_address,
        b."longitude"::text AS buyer_longitude,
        b."lattitude"::text AS buyer_latitude,
        pop."paidAmount"::text          AS paid_amount,
        pop."appliedWalletAmount"::text AS applied_wallet_amount
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
      -- Destination-hub arrival
      -- Destination-hub location is identified by two CONDITIONS + a CHECK that overrides:
      --   Condition 1: latest scan with activity = "Shipment Received at Facility"
      --                (prefer one whose status is REACHED AT DESTINATION)
      --   Condition 2: latest scan with status = REACHED AT DESTINATION (any activity)
      --   Check (3):   if a first OUT FOR DELIVERY scan is present, OVERRIDE with its location
      --                (OFD always dispatches from the actual destination hub)
      -- Then return the EARLIEST scan at that location as the arrival event.
      LEFT JOIN LATERAL (
        SELECT ts AS reached_at_destination_ts,
               TO_CHAR(ts, 'DD Mon YYYY HH12:MI AM') AS reached_at_destination_time,
               loc AS reached_at_destination_place
        FROM (
          SELECT (s->>'date')::timestamp AS ts,
                 s->>'location'          AS loc
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                 THEN di."latestLogDetails"::jsonb -> 'scans'
                 ELSE '[]'::jsonb END
          ) AS s
          WHERE (s->>'date') IS NOT NULL
        ) AS scans
        WHERE loc = (
          SELECT COALESCE(
            -- CHECK / OVERRIDE: First OUT FOR DELIVERY scan's location (authoritative when present)
            (SELECT s->>'location'
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                    THEN di."latestLogDetails"::jsonb -> 'scans'
                    ELSE '[]'::jsonb END
             ) AS s
             WHERE UPPER(TRIM(s->>'status')) = 'OUT FOR DELIVERY'
                OR LOWER(s->>'activity') LIKE '%out for delivery%'
             ORDER BY (s->>'date')::timestamp ASC LIMIT 1),
            -- CONDITION 1: "Shipment Received at Facility" (prefer REACHED AT DESTINATION status)
            (SELECT s->>'location'
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                    THEN di."latestLogDetails"::jsonb -> 'scans'
                    ELSE '[]'::jsonb END
             ) AS s
             WHERE LOWER(TRIM(s->>'activity')) = 'shipment received at facility'
             ORDER BY
               CASE WHEN UPPER(TRIM(s->>'status')) = 'REACHED AT DESTINATION' THEN 0 ELSE 1 END,
               (s->>'date')::timestamp DESC
             LIMIT 1),
            -- CONDITION 2: latest scan with status = REACHED AT DESTINATION
            (SELECT s->>'location'
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                    THEN di."latestLogDetails"::jsonb -> 'scans'
                    ELSE '[]'::jsonb END
             ) AS s
             WHERE UPPER(TRIM(s->>'status')) = 'REACHED AT DESTINATION'
                OR LOWER(s->>'activity') LIKE '%reached at destination%'
             ORDER BY (s->>'date')::timestamp DESC LIMIT 1)
          )
        )
        ORDER BY ts ASC
        LIMIT 1
      ) rad ON TRUE
      -- Pickup event: earliest "Shipment picked up" scan, falling back to the
      -- first IN TRANSIT scan (the shipment starts moving once picked up).
      LEFT JOIN LATERAL (
        SELECT MIN((s->>'date')::timestamp) AS picked_up_ts
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
               THEN di."latestLogDetails"::jsonb -> 'scans'
               ELSE '[]'::jsonb END
        ) AS s
        WHERE (s->>'date') IS NOT NULL
          AND (LOWER(s->>'activity') LIKE '%picked up%'
               OR UPPER(TRIM(s->>'status')) = 'IN TRANSIT')
      ) pu ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          TO_CHAR((scan->>'date')::timestamp, 'DD Mon YYYY HH12:MI AM') AS latest_scan_time,
          scan->>'location' AS latest_scan_place
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
               THEN di."latestLogDetails"::jsonb -> 'scans'
               ELSE '[]'::jsonb END
        ) AS scan
        WHERE (scan->>'date') IS NOT NULL
        ORDER BY (scan->>'date')::timestamp DESC
        LIMIT 1
      ) latest_scan ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE is_valid_attempt = 1) AS delivery_attempt,
          MAX(CASE WHEN rn_event = 1 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_1_time,
          MAX(CASE WHEN rn_event = 1 THEN attempt_remark END) AS attempt_1_remarks,
          MAX(CASE WHEN rn_event = 2 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_2_time,
          MAX(CASE WHEN rn_event = 2 THEN attempt_remark END) AS attempt_2_remarks,
          MAX(CASE WHEN rn_event = 3 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_3_time,
          MAX(CASE WHEN rn_event = 3 THEN attempt_remark END) AS attempt_3_remarks,
          MAX(CASE WHEN rn_event = 4 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_4_time,
          MAX(CASE WHEN rn_event = 4 THEN attempt_remark END) AS attempt_4_remarks,
          MAX(CASE WHEN rn_event = 5 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_5_time,
          MAX(CASE WHEN rn_event = 5 THEN attempt_remark END) AS attempt_5_remarks,
          MAX(CASE WHEN rn_event = 6 THEN TO_CHAR(scan_date, 'DD Mon YYYY HH12:MI AM') END) AS attempt_6_time,
          MAX(CASE WHEN rn_event = 6 THEN attempt_remark END) AS attempt_6_remarks
        FROM (
          SELECT
            scan_date,
            attempt_remark,
            is_valid_attempt,
            is_attempt_event,
            CASE WHEN is_attempt_event = 1
              THEN ROW_NUMBER() OVER (PARTITION BY is_attempt_event ORDER BY scan_date ASC)
              ELSE NULL
            END AS rn_event
          FROM (
            SELECT DISTINCT ON (scan_date::date, attempt_remark)
              scan_date,
              attempt_remark,
              is_valid_attempt,
              is_attempt_event
            FROM (
              SELECT
                (scan->>'date')::timestamp AS scan_date,
                scan->>'activity' AS attempt_remark,
                CASE
                  WHEN (
                    (
                      LOWER(scan->>'activity') LIKE '%attempt%'
                      OR LOWER(scan->>'activity') LIKE '%not delivered%'
                      OR LOWER(scan->>'activity') LIKE '%delivery failed%'
                      OR LOWER(scan->>'activity') LIKE '%customer not%'
                      OR LOWER(scan->>'activity') LIKE '%refused%'
                      OR LOWER(scan->>'activity') LIKE '%unavailable%'
                      OR LOWER(scan->>'activity') LIKE '%no response%'
                    )
                    AND NOT (
                      LOWER(scan->>'activity') LIKE '%not attempted%'
                      OR LOWER(scan->>'activity') LIKE '%maximum attempt%'
                      OR LOWER(scan->>'activity') LIKE '%self collect%'
                    )
                  )
                  OR LOWER(scan->>'activity') LIKE '%delivery rescheduled by customer%'
                  OR TRIM(scan->>'activity') ILIKE ANY (ARRAY[
                    'Damaged shipment to be attempted',
                    'Office/Institute closed',
                    'Payment Mode / Amt Dispute',
                    'Incomplete address & contact details',
                    'Returned as per Client Instructions',
                    'Recipient wants delivery at a different address',
                    'Consignee to collect from branch'
                  ])
                  THEN 1
                  ELSE 0
                END AS is_valid_attempt,
                CASE
                  WHEN (
                    (
                      LOWER(scan->>'activity') LIKE '%attempt%'
                      OR LOWER(scan->>'activity') LIKE '%not delivered%'
                      OR LOWER(scan->>'activity') LIKE '%delivery failed%'
                      OR LOWER(scan->>'activity') LIKE '%customer not%'
                      OR LOWER(scan->>'activity') LIKE '%refused%'
                      OR LOWER(scan->>'activity') LIKE '%unavailable%'
                      OR LOWER(scan->>'activity') LIKE '%no response%'
                    )
                    AND NOT (
                      LOWER(scan->>'activity') LIKE '%not attempted%'
                    )
                  )
                  OR LOWER(scan->>'activity') LIKE '%delivery rescheduled by customer%'
                  OR TRIM(scan->>'activity') ILIKE ANY (ARRAY[
                    'Damaged shipment to be attempted',
                    'Office/Institute closed',
                    'Payment Mode / Amt Dispute',
                    'Incomplete address & contact details',
                    'Returned as per Client Instructions',
                    'Recipient wants delivery at a different address',
                    'Consignee to collect from branch',
                    'Consignee will collect from branch',
                    'Maximum attempts reached for self collect'
                  ])
                  THEN 1
                  ELSE 0
                END AS is_attempt_event
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(di."latestLogDetails"::jsonb -> 'scans') = 'array'
                     THEN di."latestLogDetails"::jsonb -> 'scans'
                     ELSE '[]'::jsonb END
              ) AS scan
              WHERE
                (
                  LOWER(scan->>'activity') SIMILAR TO
                    '%(attempt|not delivered|not attempted|delivery failed|customer not|refused|unavailable|no response)%'
                  OR LOWER(scan->>'activity') LIKE '%delivery rescheduled by customer%'
                  OR TRIM(scan->>'activity') ILIKE ANY (ARRAY[
                    'Damaged shipment to be attempted',
                    'Office/Institute closed',
                    'Payment Mode / Amt Dispute',
                    'Incomplete address & contact details',
                    'Returned as per Client Instructions',
                    'Recipient wants delivery at a different address',
                    'Consignee to collect from branch',
                    'Consignee will collect from branch',
                    'Maximum attempts reached for self collect'
                  ])
                )
                AND NOT (
                  TRIM(scan->>'activity') ILIKE ANY (ARRAY[
                    'Shipper unavailable',
                    'No client instructions to Reattempt',
                    'Reattempt as per Client''s instruction',
                    'Reattempt - As per NDR instructions',
                    'Maximum attempts reached'
                  ])
                )
            ) raw_scans
            ORDER BY scan_date::date, attempt_remark, scan_date
          ) deduped
        ) final_scans
      ) attempt_data ON TRUE
      LEFT JOIN LATERAL (
        SELECT "paidAmount", "appliedWalletAmount"
        FROM "purchaseOrder"."purchaseOrderPayment"
        WHERE "purchaseOrderId" = po."id"
          AND "status" = 'COMPLETED'
          AND "event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
        ORDER BY "created_at" DESC
        LIMIT 1
      ) pop ON TRUE

      JOIN "users"."buyer" b
        ON b."id" = po."buyerId"
      JOIN "users"."seller" s
        ON s."id" = po."sellerId"
      WHERE
        po."isTest" = FALSE
        AND po."isFalseOrder" = FALSE
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND di."isTest" = FALSE
        AND di."id" = di_latest."id"
        AND di."deliveryPartnerId" = 'DELHIVERY'
        AND di."status" IN (
          'REACHED AT DESTINATION',
          'OUT FOR DELIVERY',
          'UNDELIVERED',
          'RTO IN TRANSIT',
          'RTO UNDELIVERED',
          'RTO NDR',
          'RTO PROCESSING',
          'LOST'
        )
      ORDER BY po."markedPendingTime" DESC;
    `;
    const rows = await query<Row>(sql, []);

    const data = rows.map((r) => ({
      orderDateTime: r.order_datetime,
      itlDateTime: r.itl_datetime,
      reachedAtDestinationTime: r.reached_at_destination_time,
      reachedAtDestinationPlace: r.reached_at_destination_place,
      pickedUpTime: r.picked_up_time,
      pickupToHubDays: r.pickup_to_hub_days != null ? Number(r.pickup_to_hub_days) : null,
      daysSinceReachedAtDestination: r.days_since_reached_at_destination != null ? Number(r.days_since_reached_at_destination) : null,
      latestScanTime: r.latest_scan_time,
      latestScanPlace: r.latest_scan_place,
      stillInDestinationHub: r.still_in_destination_hub,
      poNumber: r.po_number,
      poStatus: r.po_status,
      orderValue: r.order_value != null ? parseFloat(r.order_value) : 0,
      couponValue: r.coupon_value != null ? parseFloat(r.coupon_value) : 0,
      paymentMode: r.payment_mode,
      brandName: r.brand_name,
      shipmentStatus: r.shipment_status,
      deliveryAttempt: r.delivery_attempt != null ? parseInt(r.delivery_attempt) : 0,
      attempts: [1, 2, 3, 4, 5, 6].map((i) => ({
        time: (r as unknown as Record<string, string | null>)[`attempt_${i}_time`] ?? null,
        remarks: (r as unknown as Record<string, string | null>)[`attempt_${i}_remarks`] ?? null,
      })),
      awbNumber: r.awb_number,
      logisticName: r.logistic_name,
      codCollect: r.cod_collect != null ? parseFloat(r.cod_collect) : 0,
      volumetricWeight: r.volumetric_weight != null ? parseFloat(r.volumetric_weight) : null,
      absoluteWeight: r.absolute_weight != null ? parseFloat(r.absolute_weight) : null,
      chargeableWeight: r.chargeable_weight != null ? parseFloat(r.chargeable_weight) : null,
      buyerName: r.buyer_name,
      buyerBusinessName: r.buyer_business_name,
      buyerPhone: r.buyer_phone,
      buyerFullAddress: r.buyer_full_address,
      buyerLongitude: r.buyer_longitude != null ? parseFloat(r.buyer_longitude) : null,
      buyerLatitude: r.buyer_latitude != null ? parseFloat(r.buyer_latitude) : null,
      paidAmount: r.paid_amount != null ? parseFloat(r.paid_amount) : null,
      appliedWalletAmount: r.applied_wallet_amount != null ? parseFloat(r.applied_wallet_amount) : null,
    }));

    // Pre-compute filter facets so the UI can build dropdowns without re-scanning.
    const facetSet = (key: 'shipmentStatus' | 'brandName' | 'paymentMode' | 'logisticName') => {
      const s = new Set<string>();
      for (const d of data) {
        const v = d[key];
        if (v) s.add(v);
      }
      return Array.from(s).sort();
    };

    return NextResponse.json({
      data,
      count: data.length,
      facets: {
        shipmentStatus: facetSet('shipmentStatus'),
        brand: facetSet('brandName'),
        paymentMode: facetSet('paymentMode'),
        logistic: facetSet('logisticName'),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
