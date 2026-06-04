import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_GOAL = 10000000;
const GOAL_OVERRIDES: Record<string, number> = {
  '2026-6': 3000000,
};
const goalFor = (year: number, month: number) =>
  GOAL_OVERRIDES[`${year}-${month}`] ?? DEFAULT_GOAL;

interface Row {
  achieved: string;
  orders: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const monthParam = searchParams.get('month');
  const month = monthParam !== null && monthParam !== '' && monthParam !== 'all'
    ? parseInt(monthParam)
    : currentMonth;

  try {
    const sql = `
      SELECT
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text AS achieved,
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
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        AND EXTRACT(MONTH FROM po."markedPendingTime") = $2;
    `;

    const rows = await query<Row>(sql, [year, month]);
    const achieved = parseFloat(rows[0]?.achieved || '0');
    const orders = parseInt(rows[0]?.orders || '0');
    const goal = goalFor(year, month);
    const achievePct = goal > 0 ? (achieved / goal) * 100 : 0;
    const remaining = Math.max(goal - achieved, 0);

    return NextResponse.json({
      year,
      month,
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
