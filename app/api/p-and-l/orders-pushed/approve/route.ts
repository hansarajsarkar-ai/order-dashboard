import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireAuth, resolveActiveEmployee, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Bulk-approve the "Orders Pushed" P&L feed.
//
// The dashboard sends the purchaseOrderId(s) to approve and we stamp
// purchaseOrder.isApproved (a free-text column, NULL on every row until now)
// with "true | <approver email> | <ISO timestamp>" so the flag also records
// WHO approved and WHEN. The approver email comes from the verified JWT →
// employeeBase.employee lookup, never from the client body, so it can't be spoofed.
//
// Safety note (purchaseOrder has ~30 triggers): an isApproved-only UPDATE is
// safe. The BEFORE trigger recomputes amount idempotently from the unchanged
// items; every notification/reward/status trigger is either scoped
// `AFTER UPDATE OF <other column>` or guards on `OLD.status = NEW.status`, so
// none fire on this write. We additionally bound the UPDATE to the three pushed
// statuses so a stale client can never flip a completed/settled order.
const APPROVABLE_STATUSES = ['PENDING', 'INPROGRESS', 'DISPATCHED'];

export async function POST(req: NextRequest) {
  // Auth first — the approver email is derived here, authoritatively (the email
  // used to open the dashboard, looked back up against employeeBase.employee).
  let approver: string;
  try {
    const claims = requireAuth(req);
    const emp = await resolveActiveEmployee(claims.email);
    approver = emp.email;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const ids = Array.isArray(body.purchaseOrderIds)
    ? Array.from(new Set(body.purchaseOrderIds.map((v) => String(v ?? '').trim()).filter(Boolean)))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'purchaseOrderIds[] is required' }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const value = `true | ${approver} | ${timestamp}`;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<{ poNumber: number }>(
      `UPDATE "purchaseOrder"."purchaseOrder"
          SET "isApproved" = $1
        WHERE "id" = ANY($2::text[])
          AND "status" = ANY($3::text[])
        RETURNING "poNumber";`,
      [value, ids, APPROVABLE_STATUSES],
    );
    return NextResponse.json({
      approved: result.rowCount ?? 0,
      requested: ids.length,
      approver,
      value,
      timestamp,
      poNumbers: result.rows.map((r) => r.poNumber),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
