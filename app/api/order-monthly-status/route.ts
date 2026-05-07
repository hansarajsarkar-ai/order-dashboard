import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface MonthlyStatusRow {
  status: string;
  month: string;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
        po."status" AS status,
        EXTRACT(MONTH FROM po."created_at")::int AS month,
        COUNT(*) AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS amount
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
        AND EXTRACT(YEAR FROM po."created_at") = $1
      GROUP BY po."status", EXTRACT(MONTH FROM po."created_at")
      ORDER BY status, month;
    `;

    const rows = await query<MonthlyStatusRow>(sql, [year]);

    // Pivot data into status -> month -> {count, amount}
    const statusMap: Record<string, Record<number, { count: number; amount: number }>> = {};
    const totals = {
      byMonth: {} as Record<number, { count: number; amount: number }>,
      byStatus: {} as Record<string, { count: number; amount: number }>,
      grand: { count: 0, amount: 0 },
    };

    for (const r of rows) {
      const status = r.status;
      const month = parseInt(String(r.month));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      if (!statusMap[status]) statusMap[status] = {};
      statusMap[status][month] = { count, amount };

      if (!totals.byMonth[month]) totals.byMonth[month] = { count: 0, amount: 0 };
      totals.byMonth[month].count += count;
      totals.byMonth[month].amount += amount;

      if (!totals.byStatus[status]) totals.byStatus[status] = { count: 0, amount: 0 };
      totals.byStatus[status].count += count;
      totals.byStatus[status].amount += amount;

      totals.grand.count += count;
      totals.grand.amount += amount;
    }

    const statuses = Object.keys(statusMap).sort(
      (a, b) => totals.byStatus[b].count - totals.byStatus[a].count
    );

    const data = statuses.map((status) => ({
      status,
      months: statusMap[status],
      total: totals.byStatus[status],
    }));

    return NextResponse.json({
      data,
      totals,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
