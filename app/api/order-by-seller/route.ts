import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  po_number: string;
  status: string;
  amount: string;
  buyer_phone: string | null;
  buyer_business_name: string | null;
  marked_pending_time: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sellerId = searchParams.get('sellerId');

  if (!sellerId) {
    return NextResponse.json({ error: 'sellerId parameter required' }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
        po."poNumber"::text          AS po_number,
        po."status"                  AS status,
        po."amount"::text            AS amount,
        b."phone"                    AS buyer_phone,
        b."businessName"             AS buyer_business_name,
        po."markedPendingTime"       AS marked_pending_time,
        po."created_at"              AS created_at
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest" = FALSE
        AND po."isFalseOrder" = FALSE
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."status" != 'DRAFT'
        AND s."id" = $1
        AND EXTRACT(YEAR FROM po."created_at") = $2
      ORDER BY po."created_at" DESC
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, [sellerId, year]);

    const data = rows.map((r) => ({
      poNumber: r.po_number,
      status: r.status,
      amount: parseFloat(r.amount),
      buyerPhone: r.buyer_phone,
      buyerBusinessName: r.buyer_business_name,
      markedPendingTime: r.marked_pending_time,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      sellerId,
      year,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
