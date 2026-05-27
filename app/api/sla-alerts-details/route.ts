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
  sla_breach_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category'); // 'Fully_Paid' | 'Partially_Paid' | 'COD' | 'Other' | 'all'
  const sellerBusinessName = searchParams.get('sellerBusinessName'); // optional brand filter

  try {
    const params: (string | number)[] = [];
    const filterClauses: string[] = [];
    if (category && category !== 'all') {
      params.push(category);
      filterClauses.push(`"category" = $${params.length}`);
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
          po."markedInProgressTime" AS "markedInProgressTime",
          pop."created_at"       AS "paymentDate",
          pop."event"            AS "paymentEvent",
          s."phone"              AS "sellerPhone",
          s."businessName"       AS "sellerBusinessName",
          b."phone"              AS "buyerPhone",
          b."businessName"       AS "buyerBusinessName",
          pop."paidAmount"::text AS "paidAmount",
          po."amount"::text      AS "poAmount",
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
          dv."codAmountToBeCollected"::text     AS "codAmountToBeCollected",
          CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
          po."rejectReason",
          po."rejectedBy",
          po."reasonAddedByBadhoTeam",
          b."addressLine1" AS buyer_address_line1,
          b."landmark"     AS buyer_landmark,
          b."pincode"      AS buyer_pincode,
          b."city"         AS buyer_city,
          b."district"     AS buyer_district,
          b."state"        AS buyer_state,
          s."addressLine1" AS seller_address_line1,
          s."city"         AS seller_city,
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
        WHERE NOW() >= "sla_breach_at"
      ),
      categorized AS (
        SELECT
          *,
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
      codAmountToBeCollected: r.codAmountToBeCollected != null ? parseFloat(r.codAmountToBeCollected) : null,
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
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
