import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Cheap server-side "what would this coupon do?" check the dashboard
// calls when the agent types or clicks an offer. Validates the code
// against promotions.offer + buyer/seller scope + minimum order, and
// returns the discount value the place-order endpoint would commit.
// Stays read-only — no offerReservation rows are created here.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const poNumber = String(body.poNumber ?? '');
  const code     = String(body.code ?? '').trim();
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }

  try {
    const poRow = await query<{
      buyerId: string;
      sellerId: string;
      amount: string;
      paymentOption: string | null;
    }>(
      `SELECT
         "buyerId"::text                       AS "buyerId",
         "sellerId"::text                      AS "sellerId",
         "amount"::text                        AS "amount",
         ("paymentInfo" ->> 'option')::text    AS "paymentOption"
       FROM "purchaseOrder"."purchaseOrder"
       WHERE "poNumber"::text = $1
       LIMIT 1;`,
      [poNumber],
    );
    if (poRow.length === 0) {
      return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    }
    const po = poRow[0];
    const subtotal = Number(po.amount) || 0;
    const isCOD = po.paymentOption === 'COD';

    const offers = await query<{
      id: string;
      code: string;
      type: string;
      discountDetails: { type?: string; value?: string | number; cap?: string | number } | null;
      description: string | null;
      minimumOrderValue: string | null;
      expiryTime: string | null;
      forCODOrder: boolean | null;
      forPrepaidOrder: boolean | null;
      buyerId: string | null;
      sellerId: string | null;
    }>(
      `
      SELECT
        o."id"::text                AS "id",
        o."code"                    AS "code",
        o."type"                    AS "type",
        o."discountDetails"         AS "discountDetails",
        o."description"             AS "description",
        o."minimumOrderValue"::text AS "minimumOrderValue",
        o."expiryTime"              AS "expiryTime",
        o."forCODOrder"             AS "forCODOrder",
        o."forPrepaidOrder"         AS "forPrepaidOrder",
        o."buyerId"::text           AS "buyerId",
        o."sellerId"::text          AS "sellerId"
      FROM "promotions"."offer" o
      WHERE UPPER(o."code") = UPPER($1)
        AND o."isActive" = TRUE
        AND o."isTest"   = FALSE
        AND (o."expiryTime"     IS NULL OR o."expiryTime"     > NOW())
        AND (o."activationTime" IS NULL OR o."activationTime" <= NOW())
        AND (o."buyerId"  IS NULL OR o."buyerId"  = $2)
        AND (o."sellerId" IS NULL OR o."sellerId" = $3)
        AND (o."maxUsageCount" IS NULL OR o."currentUsageCount" < o."maxUsageCount")
      LIMIT 1;
      `,
      [code, po.buyerId, po.sellerId],
    );

    if (offers.length === 0) {
      return NextResponse.json({
        valid: false,
        error: `Coupon "${code}" not found or not eligible for this PO.`,
      }, { status: 404 });
    }
    const o = offers[0];

    // Eligibility — same gates the listing endpoint surfaces.
    const minOrder = o.minimumOrderValue != null ? Number(o.minimumOrderValue) : 0;
    if (minOrder > 0 && subtotal < minOrder) {
      return NextResponse.json({
        valid: false,
        error: `Order subtotal ₹${subtotal.toFixed(2)} is below min ₹${minOrder.toFixed(2)} for ${o.code}. Add ₹${(minOrder - subtotal).toFixed(2)} more.`,
      }, { status: 422 });
    }
    if (o.forCODOrder && !o.forPrepaidOrder && !isCOD) {
      return NextResponse.json({ valid: false, error: `${o.code} applies to COD orders only.` }, { status: 422 });
    }
    if (o.forPrepaidOrder && !o.forCODOrder && isCOD) {
      return NextResponse.json({ valid: false, error: `${o.code} applies to prepaid orders only.` }, { status: 422 });
    }

    // Compute discount — Absolute only in the dashboard MVP. Conditional
    // offers and percentage offers are not auto-computed here; we kick
    // them back so the agent goes through the buyer-app flow.
    const dt = String(o.discountDetails?.type ?? '').toLowerCase();
    const raw = o.discountDetails?.value;
    const cap = o.discountDetails?.cap != null ? Number(o.discountDetails.cap) : null;
    let discount = 0;
    if (dt === 'absolute' && raw != null) {
      discount = Number(raw);
    } else {
      return NextResponse.json({
        valid: false,
        error: `${o.code} (${o.discountDetails?.type ?? 'unknown'} discount) — apply via buyer app, dashboard supports absolute coupons only for now.`,
      }, { status: 422 });
    }
    if (cap != null && discount > cap) discount = cap;
    if (discount > subtotal) discount = subtotal;

    return NextResponse.json({
      valid: true,
      offerId: o.id,
      code: o.code,
      description: o.description,
      discount: Number(discount.toFixed(2)),
      subtotal: po.amount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
