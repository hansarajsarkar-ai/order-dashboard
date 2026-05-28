import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

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
  codAmountToBeCollected: string | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
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
  category: string;
  daysInProgress: string;
  bucket: string;
}

const BUCKET_FILTERS: Record<string, string> = {
  '1-2 days': `"bucket" = '1-2 days'`,
  '2-3 days': `"bucket" = '2-3 days'`,
  '3+ days':  `"bucket" = '3+ days'`,
  'all':      `"bucket" <> '<1 day'`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  const bucket = searchParams.get('bucket') || 'all';

  const bucketClause = BUCKET_FILTERS[bucket] || BUCKET_FILTERS['all'];

  try {
    const params: (string | number)[] = [];
    let brandClause = '';
    if (brand) {
      params.push(brand);
      brandClause = `AND TRIM(SPLIT_PART(s."businessName", '-', 1)) = $${params.length}`;
    }

    const sql = `
      WITH base AS (
        SELECT DISTINCT
          po."poNumber"::text AS "poNumber",
          po."markedPendingTime"    AS "MarkedpendingTime",
          po."markedInProgressTime" AS "markedInProgressTime",
          pop."created_at"          AS "paymentDate",
          pop."event"               AS "paymentEvent",
          s."phone"                 AS "sellerPhone",
          s."businessName"          AS "sellerBusinessName",
          b."phone"                 AS "buyerPhone",
          b."businessName"          AS "buyerBusinessName",
          pop."paidAmount"::text    AS "paidAmount",
          po."amount"::text         AS "poAmount",
          po."appliedOfferDiscount"::text AS "CoupanAmount",
          po."status"               AS "orderStatus",
          COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0)::text AS "discountBySeller",
          COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0)::text AS "PaymentOptionDiscountByBadho",
          pop."appliedWalletAmount"::text AS "appliedWalletAmount",
          po."paymentInfo"->>'option' AS "PaymentOption",
          dv."trackingInfo"->>'awbNumber'   AS "awbNumber",
          dv."trackingInfo"->>'courierName' AS "courierName",
          dv."status"               AS "deliveryStatus",
          pf."markedStatusInitiatedTime"  AS "RefundIntiatedTime",
          pf."markedStatusCompletedTime"  AS "RefundCompletedTime",
          dv."codAmountToBeCollected"::text AS "codAmountToBeCollected",
          CASE WHEN dv."trackingInfo"->>'awbNumber' IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
          po."rejectReason",
          po."rejectedBy",
          po."reasonAddedByBadhoTeam",
          po."markedInProgressTime" AS "statusMarkedTime",
          EXTRACT(EPOCH FROM (NOW() - po."markedPendingTime"))::float AS "statusDurationSec",
          b."addressLine1" AS buyer_address_line1,
          b."landmark"     AS buyer_landmark,
          b."pincode"      AS buyer_pincode,
          b."city"         AS buyer_city,
          b."district"     AS buyer_district,
          b."state"        AS buyer_state,
          s."addressLine1" AS seller_address_line1,
          s."city"         AS seller_city,
          s."state"        AS seller_state,
          po."created_at"  AS created_at,
          GREATEST(
            EXTRACT(EPOCH FROM (NOW() - po."markedInProgressTime"))
            - COALESCE((
                SELECT SUM(EXTRACT(EPOCH FROM (
                  LEAST(NOW(),                          d::timestamptz + INTERVAL '1 day')
                  - GREATEST(po."markedInProgressTime", d::timestamptz)
                )))
                FROM generate_series(
                  po."markedInProgressTime"::date,
                  NOW()::date,
                  INTERVAL '1 day'
                ) AS d
                WHERE EXTRACT(DOW FROM d) = 0
              ), 0),
            0
          )::numeric / 86400.0 AS "daysInProgress"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN LATERAL (
          SELECT d."id"
          FROM "deliveries"."intercityDelivery" d
          WHERE d."purchaseOrderId" = po."id"
            AND d."isTest" = FALSE
          ORDER BY d."created_at" DESC
          LIMIT 1
        ) di_latest ON TRUE
        JOIN "deliveries"."intercityDelivery" dv
          ON dv."id" = di_latest."id"
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        LEFT JOIN "payments"."paymentRefundRecord" pf
               ON pf."purchaseOrderId" = po."id"
              AND pf."status" = 'COMPLETED'
        LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
               ON pop."purchaseOrderId" = po."id"
              AND pop."status" = 'COMPLETED'
              AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
        WHERE
              po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND po."status"               = 'INPROGRESS'
          AND po."markedInProgressTime" IS NOT NULL
          ${brandClause}
      ),
      dedup AS (
        SELECT DISTINCT ON ("poNumber") *
        FROM base
        ORDER BY "poNumber",
                 CASE "paymentEvent" WHEN 'FULL_ADVANCE' THEN 1 WHEN 'PARTIAL_ADVANCE' THEN 2 ELSE 3 END,
                 "MarkedpendingTime" DESC
      ),
      labeled AS (
        SELECT
          *,
          CASE
            WHEN "daysInProgress" < 1 THEN '<1 day'
            WHEN "daysInProgress" < 2 THEN '1-2 days'
            WHEN "daysInProgress" < 3 THEN '2-3 days'
            ELSE '3+ days'
          END AS "bucket",
          CASE
            WHEN "paymentEvent" = 'FULL_ADVANCE'                                THEN 'Fully_Paid'
            WHEN "paymentEvent" = 'PARTIAL_ADVANCE'                             THEN 'Partially_Paid'
            WHEN "PaymentOption" ILIKE '%cod%'
              OR COALESCE("codAmountToBeCollected"::float, 0) > 0               THEN 'COD'
            ELSE 'Other'
          END AS "category"
        FROM dedup
      )
      SELECT *
      FROM labeled
      WHERE ${bucketClause}
      ORDER BY "markedInProgressTime" DESC
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const num = (v: string | null) => (v == null ? null : parseFloat(v));

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
      paidAmount: num(r.paidAmount),
      poAmount: num(r.poAmount),
      CoupanAmount: num(r.CoupanAmount),
      orderStatus: r.orderStatus,
      discountBySeller: num(r.discountBySeller) ?? 0,
      PaymentOptionDiscountByBadho: num(r.PaymentOptionDiscountByBadho) ?? 0,
      appliedWalletAmount: num(r.appliedWalletAmount),
      PaymentOption: r.PaymentOption,
      awbNumber: r.awbNumber,
      courierName: r.courierName,
      deliveryStatus: r.deliveryStatus,
      RefundIntiatedTime: r.RefundIntiatedTime,
      RefundCompletedTime: r.RefundCompletedTime,
      codAmountToBeCollected: num(r.codAmountToBeCollected),
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
      statusMarkedTime: r.statusMarkedTime,
      statusDurationSec: r.statusDurationSec != null ? Number(r.statusDurationSec) : null,
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
      createdAt: r.created_at,
      category: r.category,
      slaBreachAt: r.markedInProgressTime || '',
      daysInProgress: r.daysInProgress != null ? parseFloat(r.daysInProgress) : null,
      bucket: r.bucket,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      brand: brand || null,
      bucket,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
