import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  orderAmount: string | null;
  couponAmount: string | null;
  paymentOption: string | null;
  badhoDiscount: string | null;
  sellerDiscount: string | null;
  appliedWalletAmount: string | null;
  paidAmount: string | null;
  codAmountToBeCollected: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber) {
    return NextResponse.json({ error: 'poNumber required' }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        po."amount"::text                                                                          AS "orderAmount",
        po."appliedOfferDiscount"::text                                                            AS "couponAmount",
        po."paymentInfo"->>'option'                                                                AS "paymentOption",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0)::text    AS "badhoDiscount",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0)::text    AS "sellerDiscount",
        pop."appliedWalletAmount"::text                                                            AS "appliedWalletAmount",
        pop."paidAmount"::text                                                                     AS "paidAmount",
        dv."codAmountToBeCollected"::text                                                          AS "codAmountToBeCollected"
      FROM "purchaseOrder"."purchaseOrder" po
      LEFT JOIN LATERAL (
        SELECT "breakup", "appliedWalletAmount", "paidAmount"
        FROM "purchaseOrder"."purchaseOrderPayment"
        WHERE "purchaseOrderId" = po."id"
          AND "status" = 'COMPLETED'
          AND "event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
        ORDER BY "created_at" DESC
        LIMIT 1
      ) pop ON TRUE
      LEFT JOIN LATERAL (
        SELECT "codAmountToBeCollected"
        FROM "deliveries"."intercityDelivery"
        WHERE "purchaseOrderId" = po."id"
        ORDER BY "created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      WHERE po."poNumber" = $1
      LIMIT 1
    `;
    const rows = await query<Row>(sql, [poNumber]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    }
    const r = rows[0];
    const num = (v: string | null) => (v == null ? null : parseFloat(v));
    return NextResponse.json({
      data: {
        orderAmount: num(r.orderAmount),
        couponAmount: num(r.couponAmount),
        badhoDiscount: num(r.badhoDiscount),
        sellerDiscount: num(r.sellerDiscount),
        appliedWalletAmount: num(r.appliedWalletAmount),
        paidAmount: num(r.paidAmount),
        codAmountToBeCollected: num(r.codAmountToBeCollected),
        paymentOption: r.paymentOption,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
