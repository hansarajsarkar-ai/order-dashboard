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

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRow = await client.query<{
      poId: string;
      status: string;
      itemCount: string;
      totalAmount: string;
    }>(`
      SELECT
        po."id"::text                                                    AS "poId",
        po."status"                                                      AS "status",
        (SELECT COUNT(*)::text  FROM "purchaseOrder"."purchaseOrderItem"
           WHERE "purchaseOrderId" = po."id")                            AS "itemCount",
        (SELECT COALESCE(SUM("amount"::numeric), 0)::text
           FROM "purchaseOrder"."purchaseOrderItem"
           WHERE "purchaseOrderId" = po."id")                            AS "totalAmount"
      FROM "purchaseOrder"."purchaseOrder" po
      WHERE po."poNumber"::text = $1
      FOR UPDATE
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
