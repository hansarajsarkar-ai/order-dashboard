import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Look up a SINGLE purchase order by its exact poNumber for the
 * Order Rejected/Cancelled dashboard. The dashboard only renders rows
 * once the user searches a PO (acts like an index lookup), so this route
 * intentionally requires an exact numeric poNumber and never lists.
 *
 * Returns the financial breakdown shown in the table (mirrors the columns
 * of the order-dashboard "COMPLETED" view: item total, gross amount,
 * item discount, coupon, applied wallet, seller discount, payment-option
 * Badho discount) plus enough state (status, cancel/reject reason) for the
 * action buttons to decide what's allowed.
 */

interface Row {
  poNumber: string;
  markedPendingTime: string | null;
  status: string;
  pushedStatus: string;
  awbNumber: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  itemTotal: string | null;
  grossAmount: string | null;
  itemDiscount: string | null;
  couponAmount: string | null;
  appliedWalletAmount: string | null;
  sellerDiscount: number | null;
  paymentOptionBadhoDiscount: number | null;
  paymentOption: string | null;
  cancelReason: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  markedCancelledTime: string | null;
  markedRejectedTime: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();

  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  try {
    const rows = await query<Row>(
      `
      SELECT
        po."poNumber"::text                        AS "poNumber",
        po."markedPendingTime"                     AS "markedPendingTime",
        po."status"                                AS "status",
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
        dv."trackingInfo"->>'awbNumber'            AS "awbNumber",
        s."phone"                                  AS "sellerPhone",
        s."businessName"                           AS "sellerBusinessName",
        b."phone"                                  AS "buyerPhone",
        b."businessName"                           AS "buyerBusinessName",
        po."amount"::text                          AS "itemTotal",
        (COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0))::text AS "grossAmount",
        po."totalDiscount"::text                   AS "itemDiscount",
        po."appliedOfferDiscount"::text            AS "couponAmount",
        pop."appliedWalletAmount"::text            AS "appliedWalletAmount",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0)  AS "sellerDiscount",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0)  AS "paymentOptionBadhoDiscount",
        po."paymentInfo"->>'option'                AS "paymentOption",
        po."cancelReason"                          AS "cancelReason",
        po."rejectReason"                          AS "rejectReason",
        po."rejectedBy"                            AS "rejectedBy",
        po."markedCancelledTime"                   AS "markedCancelledTime",
        po."markedRejectedTime"                    AS "markedRejectedTime"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId", di."trackingInfo"
        FROM "deliveries"."intercityDelivery" di
        WHERE di."purchaseOrderId" = po."id"
        ORDER BY di."created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
             ON pop."purchaseOrderId" = po."id"
            AND pop."status" = 'COMPLETED'
            AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      WHERE po."poNumber"::text = $1
        AND po."status" <> 'DRAFT'
      ORDER BY pop."created_at" DESC NULLS LAST
      LIMIT 1;
      `,
      [poNumber],
    );

    if (rows.length === 0) {
      return NextResponse.json({ data: null, found: false, poNumber });
    }

    const r = rows[0];
    const num = (v: string | null) => (v != null && v !== '' ? Number(v) : null);

    return NextResponse.json({
      found: true,
      poNumber,
      data: {
        poNumber: r.poNumber,
        markedPendingTime: r.markedPendingTime,
        status: r.status,
        pushedStatus: r.pushedStatus,
        awbNumber: r.awbNumber,
        sellerPhone: r.sellerPhone,
        sellerBusinessName: r.sellerBusinessName,
        buyerPhone: r.buyerPhone,
        buyerBusinessName: r.buyerBusinessName,
        itemTotal: num(r.itemTotal),
        grossAmount: num(r.grossAmount),
        itemDiscount: num(r.itemDiscount),
        couponAmount: num(r.couponAmount),
        appliedWalletAmount: num(r.appliedWalletAmount),
        sellerDiscount: r.sellerDiscount,
        paymentOptionBadhoDiscount: r.paymentOptionBadhoDiscount,
        paymentOption: r.paymentOption,
        cancelReason: r.cancelReason,
        rejectReason: r.rejectReason,
        rejectedBy: r.rejectedBy,
        markedCancelledTime: r.markedCancelledTime,
        markedRejectedTime: r.markedRejectedTime,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
