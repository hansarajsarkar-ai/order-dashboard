import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight companion to the PO Modified dashboard: returns just the set of
 * PO numbers (all-time) that qualify as "modified" — i.e. a SELLER removed an
 * item or decreased its quantity on a D2R third-party INTERCITY order. Used to
 * mark those POs wherever they appear across the order dashboard. The WHERE
 * clause is kept identical to /api/po-modified so the marker only ever links to
 * POs that actually show up on that dashboard.
 */
async function handler() {
  const sql = `
    SELECT DISTINCT po."poNumber"::text AS po_number
    FROM "purchaseOrder"."purchaseOrderItem" poi
    JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = poi."purchaseOrderId"
    JOIN "users"."buyer"  b ON b."id" = po."buyerId"
    JOIN "users"."seller" s ON s."id" = po."sellerId"
    WHERE
      po."isTest" = FALSE
      AND po."isFalseOrder" = FALSE
      AND po."status" NOT IN ('DRAFT','CANCELLED')
      AND po."deliveryType" = 'INTERCITY'
      AND po."deliveryNetwork" = 'THIRD_PARTY'
      AND b."isTest" = FALSE
      AND b."businessName" NOT ILIKE '%test%'
      AND s."isTest" = FALSE
      AND s."businessName" NOT ILIKE '%test%'
      AND poi."status" <> 'DRAFT'
      AND poi."modifiedByRole" ILIKE 'seller'
      AND (
           (poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL)
        OR (poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL)
      );
  `;
  try {
    const rows = await query<{ po_number: string | null }>(sql, []);
    const data = rows.map((r) => r.po_number).filter((p): p is string => !!p);
    return NextResponse.json({ data, count: data.length, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg, data: [] }, { status: 500 });
  }
}

export const GET = handler;
