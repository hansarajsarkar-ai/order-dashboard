import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface DraftOrderRow {
  poNumber: string | null;
  amount: string | number | null;
  status: string;
  created_at: string;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
}

const MAX_ROWS = 5000;

export async function GET() {
  try {
    const sql = `
      SELECT
        a."poNumber",
        a."amount",
        a."status",
        a."created_at",
        b."phone"        AS "buyerPhone",
        b."businessName" AS "buyerBusinessName",
        s."phone"        AS "sellerPhone",
        s."businessName" AS "sellerBusinessName"
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."buyer"  b ON b."id" = a."buyerId"
      JOIN "users"."seller" s ON s."id" = a."sellerId"
      WHERE s."isD2RBrandSeller" = TRUE
        AND a."status" = 'DRAFT'
        AND EXTRACT(YEAR FROM a."created_at") = EXTRACT(YEAR FROM CURRENT_DATE)
      ORDER BY a."created_at" DESC
      LIMIT ${MAX_ROWS + 1};
    `;

    const rows = await query<DraftOrderRow>(sql);
    const truncated = rows.length > MAX_ROWS;
    const data = truncated ? rows.slice(0, MAX_ROWS) : rows;

    return NextResponse.json({
      rows: data,
      count: data.length,
      truncated,
      maxRows: MAX_ROWS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
