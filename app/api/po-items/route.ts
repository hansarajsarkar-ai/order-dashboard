import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  brandSKUId: string;
  skuLabel: string | null;
  brandLabel: string | null;
  status: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  unitPrice: string | null;
  discount: string | null;
  amount: string | null;
  total: string | null;
  isAccepted: boolean | null;
  isRejected: boolean | null;
  rejectedComment: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber) {
    return NextResponse.json({ error: 'poNumber required' }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        poi."id"                          AS "id",
        poi."brandSKUId"                  AS "brandSKUId",
        bsku."label"                      AS "skuLabel",
        bsku."brandLabel"                 AS "brandLabel",
        poi."status"                      AS "status",
        poi."quantity"                    AS "quantity",
        poi."quantityUnit"                AS "quantityUnit",
        poi."unitPrice"::text             AS "unitPrice",
        poi."discount"::text              AS "discount",
        poi."amount"::text                AS "amount",
        poi."total"::text                 AS "total",
        poi."isAccepted"                  AS "isAccepted",
        poi."isRejected"                  AS "isRejected",
        poi."rejectedComment"             AS "rejectedComment"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "purchaseOrder"."purchaseOrderItem" poi
             ON poi."purchaseOrderId" = po."id"
      LEFT JOIN "brands"."brandSKU" bsku
             ON bsku."id" = poi."brandSKUId"
      WHERE po."poNumber"::text = $1
        AND COALESCE(poi."isArchived", FALSE) = FALSE
      ORDER BY poi."created_at" ASC;
    `;

    const rows = await query<Row>(sql, [poNumber]);

    const data = rows.map((r) => ({
      id: r.id,
      brandSKUId: r.brandSKUId,
      skuLabel: r.skuLabel,
      brandLabel: r.brandLabel,
      status: r.status,
      quantity: r.quantity,
      quantityUnit: r.quantityUnit,
      unitPrice: r.unitPrice != null ? parseFloat(r.unitPrice) : null,
      discount: r.discount != null ? parseFloat(r.discount) : null,
      amount: r.amount != null ? parseFloat(r.amount) : null,
      total: r.total != null ? parseFloat(r.total) : null,
      isAccepted: r.isAccepted,
      isRejected: r.isRejected,
      rejectedComment: r.rejectedComment,
    }));

    const totals = data.reduce(
      (acc, r) => ({
        items: acc.items + 1,
        qty: acc.qty + (r.quantity || 0),
        amount: acc.amount + (r.amount || 0),
        total: acc.total + (r.total || 0),
      }),
      { items: 0, qty: 0, amount: 0, total: 0 }
    );

    return NextResponse.json({
      data,
      totals,
      poNumber,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
