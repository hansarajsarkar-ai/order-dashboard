import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Flips a DRAFT PO to PENDING with markedPendingTime = NOW().
// Many AFTER UPDATE triggers fire on this row (notifications, settlement
// readiness, third-party delivery, history) — they're exactly the side
// effects we want when an order is placed.
//
// Refuses if:
//   • PO not found                                  → 404
//   • PO is not in DRAFT (already placed/archived)  → 409
//   • PO has zero items (empty placed order)        → 422
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const poNumber = String(body.poNumber ?? '');
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  }

  // Optional: amount of wallet credit the user chose to apply on this PO
  // before placement. Validated below against the buyer's actual balance
  // and the PO subtotal; the BEFORE UPDATE trigger
  // handleAppliedWalletAmountBeforeUpdate enforces the "DRAFT only" gate
  // and clears other DRAFT POs' wallet applications for the same buyer.
  const applyWalletRaw = body.applyWalletAmount;
  const applyWalletAmount =
    applyWalletRaw === undefined || applyWalletRaw === null || applyWalletRaw === ''
      ? 0
      : Number(applyWalletRaw);
  if (!Number.isFinite(applyWalletAmount) || applyWalletAmount < 0) {
    return NextResponse.json({ error: 'applyWalletAmount must be a non-negative number' }, { status: 400 });
  }

  // Optional coupon code the agent picked in the dashboard's checkout
  // sidebar. We re-validate against promotions.offer + scope + min order
  // before writing appliedOfferDiscount/appliedOfferReservationId, so a
  // stale UI can't slip an invalid code through.
  const applyCouponCodeRaw = body.applyCouponCode;
  const applyCouponCode =
    applyCouponCodeRaw === undefined || applyCouponCodeRaw === null
      ? ''
      : String(applyCouponCodeRaw).trim();

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRow = await client.query<{
      poId: string;
      buyerId: string;
      status: string;
      itemCount: string;
      totalAmount: string;
      sellerMov: string | null;
      walletAvail: string | null;
    }>(`
      SELECT
        po."id"::text                                                    AS "poId",
        po."buyerId"::text                                               AS "buyerId",
        po."status"                                                      AS "status",
        (SELECT COUNT(*)::text  FROM "purchaseOrder"."purchaseOrderItem"
           WHERE "purchaseOrderId" = po."id")                            AS "itemCount",
        (SELECT COALESCE(SUM("amount"::numeric), 0)::text
           FROM "purchaseOrder"."purchaseOrderItem"
           WHERE "purchaseOrderId" = po."id")                            AS "totalAmount",
        s."minimumOrderValue"::text                                      AS "sellerMov",
        bw."availableWalletBalance"::text                                AS "walletAvail"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN "analytics"."realTimeBuyerWalletBalances" bw ON bw."buyerId" = po."buyerId"
      WHERE po."poNumber"::text = $1
      FOR UPDATE OF po
      LIMIT 1;
    `, [poNumber]);

    if (poRow.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    }
    const po = poRow.rows[0];
    if (po.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is already ${po.status}` }, { status: 409 });
    }
    if (Number(po.itemCount) === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'cannot place an empty PO — add at least one item first' }, { status: 422 });
    }

    // MOV gate. seller.minimumOrderValue is the smallest PO total the
    // seller will accept; NULL means no floor. The client also blocks
    // placement when shortfall > 0, but we re-check here so a stale UI
    // can't slip a sub-MOV order through.
    const totalNum = Number(po.totalAmount);
    const movNum   = po.sellerMov != null ? Number(po.sellerMov) : 0;
    if (movNum > 0 && totalNum < movNum) {
      await client.query('ROLLBACK');
      const shortfall = movNum - totalNum;
      return NextResponse.json({
        error: `Order total ₹${totalNum.toFixed(2)} is below the seller's minimum order value (₹${movNum.toFixed(2)}). Add ₹${shortfall.toFixed(2)} more before placing.`,
        sellerMov: po.sellerMov,
        totalAmount: po.totalAmount,
        shortfall: shortfall.toFixed(2),
      }, { status: 422 });
    }

    // Coupon application (optional). MVP supports Absolute discount
    // offers only; conditional / percentage offers are kicked back to
    // the buyer-app flow because they need the full Badho condition
    // engine to evaluate correctly.
    let appliedOfferDiscount = 0;
    if (applyCouponCode) {
      const buyerId = po.buyerId;
      const sellerRow = await client.query<{ sellerId: string }>(
        `SELECT "sellerId"::text AS "sellerId"
           FROM "purchaseOrder"."purchaseOrder"
          WHERE "id" = $1 LIMIT 1;`,
        [po.poId],
      );
      const sellerId = sellerRow.rows[0]?.sellerId;

      const off = await client.query<{
        id: string;
        code: string;
        discountDetails: { type?: string; value?: string | number; cap?: string | number } | null;
        minimumOrderValue: string | null;
        forCODOrder: boolean | null;
        forPrepaidOrder: boolean | null;
      }>(`
        SELECT
          o."id"::text                AS "id",
          o."code"                    AS "code",
          o."discountDetails"         AS "discountDetails",
          o."minimumOrderValue"::text AS "minimumOrderValue",
          o."forCODOrder"             AS "forCODOrder",
          o."forPrepaidOrder"         AS "forPrepaidOrder"
        FROM "promotions"."offer" o
        WHERE UPPER(o."code") = UPPER($1)
          AND o."isActive" = TRUE
          AND o."isTest"   = FALSE
          AND (o."expiryTime"     IS NULL OR o."expiryTime"     > NOW())
          AND (o."activationTime" IS NULL OR o."activationTime" <= NOW())
          AND (o."buyerId"  IS NULL OR o."buyerId"  = $2)
          AND (o."sellerId" IS NULL OR o."sellerId" = $3)
          AND (o."maxUsageCount" IS NULL OR o."currentUsageCount" < o."maxUsageCount")
        FOR UPDATE
        LIMIT 1;
      `, [applyCouponCode, buyerId, sellerId]);

      if (off.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Coupon "${applyCouponCode}" not found or not eligible.` }, { status: 422 });
      }
      const o = off.rows[0];

      // Re-check min order at place time (subtotal might have changed
      // since the agent picked the coupon).
      const minOrder = o.minimumOrderValue != null ? Number(o.minimumOrderValue) : 0;
      if (minOrder > 0 && totalNum < minOrder) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Coupon ${o.code} needs min ₹${minOrder.toFixed(2)} — current subtotal ₹${totalNum.toFixed(2)}. Add ₹${(minOrder - totalNum).toFixed(2)}.`,
        }, { status: 422 });
      }

      const dt = String(o.discountDetails?.type ?? '').toLowerCase();
      const raw = o.discountDetails?.value;
      const cap = o.discountDetails?.cap != null ? Number(o.discountDetails.cap) : null;
      if (dt !== 'absolute' || raw == null) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Coupon ${o.code} uses ${o.discountDetails?.type ?? 'unknown'} discount — apply via buyer app (dashboard supports absolute coupons only).`,
        }, { status: 422 });
      }
      appliedOfferDiscount = Number(raw);
      if (cap != null && appliedOfferDiscount > cap) appliedOfferDiscount = cap;
      if (appliedOfferDiscount > totalNum)           appliedOfferDiscount = totalNum;
      appliedOfferDiscount = Number(appliedOfferDiscount.toFixed(2));

      // Insert an offerReservation so downstream Badho services see the
      // coupon as committed. Status='APPLIED' mirrors the value the
      // buyer-app uses when an offer is locked in but not yet settled.
      let reservationId: string;
      try {
        const ins = await client.query<{ id: string }>(
          `
          INSERT INTO "promotions"."offerReservation" (
            "offerId", "buyerId", "purchaseOrderId", "status", "expiryAt", "isTest"
          ) VALUES ($1, $2, $3, 'APPLIED', NOW() + INTERVAL '1 day', FALSE)
          RETURNING "id"::text AS id;
          `,
          [o.id, buyerId, po.poId],
        );
        reservationId = ins.rows[0].id;
      } catch (e) {
        await client.query('ROLLBACK');
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `Coupon reservation failed: ${msg}` }, { status: 422 });
      }

      // Mirror onto the PO row so the BEFORE UPDATE trigger sees the
      // applied state when we flip status to PENDING.
      await client.query(
        `UPDATE "purchaseOrder"."purchaseOrder"
            SET "appliedOfferReservationId" = $2,
                "appliedOfferDiscount"      = $3,
                "appliedOfferSnapshotJSON"  = jsonb_build_object(
                  'code', $4::text,
                  'value', $3::numeric,
                  'source', 'dashboard'
                ),
                "updated_at"                = NOW(),
                "modifiedByRole"            = 'dashboard'
          WHERE "id" = $1;`,
        [po.poId, reservationId, appliedOfferDiscount, o.code],
      );
    }

    // Wallet application — must happen while the PO is still DRAFT so
    // handleAppliedWalletAmountBeforeUpdate accepts it. Validate against
    // both the buyer's current balance and the PO subtotal so we never
    // apply more credit than they have or more than they owe.
    if (applyWalletAmount > 0) {
      const walletAvailNum = po.walletAvail != null ? Number(po.walletAvail) : 0;
      if (applyWalletAmount > walletAvailNum + 0.001) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Wallet apply ₹${applyWalletAmount.toFixed(2)} exceeds available balance ₹${walletAvailNum.toFixed(2)}.`,
        }, { status: 422 });
      }
      if (applyWalletAmount > totalNum + 0.001) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          error: `Wallet apply ₹${applyWalletAmount.toFixed(2)} exceeds order subtotal ₹${totalNum.toFixed(2)}.`,
        }, { status: 422 });
      }
      try {
        await client.query(
          `UPDATE "purchaseOrder"."purchaseOrder"
              SET "appliedWalletAmount" = $2::numeric,
                  "updated_at"          = NOW(),
                  "modifiedByRole"      = 'dashboard'
            WHERE "id" = $1;`,
          [po.poId, applyWalletAmount],
        );
      } catch (e) {
        await client.query('ROLLBACK');
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `Wallet apply rejected: ${msg}` }, { status: 422 });
      }
    }

    const upd = await client.query<{
      poNumber: string;
      status: string;
      amount: string;
      itemTotal: string;
      markedPendingTime: string;
    }>(`
      UPDATE "purchaseOrder"."purchaseOrder"
         SET "status"            = 'PENDING',
             "markedPendingTime" = NOW(),
             "amount"            = $2::numeric,
             "itemTotal"         = $2::numeric,
             "updated_at"        = NOW(),
             "modifiedByRole"    = 'dashboard'
       WHERE "id" = $1
       RETURNING
         "poNumber"::text          AS "poNumber",
         "status",
         "amount"::text            AS "amount",
         "itemTotal"::text         AS "itemTotal",
         "markedPendingTime";
    `, [po.poId, po.totalAmount]);

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'placement was silently rejected by a DB trigger' }, { status: 422 });
    }

    await client.query('COMMIT');

    return NextResponse.json({
      placed: true,
      ...upd.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
