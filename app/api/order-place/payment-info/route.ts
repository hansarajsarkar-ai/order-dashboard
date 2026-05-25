import { NextRequest, NextResponse } from 'next/server';
import { getPool, query } from '@/lib/db';

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
  paymentOption: string | null;
  paymentInstrument: string | null;
}

interface PoItemRow {
  itemId: string;
  brandSKUId: string | null;
  skuLabel: string | null;
  brandLabel: string | null;
  size: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  status: string | null;
  margin: string | null;
}

// Sets purchaseOrder.paymentInfo for a DRAFT PO. Only COD is exposed for
// now — adding more options means handling the `instrument` field too
// (e.g. UPI / wallet) which we haven't wired into the picker UI yet.
const VALID_OPTIONS = new Set(['COD']);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const poNumber = String(body.poNumber ?? '');
  const option   = String(body.option ?? '');
  if (!/^\d+$/.test(poNumber)) return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  if (!VALID_OPTIONS.has(option)) {
    return NextResponse.json({ error: `unsupported payment option "${option}"; allowed: ${[...VALID_OPTIONS].join(', ')}` }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRow = await client.query<{ poId: string; status: string }>(`
      SELECT "id"::text AS "poId", "status"
      FROM "purchaseOrder"."purchaseOrder"
      WHERE "poNumber"::text = $1
      FOR UPDATE
      LIMIT 1;
    `, [poNumber]);
    if (poRow.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    }
    if (poRow.rows[0].status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is ${poRow.rows[0].status}; payment mode is locked on placed orders` }, { status: 409 });
    }

    const upd = await client.query(`
      UPDATE "purchaseOrder"."purchaseOrder"
         SET "paymentInfo"    = $2::jsonb,
             "updated_at"     = NOW(),
             "modifiedByRole" = 'dashboard'
       WHERE "id" = $1
       RETURNING "id";
    `, [poRow.rows[0].poId, JSON.stringify({ option })]);

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'update was silently rejected (possibly a DB trigger)' }, { status: 422 });
    }

    await client.query('COMMIT');

    // Return the same PoItemsResponse shape as the other mutation endpoints
    // so the modal can swap state in one go.
    const payload = await loadPoAndItems(poNumber);
    return NextResponse.json(payload);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

// Same shape as the GET in po-items/route.ts so the modal can drop-in
// replace state. Kept inline rather than imported to avoid pulling in
// the other handler's helpers (and risking circular bundling).
async function loadPoAndItems(poNumber: string) {
  const summaryRows = await query<PoSummaryRow>(`
    SELECT
      a."id"::text                         AS "poId",
      a."poNumber"                         AS "poNumber",
      a."amount"::text                     AS "amount",
      a."status"                           AS "status",
      a."created_at"                       AS "created_at",
      b."businessName"                     AS "buyerBusinessName",
      b."phone"                            AS "buyerPhone",
      s."businessName"                     AS "sellerBusinessName",
      s."phone"                            AS "sellerPhone",
      (a."paymentInfo" ->> 'option')       AS "paymentOption",
      (a."paymentInfo" ->> 'instrument')   AS "paymentInstrument"
    FROM "purchaseOrder"."purchaseOrder" a
    JOIN "users"."buyer"  b ON b."id" = a."buyerId"
    JOIN "users"."seller" s ON s."id" = a."sellerId"
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
      poi."quantity"::text                               AS "quantity",
      poi."unitPrice"::text                              AS "unitPrice",
      poi."amount"::text                                 AS "amount",
      poi."status"                                       AS "status",
      pos."margin"::text                                 AS "margin"
    FROM "purchaseOrder"."purchaseOrderItem" poi
    LEFT JOIN "brands"."brandSKU" bs  ON bs."id"  = poi."brandSKUId"
    LEFT JOIN "brands"."brand"    bra ON bra."id" = bs."brandId"
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
