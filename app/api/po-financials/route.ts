import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  orderAmount: string | null;
  itemDiscount: string | null;
  couponAmount: string | null;
  paymentOption: string | null;
  badhoDiscount: string | null;
  sellerDiscount: string | null;
  upiDiscountBySeller: string | null;
  volumeDiscount: string | null;
  totalDiscount: string | null;
  appliedWalletAmount: string | null;
  paidAmount: string | null;
  codAmountToBeCollected: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)::text          AS "orderAmount",
        COALESCE(po."platformMarginDiscount", 0)::numeric::text                                    AS "itemDiscount",
        po."appliedOfferDiscount"::text                                                            AS "couponAmount",
        po."paymentInfo"->>'option'                                                                AS "paymentOption",
        COALESCE(pop."discountByBadho", 0)::text                                                   AS "badhoDiscount",
        COALESCE(pop."discountBySeller", 0)::text                                                  AS "sellerDiscount",
        (-COALESCE(pop."UpiDiscountBySeller", 0))::text                                            AS "upiDiscountBySeller",
        COALESCE(po."appliedVolumeDiscountAmount", 0)::numeric::text                               AS "volumeDiscount",
        COALESCE(po."totalDiscount", 0)::numeric::text                                             AS "totalDiscount",
        COALESCE(pop."appliedWalletAmount", 0)::text                                               AS "appliedWalletAmount",
        COALESCE(pop."paidAmount", 0)::text                                                        AS "paidAmount",
        dv."codAmountToBeCollected"::text                                                          AS "codAmountToBeCollected"
      FROM "purchaseOrder"."purchaseOrder" po
      LEFT JOIN LATERAL (
        SELECT
          SUM("paidAmount")                                                                  AS "paidAmount",
          SUM(COALESCE(("breakup"->>'discount_on_payment_preference_for_seller')::float, 0)) AS "discountBySeller",
          SUM(COALESCE(("breakup"->>'discount_on_payment_preference_from_badho')::float, 0)) AS "discountByBadho",
          SUM(COALESCE(("breakup"->>'payment_method_adjustment')::float, 0))                 AS "UpiDiscountBySeller",
          SUM(COALESCE("appliedWalletAmount"::numeric, 0))                                   AS "appliedWalletAmount"
        FROM "purchaseOrder"."purchaseOrderPayment"
        WHERE "purchaseOrderId" = po."id"
          AND "status" = 'COMPLETED'
          AND "event" NOT IN ('DAAS', 'DAAS_FIRST_MILE', 'DAAS_LAST_MILE', 'DAAS_REDELIVERY_PAYMENT')
      ) pop ON TRUE
      LEFT JOIN LATERAL (
        SELECT "codAmountToBeCollected"
        FROM "deliveries"."intercityDelivery"
        WHERE "purchaseOrderId" = po."id"
        ORDER BY "created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      WHERE po."poNumber" = $1::int
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
        itemDiscount: num(r.itemDiscount),
        couponAmount: num(r.couponAmount),
        badhoDiscount: num(r.badhoDiscount),
        sellerDiscount: num(r.sellerDiscount),
        upiDiscountBySeller: num(r.upiDiscountBySeller),
        volumeDiscount: num(r.volumeDiscount),
        totalDiscount: num(r.totalDiscount),
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
