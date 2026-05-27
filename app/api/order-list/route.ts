import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  poNumber: string;
  MarkedpendingTime: string | null;
  paymentDate: string | null;
  paymentEvent: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  paidAmount: number | null;
  poAmount: number | null;
  CoupanAmount: number | null;
  orderStatus: string;
  discountBySeller: number;
  PaymentOptionDiscountByBadho: number;
  appliedWalletAmount: number | null;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  codAmountToBeCollected: number | null;
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
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const monthParam = searchParams.get('month');
  const status = searchParams.get('status');
  const deliveryStatusParam = searchParams.get('deliveryStatus'); // value | "__NULL__" | null

  if (!status) {
    return NextResponse.json({ error: 'status parameter required' }, { status: 400 });
  }

  try {
    const params: (string | number)[] = [year, status];
    let monthFilter = '';
    if (monthParam) {
      const month = parseInt(monthParam);
      if (!Number.isNaN(month) && month >= 1 && month <= 12) {
        params.push(month);
        monthFilter = ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
      }
    }

    let deliveryFilter = '';
    if (deliveryStatusParam !== null) {
      if (deliveryStatusParam === '__NULL__') {
        deliveryFilter = ` AND po."deliveryStatus" IS NULL`;
      } else {
        params.push(deliveryStatusParam);
        deliveryFilter = ` AND po."deliveryStatus" = $${params.length}`;
      }
    }

    const sql = `
      SELECT DISTINCT
        po."poNumber"::text AS "poNumber",
        po."markedPendingTime"::date AS "MarkedpendingTime",
        pop."created_at" AS "paymentDate",
        pop."event" AS "paymentEvent",
        s."phone" AS "sellerPhone",
        s."businessName" AS "sellerBusinessName",
        b."phone" AS "buyerPhone",
        b."businessName" AS "buyerBusinessName",
        pop."paidAmount" AS "paidAmount",
        po."amount" AS "poAmount",
        po."appliedOfferDiscount" AS "CoupanAmount",
        po."status" AS "orderStatus",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0) AS "discountBySeller",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0) AS "PaymentOptionDiscountByBadho",
        pop."appliedWalletAmount",
        po."paymentInfo"->>'option' AS "PaymentOption",
        dv."trackingInfo"->>'awbNumber' AS "awbNumber",
        dv."trackingInfo"->>'courierName' AS "courierName",
        dv."status" AS "deliveryStatus",
        pf."markedStatusInitiatedTime" AS "RefundIntiatedTime",
        pf."markedStatusCompletedTime" AS "RefundCompletedTime",
        dv."codAmountToBeCollected" AS "codAmountToBeCollected",
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
        po."rejectReason",
        po."rejectedBy" AS "rejectedBy",
        po."reasonAddedByBadhoTeam" AS "reasonAddedByBadhoTeam",
        b."addressLine1" AS buyer_address_line1,
        b."landmark" AS buyer_landmark,
        b."pincode" AS buyer_pincode,
        b."city" AS buyer_city,
        b."district" AS buyer_district,
        b."state" AS buyer_state,
        s."addressLine1" AS seller_address_line1,
        s."city" AS seller_city,
        s."state" AS seller_state,
        po."created_at" AS created_at
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId",
               di."trackingInfo",
               di."status",
               di."codAmountToBeCollected"
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
        AND po."status" != 'DRAFT'
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        AND po."status" = $2
        ${monthFilter}
        ${deliveryFilter}
      ORDER BY "MarkedpendingTime" DESC NULLS LAST
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poNumber: r.poNumber,
      MarkedpendingTime: r.MarkedpendingTime,
      paymentDate: r.paymentDate,
      paymentEvent: r.paymentEvent,
      sellerPhone: r.sellerPhone,
      sellerBusinessName: r.sellerBusinessName,
      buyerPhone: r.buyerPhone,
      buyerBusinessName: r.buyerBusinessName,
      paidAmount: r.paidAmount,
      poAmount: r.poAmount,
      CoupanAmount: r.CoupanAmount,
      orderStatus: r.orderStatus,
      status: r.orderStatus,
      discountBySeller: r.discountBySeller,
      PaymentOptionDiscountByBadho: r.PaymentOptionDiscountByBadho,
      appliedWalletAmount: r.appliedWalletAmount,
      PaymentOption: r.PaymentOption,
      awbNumber: r.awbNumber,
      courierName: r.courierName,
      deliveryStatus: r.deliveryStatus,
      RefundIntiatedTime: r.RefundIntiatedTime,
      RefundCompletedTime: r.RefundCompletedTime,
      codAmountToBeCollected: r.codAmountToBeCollected,
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
      amount: r.poAmount != null ? Number(r.poAmount) : 0,
      buyerAddress: [r.buyer_address_line1, r.buyer_city, r.buyer_state].filter(Boolean).join(', '),
      buyerFullAddress: [
        r.buyer_address_line1,
        r.buyer_landmark,
        r.buyer_pincode,
        r.buyer_city,
        r.buyer_district,
        r.buyer_state,
      ].filter((v) => v != null && String(v).trim() !== '').join(', '),
      buyerState: r.buyer_state,
      sellerAddress: [r.seller_address_line1, r.seller_city, r.seller_state].filter(Boolean).join(', '),
      markedPendingTime: r.MarkedpendingTime,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      year,
      month: monthParam ? parseInt(monthParam) : null,
      status,
      deliveryStatus: deliveryStatusParam,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
