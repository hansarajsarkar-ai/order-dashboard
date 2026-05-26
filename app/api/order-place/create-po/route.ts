import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireAuth, resolveActiveEmployee, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Creates a new DRAFT purchaseOrder row that the rest of the dashboard
// (PoItemsModal, AddProductPanel, place-order) can then drive. The
// purchaseOrder.handlePurchaseOrderMetaDetails BEFORE INSERT trigger
// auto-populates buyer/seller pincode/city/state/district, deliveryType,
// deliveryNetwork, isTest, distance, and lastCheckinId from the
// referenced rows — so we only need to supply buyerId + sellerId.
//
// We re-validate the seller against the live-D2R-brand gate here, not
// just trust the client, so a stale UI can't slip a non-D2R seller
// through. Buyer is validated as a real, non-test row. The caller's
// email is read off the JWT and looked up in employeeBase.employee so
// we can stamp createdById (and modifiedById) with the actual dashboard
// user — that flows downstream into PO history + ownership reports.

export async function POST(req: NextRequest) {
  // Auth first: any thrown AuthError becomes a 401/403 with the message
  // we set, so callers can show a sensible error in the create dialog.
  let employeeId: string;
  let employeeEmail: string;
  try {
    const claims = requireAuth(req);
    const emp = await resolveActiveEmployee(claims.email);
    employeeId = emp.employeeId;
    employeeEmail = emp.email;
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

  const buyerId  = String(body.buyerId  ?? '').trim();
  const sellerId = String(body.sellerId ?? '').trim();
  if (!buyerId || !sellerId) {
    return NextResponse.json({ error: 'buyerId and sellerId are required' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    // Buyer must exist and not be a test buyer.
    const buyer = await client.query<{ id: string }>(
      `SELECT "id"::text AS id
         FROM "users"."buyer"
        WHERE "id" = $1
          AND COALESCE("isTest", FALSE) = FALSE
        LIMIT 1;`,
      [buyerId],
    );
    if (buyer.rowCount === 0) {
      return NextResponse.json({ error: 'buyer not found or marked as test' }, { status: 404 });
    }

    // Seller must pass the live-D2R-brand filter (same as live_brands CTE
    // elsewhere). Without this gate the seller-skus picker would render
    // empty for an "invalid" seller and the user would see a draft they
    // can't fill.
    const seller = await client.query<{ id: string }>(
      `
      SELECT a."id"::text AS id
        FROM "users"."seller" a
        JOIN "users"."seller_brand" b ON b."sellerId" = a."id"
       WHERE a."id"                = $1
         AND a."isD2RBrandSeller"  = TRUE
         AND a."isActive"          = TRUE
         AND a."deliveryType"      = 'INTERCITY'
         AND a."deliveryNetwork"   = 'THIRD_PARTY'
         AND a."pickupAddressName" IS NOT NULL
         AND a."isTest"            = FALSE
         AND a."businessName"      NOT ILIKE '%test%'
         AND a."businessName"      NOT ILIKE '%milko%'
         AND b."isActive"          = TRUE
         AND b."fulfilmentZone"    IS NOT NULL
         AND b."fulfilmentZone"::text != '[]'
       LIMIT 1;
      `,
      [sellerId],
    );
    if (seller.rowCount === 0) {
      return NextResponse.json(
        { error: 'seller is not a live D2R brand-seller (failed live-brand gate)' },
        { status: 422 },
      );
    }

    // The trigger fills city/state/district/employee/lat/lng/deliveryType
    // etc. from the buyer/seller rows; status defaults to DRAFT. We also
    // stamp createdById + modifiedById with the dashboard user's
    // employeeId so the PO carries provenance through to history rows.
    const inserted = await client.query<{ poNumber: string; id: string }>(
      `
      INSERT INTO "purchaseOrder"."purchaseOrder" (
        "buyerId", "sellerId",
        "createdBy", "createdById",
        "modifiedById", "modifiedByRole"
      ) VALUES ($1, $2, 'dashboard', $3, $3, 'dashboard')
      RETURNING "poNumber"::text AS "poNumber", "id"::text AS id;
      `,
      [buyerId, sellerId, employeeId],
    );

    return NextResponse.json({
      poNumber:  inserted.rows[0].poNumber,
      poId:      inserted.rows[0].id,
      createdBy: { employeeId, email: employeeEmail },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
