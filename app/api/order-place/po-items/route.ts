import { NextRequest, NextResponse } from 'next/server';
import { getPool, query, type DbClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PoSummaryRow {
  poId: string;
  poNumber: string | number | null;
  amount: string | null;
  status: string;
  created_at: string;
  buyerBusinessName: string | null;
  buyerPhone: string | null;
  sellerBusinessName: string | null;
  sellerPhone: string | null;
  // paymentInfo is a jsonb column; surface the two scalars the UI needs
  // (option = 'COD' | 'FULLY_PAID' | …, instrument = 'UPI' | … when paid).
  // DRAFT POs usually have NULL paymentInfo — buyer picks at checkout.
  paymentOption: string | null;
  paymentInstrument: string | null;
  // seller.minimumOrderValue at the time of the read. The UI gates
  // Place Order behind sum(line.amount) >= sellerMov; the server
  // re-checks the same condition in place-order.
  sellerMov: string | null;
  // buyer's spendable wallet balance from analytics.realTimeBuyerWalletBalances.
  // null if the buyer has no row in that table (e.g. brand-new buyer).
  buyerWalletAmount: string | null;
  // Payment breakdown — what the buyer's app/checkout has applied on
  // the PO so far. All default to 0 / null on a freshly-created DRAFT.
  // The dashboard surfaces these read-only so the confirm dialog can
  // render an accurate "amount payable" line.
  appliedWalletAmount: string | null;
  appliedOfferDiscount: string | null;
  appliedVolumeDiscountAmount: string | null;
  discount: string | null;
  totalDiscount: string | null;
  codHandlingCharge: string | null;
  // Shipping charge if the PO already has a computed quote (lives inside
  // purchaseOrder.deliveryDetails jsonb). Null when nothing's been
  // computed yet — typical for fresh DRAFTs.
  deliveryCharge: string | null;
  // Code of the offer reservation the buyer's app applied, if any. We
  // surface it so the dashboard can render the "applied" pill without a
  // second roundtrip; the actual discount value already lives on
  // appliedOfferDiscount.
  appliedOfferCode: string | null;
}

interface PoItemRow {
  itemId: string;
  brandSKUId: string | null;
  skuLabel: string | null;
  brandLabel: string | null;
  size: string | null;
  // Distinct non-empty image URLs from brandSKU.assets, in a preferred
  // angle order (front/top first). Duplicates removed because many SKUs
  // store front===icon. Empty array when no images are set.
  images: string[];
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  status: string | null;
  // Margin (%) from the slab that matches the item's quantity. The same
  // value the BEFORE INSERT trigger uses to derive unitPrice from
  // consumerSellingPrice. Null if no matching slab is found (shouldn't
  // happen for items the trigger accepted, but the schema allows it).
  margin: string | null;
  // brandSKU.consumerSellingPrice — surfaced so the UI can show
  // MRP × margin% as the displayed unit price (matches the picker).
  mrp: string | null;
  // Packaging metadata sourced from the line's seller_brandSKU. The UI
  // uses these to gate the qty cell: CASE rows can only be edited via
  // stepper buttons that change by moq units per click; UNIT rows keep
  // the free-form input.
  packagingType: 'CASE' | 'UNIT' | null;
  minimumOrderableQuantity: number | null;
  noOfUnitsPerCase: number | null;
}

// Audit constants — distinguish dashboard-driven writes from buyer/seller/app
// flows in downstream analytics. Real production rows tag this column with
// values like "seller-details|productsList"; using "dashboard|..." here keeps
// the same shape but is unmistakably ours.
const ADDED_FROM     = 'dashboard|order-place';
const ADDED_FROM_APP = 'dashboard';
const CREATED_BY     = 'dashboard';
const MODIFIED_BY    = 'dashboard';
// `policies` is a NOT NULL jsonb column; the trigger overwrites it from the
// slab's policy refs, but PG validates NOT NULL before BEFORE triggers run
// for INSERT, so we still have to provide *something*.
const PLACEHOLDER_POLICIES = '{}';

const SLAB_ERROR_HINT = 'Quantity does not match any defined slab for this SKU. Try a different quantity (e.g. 1).';

/* ──────────────────────────────────────────────────────────────────────
 * GET — list items for a PO (plus PO summary).
 * Same shape as before; powers the read-only modal view.
 * ────────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber || !/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) is required' }, { status: 400 });
  }
  try {
    const payload = await loadPoAndItems(poNumber);
    if (!payload) return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    return NextResponse.json(payload);
  } catch (err) {
    return jsonError(err);
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * POST — add a line item to a DRAFT PO.
 * Body: { poNumber, sellerBrandSKUId, quantity }
 *
 * Note: unitPrice / amount / policies will be OVERWRITTEN by the
 * handlePurchaseOrderTermAndUnitPrice2 BEFORE INSERT trigger, which
 * computes the canonical price (consumerSellingPrice * (1 - margin/100))
 * and looks up policy refs from the matched slab. We supply placeholder
 * NOT NULL values; the trigger fills in the real ones.
 * ────────────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const poNumber          = String(body.poNumber ?? '');
  const sellerBrandSKUId  = String(body.sellerBrandSKUId ?? '');
  const quantityNum       = Number(body.quantity);
  if (!/^\d+$/.test(poNumber))                 return NextResponse.json({ error: 'poNumber required'         }, { status: 400 });
  if (!sellerBrandSKUId)                       return NextResponse.json({ error: 'sellerBrandSKUId required' }, { status: 400 });
  if (!Number.isInteger(quantityNum) || quantityNum < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRow = await fetchPoForMutation(client, poNumber);
    if (!poRow) { await client.query('ROLLBACK'); return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 }); }
    if (poRow.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is ${poRow.status}; only DRAFT POs can be edited` }, { status: 409 });
    }

    // Resolve the seller_brandSKU mapping. The trigger needs sellerId +
    // buyerId + brandSKUId to be filled — and brandSKUId determines which
    // brandSKU's consumerSellingPrice it uses. The pricing slab lookup
    // happens *inside* the trigger so we don't replicate it here.
    const skuLookup = await client.query<{
      sellerBrandSKUId: string;
      brandSKUId:  string;
      brandId:     string | null;
      purchaseOrderTermId: string;
    }>(`
      SELECT
        sb."id"::text                                        AS "sellerBrandSKUId",
        sb."brandSKUId"::text                                AS "brandSKUId",
        sb."brandId"::text                                   AS "brandId",
        sb."purchaseOrderTermId"::text                       AS "purchaseOrderTermId"
      FROM "users"."seller_brandSKU" sb
      WHERE sb."id" = $1
        AND sb."sellerId" = $2;
    `, [sellerBrandSKUId, poRow.sellerId]);

    if (skuLookup.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "sellerBrandSKUId does not belong to this PO's seller" }, { status: 400 });
    }
    const sku = skuLookup.rows[0];

    // The trigger will run RAISE EXCEPTION 'Input quantity X is not a valid
    // quantity' if no slab contains the qty; its EXCEPTION handler swallows
    // and returns NULL, which means INSERT silently affects 0 rows. We
    // detect that via rowCount and surface a useful error.
    let inserted;
    try {
      inserted = await client.query<{ id: string }>(`
        INSERT INTO "purchaseOrder"."purchaseOrderItem" (
          "purchaseOrderId", "brandSKUId", "seller_brandSKUId", "brandId",
          "sellerId", "buyerId",
          "quantity", "unitPrice", "amount", "total",
          "rewardPricePerUnit", "amountForReward",
          "policies",
          "purchaseOrderTermId", "isPoTermEnforced",
          "addedFrom", "addedFromApp", "createdBy", "modifiedByRole"
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6,
          $7, 0::numeric, 0::numeric, 0::numeric,
          0::numeric, 0::numeric,
          $8::jsonb,
          $9, TRUE,
          $10, $11, $12, $13
        )
        RETURNING "id"::text AS id;
      `, [
        poRow.poId, sku.brandSKUId, sku.sellerBrandSKUId, sku.brandId,
        poRow.sellerId, poRow.buyerId,
        quantityNum,
        PLACEHOLDER_POLICIES,
        sku.purchaseOrderTermId,
        ADDED_FROM, ADDED_FROM_APP, CREATED_BY, MODIFIED_BY,
      ]);
    } catch (e) {
      await client.query('ROLLBACK');
      const msg = e instanceof Error ? e.message : String(e);
      // Surface the slab-validation message verbatim if it bubbles up.
      return NextResponse.json({ error: msg.includes('not a valid quantity') ? SLAB_ERROR_HINT : msg }, { status: 422 });
    }

    if (inserted.rowCount === 0) {
      // BEFORE-trigger swallowed an exception → row not inserted.
      await client.query('ROLLBACK');
      return NextResponse.json({ error: SLAB_ERROR_HINT }, { status: 422 });
    }

    await syncPoTotals(client, poRow.poId);
    await client.query('COMMIT');

    const payload = await loadPoAndItems(poNumber);
    return NextResponse.json(payload);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return jsonError(err);
  } finally {
    client.release();
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * PATCH — change quantity on an existing item.
 * Body: { itemId, quantity }
 * Refuses if the item or its PO is not DRAFT.
 *
 * Trigger note: handlePurchaseOrderTermAndUnitPrice2 silently no-ops if the
 * new qty doesn't match a slab (its EXCEPTION handler logs+swallows). We
 * detect 0-rows-affected and return 422.
 * ────────────────────────────────────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const itemId      = String(body.itemId ?? '');
  const quantityNum = Number(body.quantity);
  if (!itemId)                                         return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  if (!Number.isInteger(quantityNum) || quantityNum < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemRow = await client.query<{ itemId: string; poId: string; poNumber: string; poStatus: string }>(`
      SELECT
        poi."id"::text                AS "itemId",
        po."id"::text                 AS "poId",
        po."poNumber"::text           AS "poNumber",
        po."status"                   AS "poStatus"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = poi."purchaseOrderId"
      WHERE poi."id" = $1
      LIMIT 1;
    `, [itemId]);
    if (itemRow.rowCount === 0) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'item not found' }, { status: 404 }); }
    const it = itemRow.rows[0];
    if (it.poStatus !== 'DRAFT') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${it.poNumber} is ${it.poStatus}; only DRAFT POs can be edited` }, { status: 409 });
    }

    let upd;
    try {
      upd = await client.query(`
        UPDATE "purchaseOrder"."purchaseOrderItem"
           SET "quantity"       = $1,
               "updated_at"     = NOW(),
               "modifiedByRole" = $2
         WHERE "id" = $3
         RETURNING "id";
      `, [quantityNum, MODIFIED_BY, itemId]);
    } catch (e) {
      await client.query('ROLLBACK');
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg.includes('not a valid quantity') ? SLAB_ERROR_HINT : msg }, { status: 422 });
    }

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: SLAB_ERROR_HINT }, { status: 422 });
    }

    await syncPoTotals(client, it.poId);
    await client.query('COMMIT');

    const payload = await loadPoAndItems(it.poNumber);
    return NextResponse.json(payload);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return jsonError(err);
  } finally {
    client.release();
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * DELETE — remove an item from a DRAFT PO.
 * Query: ?itemId=<uuid>
 * ────────────────────────────────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId') || '';
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemRow = await client.query<{ poId: string; poNumber: string; poStatus: string }>(`
      SELECT po."id"::text AS "poId", po."poNumber"::text AS "poNumber", po."status" AS "poStatus"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = poi."purchaseOrderId"
      WHERE poi."id" = $1
      LIMIT 1;
    `, [itemId]);
    if (itemRow.rowCount === 0) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'item not found' }, { status: 404 }); }
    const it = itemRow.rows[0];
    if (it.poStatus !== 'DRAFT') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${it.poNumber} is ${it.poStatus}; only DRAFT POs can be edited` }, { status: 409 });
    }

    await client.query(`DELETE FROM "purchaseOrder"."purchaseOrderItem" WHERE "id" = $1;`, [itemId]);
    await syncPoTotals(client, it.poId);
    await client.query('COMMIT');

    const payload = await loadPoAndItems(it.poNumber);
    return NextResponse.json(payload);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return jsonError(err);
  } finally {
    client.release();
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────── */
async function fetchPoForMutation(client: DbClient, poNumber: string) {
  const r = await client.query<{ poId: string; sellerId: string; buyerId: string; status: string }>(`
    SELECT "id"::text AS "poId", "sellerId"::text AS "sellerId", "buyerId"::text AS "buyerId", "status"
    FROM "purchaseOrder"."purchaseOrder"
    WHERE "poNumber"::text = $1
    FOR UPDATE
    LIMIT 1;
  `, [poNumber]);
  return r.rows[0];
}

async function syncPoTotals(client: DbClient, poId: string) {
  // PO has its own `handlePurchaseOrderAmount` trigger that may also derive
  // the amount; this UPDATE is defensive so the PO row shows the right
  // total immediately on refresh even if the trigger chain skips a beat.
  await client.query(`
    UPDATE "purchaseOrder"."purchaseOrder" po
       SET "amount"     = COALESCE(sums.total, 0),
           "itemTotal"  = COALESCE(sums.total, 0),
           "updated_at" = NOW()
      FROM (
        SELECT COALESCE(SUM("amount"::numeric), 0) AS total
        FROM "purchaseOrder"."purchaseOrderItem"
        WHERE "purchaseOrderId" = $1
      ) sums
     WHERE po."id" = $1;
  `, [poId]);
}

async function loadPoAndItems(poNumber: string) {
  const summaryRows = await query<PoSummaryRow>(`
    SELECT
      a."id"::text         AS "poId",
      a."poNumber"         AS "poNumber",
      a."amount"::text     AS "amount",
      a."status"           AS "status",
      a."created_at"       AS "created_at",
      b."businessName"                     AS "buyerBusinessName",
      b."phone"                            AS "buyerPhone",
      s."businessName"                     AS "sellerBusinessName",
      s."phone"                            AS "sellerPhone",
      (a."paymentInfo" ->> 'option')       AS "paymentOption",
      (a."paymentInfo" ->> 'instrument')   AS "paymentInstrument",
      s."minimumOrderValue"::text          AS "sellerMov",
      bw."availableWalletBalance"::text    AS "buyerWalletAmount",
      a."appliedWalletAmount"::text        AS "appliedWalletAmount",
      a."appliedOfferDiscount"::text       AS "appliedOfferDiscount",
      a."appliedVolumeDiscountAmount"::text AS "appliedVolumeDiscountAmount",
      a."discount"::text                   AS "discount",
      a."totalDiscount"::text              AS "totalDiscount",
      a."codHandlingCharge"::text          AS "codHandlingCharge",
      -- deliveryDetails is jsonb; the buyer app stores totalCharge there
      -- after a Pidge/shipping quote. We try a couple of common shapes
      -- and fall back to NULL if nothing's computed.
      COALESCE(
        a."deliveryDetails" ->> 'totalCharge',
        a."deliveryDetails" ->> 'charge',
        a."deliveryDetails" ->> 'amount'
      )                                    AS "deliveryCharge",
      -- Active reservation → its offer code, so the UI can render
      -- "FIRSTORDER applied" without a separate lookup.
      offr."code"                          AS "appliedOfferCode"
    FROM "purchaseOrder"."purchaseOrder" a
    JOIN "users"."buyer"  b ON b."id" = a."buyerId"
    JOIN "users"."seller" s ON s."id" = a."sellerId"
    LEFT JOIN "analytics"."realTimeBuyerWalletBalances" bw ON bw."buyerId" = a."buyerId"
    LEFT JOIN "promotions"."offerReservation" ores ON ores."id"   = a."appliedOfferReservationId"
    LEFT JOIN "promotions"."offer"            offr ON offr."id"   = ores."offerId"
    WHERE a."poNumber"::text = $1
    LIMIT 1;
  `, [poNumber]);
  const po = summaryRows[0];
  if (!po) return null;

  const items = await query<PoItemRow>(`
    SELECT
      poi."id"::text                                     AS "itemId",
      poi."brandSKUId"::text                             AS "brandSKUId",
      bs."label"                                         AS "skuLabel",
      bra."label"                                        AS "brandLabel",
      (bs."brandSKUDataJSON" ->> 'size')                 AS "size",
      -- All distinct non-empty product images from brandSKU.assets, in
      -- a preferred angle order (front/top first). Many SKUs store
      -- front===icon so we dedupe by URL while keeping the angle
      -- priority — DISTINCT ON (url) ordered by ord keeps the lowest-
      -- ord row per URL, then the outer query restores angle order.
      COALESCE((
        SELECT array_agg(url ORDER BY ord)
        FROM (
          SELECT DISTINCT ON (url) url, ord
          FROM unnest(
            ARRAY['front','top','icon','top_left','top_right','left','right','back','bottom']
          ) WITH ORDINALITY AS k(angle, ord)
          CROSS JOIN LATERAL (SELECT NULLIF(bs."assets" ->> k.angle, '') AS url) u
          WHERE url IS NOT NULL
          ORDER BY url, ord
        ) deduped
      ), ARRAY[]::text[])                                AS "images",
      poi."quantity"::text                               AS "quantity",
      poi."unitPrice"::text                              AS "unitPrice",
      poi."amount"::text                                 AS "amount",
      poi."status"                                       AS "status",
      pos."margin"::text                                 AS "margin",
      bs."consumerSellingPrice"::text                    AS "mrp",
      sb."packagingType"                                 AS "packagingType",
      sb."minimumOrderableQuantity"                      AS "minimumOrderableQuantity",
      sb."noOfUnitsPerCase"                              AS "noOfUnitsPerCase"
    FROM "purchaseOrder"."purchaseOrderItem" poi
    LEFT JOIN "brands"."brandSKU"      bs  ON bs."id"  = poi."brandSKUId"
    LEFT JOIN "brands"."brand"         bra ON bra."id" = bs."brandId"
    LEFT JOIN "users"."seller_brandSKU" sb ON sb."id"  = poi."seller_brandSKUId"
    -- Slab is matched by both purchaseOrderTermId AND quantity range
    -- (same logic the BEFORE INSERT trigger uses to compute unitPrice).
    LEFT JOIN "purchaseOrderTerms"."purchaseOrderTermSlab" pos
      ON pos."purchaseOrderTermId" = poi."purchaseOrderTermId"
     AND pos."quantitySlab" @> poi."quantity"
    WHERE poi."purchaseOrderId" = $1
    ORDER BY poi."amount"::numeric DESC NULLS LAST, poi."id";
  `, [po.poId]);

  return {
    po,
    items,
    itemCount: items.length,
    totalQuantity: items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0),
    totalItemAmount: items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
    timestamp: new Date().toISOString(),
  };
}

function jsonError(err: unknown): NextResponse {
  const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
  return NextResponse.json({ error: msg }, { status: 500 });
}
