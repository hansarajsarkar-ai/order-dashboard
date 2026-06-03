import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * PO Modified — item-level drill-down for a single PO.
 * Returns every item on the PO with its change type (UNCHANGED / ITEM REMOVED /
 * QUANTITY DECREASED), before/after quantity and amount. Buyer-driven item
 * changes are excluded (only seller modifications matter here).
 */

interface Row {
  productName: string | null;
  itemChangeType: string;
  prevQty: number | null;
  newQty: number | null;
  itemAmount: string | null;
  modifiedByRole: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber || !/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) required' }, { status: 400 });
  }

  const sql = `
    SELECT
      bs."label" AS "productName",
      CASE
        WHEN poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL     THEN 'ITEM REMOVED'
        WHEN poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL THEN 'QUANTITY DECREASED'
        ELSE 'UNCHANGED'
      END AS "itemChangeType",
      COALESCE((poi."originalSnapshot"->>'quantity')::int, poi."quantity") AS "prevQty",
      CASE WHEN poi."isArchived" = TRUE AND poi."originalSnapshot" IS NULL THEN 0 ELSE poi."quantity" END AS "newQty",
      CASE WHEN poi."isArchived" = TRUE AND poi."originalSnapshot" IS NULL THEN 0 ELSE poi."amount" END AS "itemAmount",
      poi."modifiedByRole" AS "modifiedByRole"
    FROM "purchaseOrder"."purchaseOrderItem" poi
    JOIN "brands"."brandSKU" bs ON bs."id" = poi."brandSKUId"
    JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = poi."purchaseOrderId"
    WHERE po."poNumber" = $1
      AND poi."status" <> 'DRAFT'
      AND NOT (
        poi."modifiedByRole" ILIKE 'buyer'
        AND (
             (poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL)
          OR (poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL)
        )
      )
    ORDER BY
      CASE
        WHEN poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL     THEN 0
        WHEN poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL THEN 1
        ELSE 2
      END,
      bs."label";
  `;

  try {
    const rows = await query<Row>(sql, [Number(poNumber)]);
    const data = rows.map((r) => ({
      productName: r.productName,
      itemChangeType: r.itemChangeType,
      prevQty: r.prevQty == null ? null : Number(r.prevQty),
      newQty: r.newQty == null ? null : Number(r.newQty),
      itemAmount: Number(r.itemAmount) || 0,
      modifiedByRole: r.modifiedByRole,
    }));
    return NextResponse.json({ poNumber, data, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
