import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumberParam = searchParams.get('poNumber');
  if (!poNumberParam || !/^\d+$/.test(poNumberParam)) {
    return NextResponse.json({ error: 'poNumber (numeric) is required' }, { status: 400 });
  }

  try {
    const summarySql = `
      SELECT
        a."id"::text                                       AS "poId",
        a."poNumber"                                       AS "poNumber",
        a."amount"::text                                   AS "amount",
        a."status"                                         AS "status",
        a."created_at"                                     AS "created_at",
        b."businessName"                                   AS "buyerBusinessName",
        b."phone"                                          AS "buyerPhone",
        s."businessName"                                   AS "sellerBusinessName",
        s."phone"                                          AS "sellerPhone"
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."buyer"  b ON b."id" = a."buyerId"
      JOIN "users"."seller" s ON s."id" = a."sellerId"
      WHERE a."poNumber"::text = $1
      LIMIT 1;
    `;

    const summaryRows = await query<PoSummaryRow>(summarySql, [poNumberParam]);
    const po = summaryRows[0];
    if (!po) {
      return NextResponse.json({ error: `PO ${poNumberParam} not found` }, { status: 404 });
    }

    const itemsSql = `
      SELECT
        poi."id"::text                                     AS "itemId",
        poi."brandSKUId"::text                             AS "brandSKUId",
        bs."label"                                         AS "skuLabel",
        bra."label"                                        AS "brandLabel",
        (bs."brandSKUDataJSON" ->> 'size')                 AS "size",
        poi."quantity"::text                               AS "quantity",
        poi."unitPrice"::text                              AS "unitPrice",
        poi."amount"::text                                 AS "amount",
        poi."status"                                       AS "status"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      LEFT JOIN "brands"."brandSKU" bs  ON bs."id"  = poi."brandSKUId"
      LEFT JOIN "brands"."brand"    bra ON bra."id" = bs."brandId"
      WHERE poi."purchaseOrderId" = $1
      ORDER BY poi."amount"::numeric DESC NULLS LAST, poi."id";
    `;

    const items = await query<PoItemRow>(itemsSql, [po.poId]);

    return NextResponse.json({
      po,
      items,
      itemCount: items.length,
      totalQuantity: items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0),
      totalItemAmount: items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
