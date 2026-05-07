import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const GOAL = 10000000;

interface Row {
  achieved: string;
  orders: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
        COALESCE(SUM(po."amount"::numeric), 0)::text AS achieved,
        COUNT(*)::text AS orders
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
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND EXTRACT(YEAR FROM po."created_at") = $1;
    `;

    const rows = await query<Row>(sql, [year]);
    const achieved = parseFloat(rows[0]?.achieved || '0');
    const orders = parseInt(rows[0]?.orders || '0');
    const goal = GOAL;
    const achievePct = goal > 0 ? (achieved / goal) * 100 : 0;
    const remaining = Math.max(goal - achieved, 0);

    return NextResponse.json({
      year,
      goal,
      achieved,
      orders,
      remaining,
      achievePct: parseFloat(achievePct.toFixed(2)),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
