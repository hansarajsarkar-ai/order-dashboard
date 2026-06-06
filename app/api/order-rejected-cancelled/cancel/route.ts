import { NextResponse, NextRequest } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Cancel a purchase order from the Order Rejected/Cancelled dashboard.
 *
 *   status              → 'CANCELLED'
 *   cancelReason        → the reason picked in the modal
 *   markedCancelledTime → NOW()
 *
 * SAFETY — refund guard. The BEFORE-UPDATE trigger handlePurchaseOrderAmount
 * RECOMPUTES po.amount ( = itemTotal − totalDiscount ) for any non-REJECTED
 * status, including CANCELLED. If that recompute changes amount, the
 * AFTER-UPDATE trigger handlePurchaseOrderRefundOnOrderUpdate fires and issues
 * a refund. We do NOT want to silently move money from a dashboard click, so
 * we refuse the cancel whenever the recompute would change amount and tell the
 * operator to use the main-app flow (which handles the refund deliberately).
 * For all in-sync POs the recompute is a no-op, so this only blocks the
 * out-of-sync edge case. Mirrors app/api/po-modified/inform.
 *
 * Other status-change triggers (seller/buyer notifications, SLA-ticket close,
 * item-status propagation, entity history) DO fire — those are the correct
 * side effects of a cancellation.
 */
export async function POST(req: NextRequest) {
  let body: { poNumber?: unknown; reason?: unknown; remark?: unknown; employeeId?: unknown; employeeEmail?: unknown; employeeName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const poNumber = body.poNumber;
  if (poNumber == null || !/^\d+$/.test(String(poNumber))) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'A cancellation reason is required' }, { status: 400 });
  }
  // Optional free-text remark from the operator → stored on the PO.
  const remark = typeof body.remark === 'string' && body.remark.trim() ? body.remark.trim() : null;
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : null;
  const employeeEmail = typeof body.employeeEmail === 'string' ? body.employeeEmail : null;
  const fallbackName = typeof body.employeeName === 'string' ? body.employeeName : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve the operator from employeeBase, matching on their logged-in
    // email first (the id in localStorage is an auth user id, not the employee
    // record's employeeId). We stamp this employeeId + role onto the PO as the
    // modifier; the name is kept for the audit response.
    let employeeName = fallbackName;
    let modifiedById: string | null = employeeId;
    let modifiedByRole = 'dashboard';
    if (employeeId || employeeEmail) {
      const emp = await client.query<{ employeeId: string | null; name: string | null; role: string | null }>(
        `SELECT "employeeId", "name", "role"
           FROM "employeeBase"."employee"
          WHERE "email" = $2 OR "employeeId" = $1
          ORDER BY CASE WHEN "email" = $2 THEN 0 ELSE 1 END
          LIMIT 1`,
        [employeeId, employeeEmail],
      );
      const e = emp.rows[0];
      if (e?.name) employeeName = e.name;
      if (e?.employeeId) modifiedById = e.employeeId;
      if (e?.role) modifiedByRole = e.role;
    }

    // Lock the PO row first. (FOR UPDATE can't be combined with GROUP BY, so
    // the amount-recompute check runs as a separate aggregate below — the row
    // is already locked, so the value can't change underneath us.)
    const lock = await client.query<{ id: string; status: string }>(
      `SELECT po."id" AS id, po."status" AS status
         FROM "purchaseOrder"."purchaseOrder" po
        WHERE po."poNumber" = $1::int
          AND po."status" <> 'DRAFT'
        FOR UPDATE OF po`,
      [String(poNumber)],
    );

    if (lock.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    }
    const { id, status } = lock.rows[0];

    // Would the BEFORE-UPDATE amount recompute change po.amount? If so, a
    // cancel would trip the refund trigger — refuse (see header comment).
    const amt = await client.query<{ wouldChangeAmount: boolean }>(
      `SELECT ( COALESCE(po."amount", 0) IS DISTINCT FROM
                ROUND( COALESCE(SUM(poi."total"), 0)
                       - (COALESCE(SUM(poi."discount"), 0) + COALESCE(po."discount", 0)), 2)
              ) AS "wouldChangeAmount"
       FROM "purchaseOrder"."purchaseOrder" po
       LEFT JOIN "purchaseOrder"."purchaseOrderItem" poi
              ON poi."purchaseOrderId" = po."id"
             AND poi."isArchived" = FALSE
             AND poi."status" <> 'REJECTED'
             AND poi."unitPrice" <> 0
       WHERE po."id" = $1
       GROUP BY po."id", po."amount", po."discount"`,
      [id],
    );
    const wouldChangeAmount = amt.rows[0]?.wouldChangeAmount ?? false;

    if (status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is already CANCELLED` }, { status: 409 });
    }
    if (status === 'REJECTED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is REJECTED and cannot be cancelled` }, { status: 409 });
    }
    if (wouldChangeAmount) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `Cancel blocked for PO ${poNumber}: its stored amount is out of sync with its items, so cancelling would recompute amount and trigger a refund. Please use the main-app flow for this PO.` },
        { status: 409 },
      );
    }

    // For cancel: the operator's free-text remark is the cancelReason (falls
    // back to the picked reason if no remark was entered); the picked reason is
    // preserved in reasonAddedByBadhoTeam.
    const upd = await client.query<{ poNumber: string; status: string; markedCancelledTime: string }>(
      `UPDATE "purchaseOrder"."purchaseOrder"
          SET "status"              = 'CANCELLED',
              "cancelReason"        = $2,
              "markedCancelledTime" = NOW(),
              "modifiedById"        = $3,
              "modifiedByRole"      = $4,
              "reasonAddedByBadhoTeam" = $5,
              "updated_at"          = NOW()
        WHERE "id" = $1
        RETURNING "poNumber"::text AS "poNumber", "status", "markedCancelledTime"`,
      [id, remark ?? reason, modifiedById, modifiedByRole, reason],
    );

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'cancel was silently rejected by a DB trigger' }, { status: 422 });
    }

    // Propagate to the order's line items — cancelling a PO should cancel all of
    // its (non-archived) items. A status-only change doesn't fire the amount
    // trigger (no recompute/refund) and the item status-change trigger is a
    // no-op for CANCELLED. (purchaseOrderItem has no markedCancelledTime column.)
    const itemUpd = await client.query(
      `UPDATE "purchaseOrder"."purchaseOrderItem"
          SET "status"         = 'CANCELLED',
              "modifiedById"   = $2,
              "modifiedByRole" = $3
        WHERE "purchaseOrderId" = $1
          AND COALESCE("isArchived", FALSE) = FALSE
          AND "status" <> 'CANCELLED'`,
      [id, modifiedById, modifiedByRole],
    );

    await client.query('COMMIT');

    return NextResponse.json({
      ok: true,
      poNumber: String(poNumber),
      status: upd.rows[0].status,
      cancelReason: reason,
      markedCancelledTime: upd.rows[0].markedCancelledTime,
      by: employeeName,
      itemsCancelled: itemUpd.rowCount ?? 0,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
