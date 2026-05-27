import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Lists coupons / offers the agent can consider applying to a given PO.
// Eligibility is computed coarsely (active + within validity + min-order
// reachable for the current subtotal); the real Badho engine has deeper
// condition checks that we surface as info-only here. The actual apply
// happens at /place-order time so we never leave orphaned reservations
// from dashboard preview clicks.

interface OfferRow {
  id: string;
  code: string;
  type: string;                 // 'COUPON' | 'VOUCHER' | …
  discountType: string | null;  // 'Absolute' | 'absolute' | 'conditional'
  discountValue: string | null;
  discountCap: string | null;
  description: string | null;
  minimumOrderValue: string | null;
  expiryTime: string | null;
  forCODOrder: boolean | null;
  forPrepaidOrder: boolean | null;
  buyerScope: 'buyer-specific' | 'seller-specific' | 'global';
  // Computed: is this currently usable given the order's subtotal /
  // payment option? null = unknown, true = yes, false = no + reason.
  eligible: boolean;
  ineligibleReason: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber || !/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
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
        o."id"::text                          AS "id",
        o."code"                              AS "code",
        o."type"                              AS "type",
        o."discountDetails"                   AS "discountDetails",
        o."description"                       AS "description",
        o."minimumOrderValue"::text           AS "minimumOrderValue",
        o."expiryTime"                        AS "expiryTime",
        o."forCODOrder"                       AS "forCODOrder",
        o."forPrepaidOrder"                   AS "forPrepaidOrder",
        o."buyerId"::text                     AS "buyerId",
        o."sellerId"::text                    AS "sellerId"
      FROM "promotions"."offer" o
      WHERE o."isActive" = TRUE
        AND o."isTest"   = FALSE
        AND (o."expiryTime"     IS NULL OR o."expiryTime"     > NOW())
        AND (o."activationTime" IS NULL OR o."activationTime" <= NOW())
        AND (o."buyerId"  IS NULL OR o."buyerId"  = $1)
        AND (o."sellerId" IS NULL OR o."sellerId" = $2)
        AND (o."maxUsageCount" IS NULL OR o."currentUsageCount" < o."maxUsageCount")
      ORDER BY
        -- buyer-specific offers first, then seller-specific, then global
        CASE WHEN o."buyerId"  = $1 THEN 0 WHEN o."sellerId" = $2 THEN 1 ELSE 2 END,
        o."created_at" DESC
      LIMIT 50;
      `,
      [po.buyerId, po.sellerId],
    );

    const rows: OfferRow[] = offers.map((o) => {
      const minOrder = o.minimumOrderValue != null ? Number(o.minimumOrderValue) : 0;
      const codOnly = o.forCODOrder && !o.forPrepaidOrder;
      const prepaidOnly = o.forPrepaidOrder && !o.forCODOrder;

      let eligible = true;
      let reason: string | null = null;
      if (minOrder > 0 && subtotal < minOrder) {
        eligible = false;
        reason = `Min order ₹${minOrder.toFixed(2)} — add ₹${(minOrder - subtotal).toFixed(2)} more`;
      } else if (codOnly && !isCOD) {
        eligible = false;
        reason = 'COD orders only';
      } else if (prepaidOnly && isCOD) {
        eligible = false;
        reason = 'Prepaid orders only';
      } else if (o.discountDetails?.type && /^conditional$/i.test(String(o.discountDetails.type))) {
        // We don't evaluate the full Badho condition graph here, so flag
        // these as "needs buyer-app check" rather than auto-applying.
        eligible = false;
        reason = 'Conditional offer — apply through buyer app';
      } else if (o.discountDetails?.value === undefined || o.discountDetails?.value === null) {
        eligible = false;
        reason = 'Unknown discount shape';
      }

      const buyerScope: OfferRow['buyerScope'] =
        o.buyerId  ? 'buyer-specific' :
        o.sellerId ? 'seller-specific' : 'global';

      return {
        id: o.id,
        code: o.code,
        type: o.type,
        discountType:  o.discountDetails?.type ?? null,
        discountValue: o.discountDetails?.value != null ? String(o.discountDetails.value) : null,
        discountCap:   o.discountDetails?.cap   != null ? String(o.discountDetails.cap)   : null,
        description: o.description,
        minimumOrderValue: o.minimumOrderValue,
        expiryTime: o.expiryTime,
        forCODOrder: o.forCODOrder,
        forPrepaidOrder: o.forPrepaidOrder,
        buyerScope,
        eligible,
        ineligibleReason: reason,
      };
    });

    // Eligible first, then ineligible, both keeping the original buyer
    // > seller > global priority order.
    rows.sort((a, b) => Number(b.eligible) - Number(a.eligible));

    return NextResponse.json({ rows, count: rows.length, subtotal: po.amount, paymentOption: po.paymentOption });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
