import { NextResponse, NextRequest } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DASHBOARD_NAME = 'Order Rejected/Cancelled';

/**
 * Reject a purchase order from the Order Rejected/Cancelled dashboard.
 *
 *   status             → 'REJECTED'
 *   rejectReason       → the reason picked in the modal
 *   markedRejectedTime → NOW()
 *   rejectedBy         → 'Support Team — <operator> (<dashboard>)'
 *
 * SAFETY. Unlike cancel, the BEFORE-UPDATE trigger handlePurchaseOrderAmount
 * does NOT recompute po.amount when NEW.status = 'REJECTED' (it explicitly
 * skips the amount line for rejected orders), so a reject never changes amount
 * and therefore never trips the refund trigger. The other status-change
 * triggers (notifications, SLA-ticket close, item-status propagation, history)
 * fire as intended for a rejection.
 */
export async function POST(req: NextRequest) {
  let body: { poNumber?: unknown; reason?: unknown; employeeId?: unknown; employeeEmail?: unknown; employeeName?: unknown };
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
    return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 });
  }
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
    // modifier, and use the name for the auditable rejectedBy string.
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

    const chk = await client.query<{ id: string; status: string }>(
      `SELECT po."id" AS id, po."status" AS status
         FROM "purchaseOrder"."purchaseOrder" po
        WHERE po."poNumber" = $1::int
          AND po."status" <> 'DRAFT'
        FOR UPDATE OF po`,
      [String(poNumber)],
    );

    if (chk.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    }
    const { id, status } = chk.rows[0];

    if (status === 'REJECTED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is already REJECTED` }, { status: 409 });
    }
    if (status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `PO ${poNumber} is CANCELLED and cannot be rejected` }, { status: 409 });
    }

    const operator = employeeName && employeeName.trim() ? employeeName.trim() : 'Unknown';
    const rejectedBy = `Support Team — ${operator} (${DASHBOARD_NAME})`;

    const upd = await client.query<{ poNumber: string; status: string; markedRejectedTime: string }>(
      `UPDATE "purchaseOrder"."purchaseOrder"
          SET "status"             = 'REJECTED',
              "rejectReason"       = $2,
              "rejectedBy"         = $3,
              "markedRejectedTime" = NOW(),
              "modifiedById"       = $4,
              "modifiedByRole"     = $5,
              "updated_at"         = NOW()
        WHERE "id" = $1
        RETURNING "poNumber"::text AS "poNumber", "status", "markedRejectedTime"`,
      [id, reason, rejectedBy, modifiedById, modifiedByRole],
    );

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'reject was silently rejected by a DB trigger' }, { status: 422 });
    }

    await client.query('COMMIT');

    return NextResponse.json({
      ok: true,
      poNumber: String(poNumber),
      status: upd.rows[0].status,
      rejectReason: reason,
      rejectedBy,
      markedRejectedTime: upd.rows[0].markedRejectedTime,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
