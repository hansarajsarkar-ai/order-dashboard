import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  poNumber: string;
  MarkedpendingTime: string | null;
  markedInProgressTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: string | null;
  poAmount: string | null;
  CoupanAmount: string | null;
  orderStatus: string | null;
  discountBySeller: string | null;
  PaymentOptionDiscountByBadho: string | null;
  appliedWalletAmount: string | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: string | null;
  codAmountToBeCollected: string | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
  orderAgeingSec: number | null;
  daysPassedExclSundays: string | null;
  markedDispatchedTime: string | null;
  brandSpanSec: number | null;
  brandSpanOngoing: boolean;
  pickupSpanSec: number | null;
  pickupSpanOngoing: boolean;
  buyer_address_line1: string | null;
  buyer_landmark: string | null;
  buyer_pincode: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_state: string | null;
  seller_address_line1: string | null;
  seller_landmark: string | null;
  seller_pincode: string | null;
  seller_city: string | null;
  seller_district: string | null;
  seller_state: string | null;
  created_at: string;
  category: string;
  sla_breach_at: string;
}

// Elapsed seconds between two timestamptz expressions with Sundays excluded,
// measured on the IST (Asia/Kolkata) calendar. `startTs`/`endTs` are raw SQL.
const sundayExclSec = (startTs: string, endTs: string) => `
  GREATEST(
    EXTRACT(EPOCH FROM (((${endTs}) AT TIME ZONE 'Asia/Kolkata') - ((${startTs}) AT TIME ZONE 'Asia/Kolkata')))
    - COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (
          LEAST((${endTs}) AT TIME ZONE 'Asia/Kolkata', d + INTERVAL '1 day')
          - GREATEST((${startTs}) AT TIME ZONE 'Asia/Kolkata', d)
        )))
        FROM generate_series(
          (((${startTs}) AT TIME ZONE 'Asia/Kolkata')::date),
          (((${endTs}) AT TIME ZONE 'Asia/Kolkata')::date),
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d) = 0
      ), 0),
    0
  )::float`;

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category'); // 'Fully_Paid' | 'Partially_Paid' | 'COD' | 'Other' | 'all'
  const sellerBusinessName = searchParams.get('sellerBusinessName'); // optional exact seller filter
  const brand = searchParams.get('brand'); // optional normalized-brand filter (matches the brand pivot)

  try {
    const params: (string | number)[] = [];
    const filterClauses: string[] = [];
    if (category && category !== 'all') {
      params.push(category);
      filterClauses.push(`"category" = $${params.length}`);
    }
    if (brand) {
      params.push(brand);
      filterClauses.push(`"brand" = $${params.length}`);
    }
    if (sellerBusinessName) {
      params.push(sellerBusinessName);
      filterClauses.push(`"sellerBusinessName" = $${params.length}`);
    }
    const categoryFilter = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

    const sql = `
      WITH base AS (
        SELECT DISTINCT
          po."poNumber"::text AS "poNumber",
          po."markedPendingTime" AS "MarkedpendingTime",
          ROUND(
            GREATEST(
              EXTRACT(EPOCH FROM (
                (NOW() AT TIME ZONE 'Asia/Kolkata')
                - (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')
              ))
              - COALESCE((
                  SELECT SUM(EXTRACT(EPOCH FROM (
                    LEAST(NOW() AT TIME ZONE 'Asia/Kolkata',           d + INTERVAL '1 day')
                    - GREATEST(po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata', d)
                  )))
                  FROM generate_series(
                    (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')::date,
                    (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
                    INTERVAL '1 day'
                  ) AS d
                  WHERE EXTRACT(DOW FROM d) = 0
                ), 0),
              0
            )::numeric / 86400.0,
            2
          )                                  AS "daysPassedExclSundays",
          -- Order ageing since placed, INCLUDING Sundays (raw elapsed seconds).
          -- Brand SLA ageing (excl. Sundays) is derived in JS from
          -- daysPassedExclSundays; Delhivery pickup ageing is null here (PENDING).
          EXTRACT(EPOCH FROM (NOW() - po."markedPendingTime"))::float AS "orderAgeingSec",
          po."markedInProgressTime" AS "markedInProgressTime",
          po."markedDispatchedTime" AS "markedDispatchedTime",
          -- Brand SLA span: PENDING -> INPROGRESS, Sundays excluded (IST). These rows are
          -- still PENDING, so it is ongoing (measured to NOW) — i.e. how long the brand
          -- has sat on the order without accepting it.
          ${sundayExclSec('po."markedPendingTime"', 'COALESCE(po."markedInProgressTime", NOW())')} AS "brandSpanSec",
          (po."markedInProgressTime" IS NULL) AS "brandSpanOngoing",
          -- Pickup SLA span: INPROGRESS -> DISPATCHED, Sundays excluded (IST). NULL here
          -- since the order has not yet reached INPROGRESS.
          CASE WHEN po."markedInProgressTime" IS NULL THEN NULL
               ELSE ${sundayExclSec('po."markedInProgressTime"', 'COALESCE(po."markedDispatchedTime", NOW())')}
          END AS "pickupSpanSec",
          (po."markedInProgressTime" IS NOT NULL AND po."markedDispatchedTime" IS NULL) AS "pickupSpanOngoing",
          pop."created_at"       AS "paymentDate",
          pop."event"            AS "paymentEvent",
          s."phone"              AS "sellerPhone",
          s."businessName"       AS "sellerBusinessName",
          b."phone"              AS "buyerPhone",
          b."businessName"       AS "buyerBusinessName",
          pop."paidAmount"::text AS "paidAmount",
          (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)::text      AS "poAmount",
          po."appliedOfferDiscount"::text AS "CoupanAmount",
          po."status"            AS "orderStatus",
          COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0)::text AS "discountBySeller",
          COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0)::text AS "PaymentOptionDiscountByBadho",
          pop."appliedWalletAmount"::text AS "appliedWalletAmount",
          po."paymentInfo"->>'option' AS "PaymentOption",
          dv."trackingInfo"->>'awbNumber'   AS "awbNumber",
          dv."trackingInfo"->>'courierName' AS "courierName",
          dv."status"            AS "deliveryStatus",
          pf."markedStatusInitiatedTime"  AS "RefundIntiatedTime",
          pf."markedStatusCompletedTime"  AS "RefundCompletedTime",
          pf."refundAmount"::text         AS "RefundAmount",
          dv."codAmountToBeCollected"::text     AS "codAmountToBeCollected",
          CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
          po."rejectReason",
          po."rejectedBy",
          po."reasonAddedByBadhoTeam",
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
          END                                                                AS "statusMarkedTime",
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
          b."addressLine1" AS buyer_address_line1,
          b."landmark"     AS buyer_landmark,
          b."pincode"      AS buyer_pincode,
          b."city"         AS buyer_city,
          b."district"     AS buyer_district,
          b."state"        AS buyer_state,
          s."addressLine1" AS seller_address_line1,
          s."landmark"     AS seller_landmark,
          s."pincode"      AS seller_pincode,
          s."city"         AS seller_city,
          s."district"     AS seller_district,
          s."state"        AS seller_state,
          po."created_at"  AS created_at
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        LEFT JOIN LATERAL (
          SELECT di."id" AS "deliveryId", di."trackingInfo", di."status", di."codAmountToBeCollected"
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
        WHERE s."isD2RBrandSeller" = TRUE
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND po."isTest"          = FALSE
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."isFalseOrder"    = FALSE
          AND po."status"          = 'PENDING'
      ),
      dedup AS (
        SELECT DISTINCT ON ("poNumber") *
        FROM base
        WHERE "MarkedpendingTime" IS NOT NULL
        ORDER BY "poNumber",
                 CASE "paymentEvent" WHEN 'FULL_ADVANCE' THEN 1 WHEN 'PARTIAL_ADVANCE' THEN 2 ELSE 3 END,
                 "MarkedpendingTime" DESC
      ),
      sla_step1 AS (
        SELECT
          *,
          "MarkedpendingTime"
            + INTERVAL '1 day'
            + CASE WHEN EXTRACT(DOW FROM "MarkedpendingTime" + INTERVAL '1 day') = 0
                   THEN INTERVAL '1 day' ELSE INTERVAL '0' END
            AS "sla_after_1wd"
        FROM dedup
      ),
      sla_deadline AS (
        SELECT
          *,
          "sla_after_1wd"
            + INTERVAL '1 day'
            + CASE WHEN EXTRACT(DOW FROM "sla_after_1wd" + INTERVAL '1 day') = 0
                   THEN INTERVAL '1 day' ELSE INTERVAL '0' END
            AS "sla_breach_at"
        FROM sla_step1
      ),
      breached AS (
        SELECT *
        FROM sla_deadline
        WHERE "daysPassedExclSundays" > 2
      ),
      categorized AS (
        SELECT
          *,
          CASE
            WHEN LOWER(REPLACE(TRIM(SPLIT_PART("sellerBusinessName", '-', 1)), ' ', '')) = 'chukde'
              THEN 'ChukDe'
            ELSE TRIM(SPLIT_PART("sellerBusinessName", '-', 1))
          END                                          AS "brand",
          CASE
            WHEN "paymentEvent" = 'FULL_ADVANCE'                                THEN 'Fully_Paid'
            WHEN "paymentEvent" = 'PARTIAL_ADVANCE'                             THEN 'Partially_Paid'
            WHEN "PaymentOption" ILIKE '%cod%'
              OR COALESCE("codAmountToBeCollected"::float, 0) > 0               THEN 'COD'
            ELSE 'Other'
          END AS "category"
        FROM breached
      )
      SELECT *
      FROM categorized
      ${categoryFilter}
      ORDER BY "MarkedpendingTime" DESC
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poNumber: r.poNumber,
      MarkedpendingTime: r.MarkedpendingTime,
      markedInProgressTime: r.markedInProgressTime,
      paymentDate: r.paymentDate,
      paymentEvent: r.paymentEvent,
      sellerPhone: r.sellerPhone,
      sellerBusinessName: r.sellerBusinessName,
      buyerPhone: r.buyerPhone,
      buyerBusinessName: r.buyerBusinessName,
      paidAmount: r.paidAmount != null ? parseFloat(r.paidAmount) : null,
      poAmount: r.poAmount != null ? parseFloat(r.poAmount) : null,
      CoupanAmount: r.CoupanAmount != null ? parseFloat(r.CoupanAmount) : null,
      orderStatus: r.orderStatus,
      discountBySeller: r.discountBySeller != null ? parseFloat(r.discountBySeller) : 0,
      PaymentOptionDiscountByBadho: r.PaymentOptionDiscountByBadho != null ? parseFloat(r.PaymentOptionDiscountByBadho) : 0,
      appliedWalletAmount: r.appliedWalletAmount != null ? parseFloat(r.appliedWalletAmount) : null,
      PaymentOption: r.PaymentOption,
      awbNumber: r.awbNumber,
      courierName: r.courierName,
      deliveryStatus: r.deliveryStatus,
      RefundIntiatedTime: r.RefundIntiatedTime,
      RefundCompletedTime: r.RefundCompletedTime,
      RefundAmount: r.RefundAmount != null ? parseFloat(r.RefundAmount) : null,
      codAmountToBeCollected: r.codAmountToBeCollected != null ? parseFloat(r.codAmountToBeCollected) : null,
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
      statusMarkedTime: r.statusMarkedTime,
      statusDurationSec: r.statusDurationSec != null ? Number(r.statusDurationSec) : null,
      orderAgeingSec: r.orderAgeingSec != null ? Number(r.orderAgeingSec) : null,
      markedDispatchedTime: r.markedDispatchedTime,
      brandSpanSec: r.brandSpanSec != null ? Number(r.brandSpanSec) : null,
      brandSpanOngoing: r.brandSpanOngoing === true,
      pickupSpanSec: r.pickupSpanSec != null ? Number(r.pickupSpanSec) : null,
      pickupSpanOngoing: r.pickupSpanOngoing === true,
      buyerAddressLine1: r.buyer_address_line1,
      buyerLandmark: r.buyer_landmark,
      buyerPincode: r.buyer_pincode,
      buyerCity: r.buyer_city,
      buyerDistrict: r.buyer_district,
      buyerState: r.buyer_state,
      buyerFullAddress: [
        r.buyer_address_line1,
        r.buyer_landmark,
        r.buyer_pincode,
        r.buyer_city,
        r.buyer_district,
        r.buyer_state,
      ].filter((v) => v != null && String(v).trim() !== '').join('_'),
      sellerAddressLine1: r.seller_address_line1,
      sellerCity: r.seller_city,
      sellerState: r.seller_state,
      sellerFullAddress: [
        r.seller_address_line1,
        r.seller_landmark,
        r.seller_pincode,
        r.seller_city,
        r.seller_district,
        r.seller_state,
      ].filter((v) => v != null && String(v).trim() !== '').join(', ') || null,
      createdAt: r.created_at,
      category: r.category,
      slaBreachAt: r.sla_breach_at,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      category: category || 'all',
      sellerBusinessName: sellerBusinessName || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
