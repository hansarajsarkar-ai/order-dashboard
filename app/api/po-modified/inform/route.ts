import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Write a "buyer informed" remark onto purchaseOrder.poModifiedBuyerInformed for
 * one PO, from the PO Modified dashboard. The editing employee is matched in
 * employeeBase.employee and their name is stamped onto the saved value.
 *
 * SAFETY: purchaseOrder has an unconditional BEFORE-UPDATE trigger that
 * recomputes `amount` from items; if the recompute changed `amount` it would
 * chain into the refund trigger. We therefore refuse the write whenever the
 * recompute would change `amount` (status<>REJECTED AND amount<>itemTotal-discount).
 * Verified: for all current modified POs the recompute is a no-op, so this never
 * blocks a legitimate write — it only guards against an out-of-sync edge case.
 */

export async function POST(req: NextRequest) {
  let body: { poNumber?: unknown; text?: unknown; employeeId?: unknown; employeeEmail?: unknown; employeeName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const poNumber = body.poNumber;
  if (poNumber == null || !/^\d+$/.test(String(poNumber))) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : null;
  const employeeEmail = typeof body.employeeEmail === 'string' ? body.employeeEmail : null;
  const fallbackName = typeof body.employeeName === 'string' ? body.employeeName : null;

  try {
    // 1. Match the editor in employeeBase.employee → canonical name.
    let employeeName = fallbackName;
    if (employeeId || employeeEmail) {
      const emp = await query<{ name: string | null }>(
        `SELECT "name" FROM "employeeBase"."employee" WHERE "employeeId" = $1 OR "email" = $2 LIMIT 1`,
        [employeeId, employeeEmail]
      );
      if (emp[0]?.name) employeeName = emp[0].name;
    }

    // 2. Locate the PO and check whether an update would change `amount`.
    const chk = await query<{ id: string; wouldChange: boolean }>(
      `SELECT po."id" AS id,
              (po."status" <> 'REJECTED'
               AND po."amount" IS DISTINCT FROM
                   ROUND(COALESCE(SUM(poi."total"), 0)
                         - (COALESCE(SUM(poi."discount"), 0) + COALESCE(po."discount", 0)), 2)
              ) AS "wouldChange"
       FROM "purchaseOrder"."purchaseOrder" po
       LEFT JOIN "purchaseOrder"."purchaseOrderItem" poi
              ON poi."purchaseOrderId" = po."id"
             AND poi."isArchived" = FALSE
             AND poi."status" <> 'REJECTED'
             AND poi."unitPrice" <> 0
       WHERE po."poNumber" = $1
       GROUP BY po."id", po."amount", po."status", po."discount"`,
      [Number(poNumber)]
    );
    if (!chk[0]) return NextResponse.json({ error: `PO ${poNumber} not found` }, { status: 404 });
    if (chk[0].wouldChange) {
      return NextResponse.json(
        { error: `Write blocked for PO ${poNumber}: its stored amount is out of sync with item total, so an update would recompute amount and risk a refund. Please use the main-app flow for this PO.` },
        { status: 409 }
      );
    }

    // 3. Stamp the value with the editor's name + IST timestamp, then write.
    const at = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const value = text ? `${text} — ${employeeName ?? 'Unknown'} (${at})` : null;

    await query(
      `UPDATE "purchaseOrder"."purchaseOrder" SET "poModifiedBuyerInformed" = $1 WHERE "id" = $2`,
      [value, chk[0].id]
    );

    return NextResponse.json({ ok: true, poNumber: String(poNumber), value, by: employeeName, at });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
