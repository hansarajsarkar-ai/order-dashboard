import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KAPILA_BRAND_ID = '7dae193a-96a1-4495-a9da-e2316fc0c2c7';

type Granularity = 'day' | 'month' | 'year';

interface Row {
  status: string;
  period: string;
  total_po: string;
  total_amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId') || KAPILA_BRAND_ID;
  const gRaw = (searchParams.get('granularity') || 'year').toLowerCase();
  const granularity: Granularity =
    gRaw === 'day' ? 'day' : gRaw === 'month' ? 'month' : 'year';

  // periodExpr: SQL fragment producing the column-bucket value as text.
  // dateFilter:  optional SQL fragment limiting the date range (day view only).
  let periodExpr: string;
  let dateFilter = '';
  if (granularity === 'day') {
    periodExpr = `po."created_at"::date::text`;
    // 90-day window for day view — keeps the column count manageable.
    dateFilter = `AND po."created_at" >= (CURRENT_DATE - INTERVAL '90 days')`;
  } else if (granularity === 'month') {
    periodExpr = `to_char(po."created_at", 'YYYY-MM')`;
  } else {
    periodExpr = `EXTRACT(YEAR FROM po."created_at")::int::text`;
  }

  try {
    const sql = `
      SELECT
        CASE WHEN po."status" IN ('COMPLETED','DELIVERED') THEN 'COMPLETED'
             ELSE po."status" END                         AS status,
        ${periodExpr}                                     AS period,
        COUNT(DISTINCT po."poNumber")                     AS total_po,
        COALESCE(SUM(poi."amount"::numeric), 0)::text     AS total_amount
      FROM "purchaseOrder"."purchaseOrderItem" poi
      JOIN "purchaseOrder"."purchaseOrder" po ON poi."purchaseOrderId" = po."id"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE poi."brandId"                  = $1
        AND poi."status"                  != 'DRAFT'
        AND poi."comboBrandSKUPOItemId"   IS NULL
        AND po."status"                   != 'DRAFT'
        AND po."isTest"                    = FALSE
        AND po."isFalseOrder"              = FALSE
        AND b."isTest"                     = FALSE
        AND s."isTest"                     = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."businessName" NOT ILIKE '%test%'
        ${dateFilter}
      GROUP BY 1, ${periodExpr}
      ORDER BY ${periodExpr} DESC, status;
    `;

    const rows = await query<Row>(sql, [brandId]);

    type Cell = { count: number; amount: number };
    const statusMap: Record<string, Record<string, Cell>> = {};
    const byPeriod: Record<string, Cell> = {};
    const byStatus: Record<string, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const status = r.status;
      const period = r.period;
      const count = parseInt(r.total_po, 10) || 0;
      const amount = parseFloat(r.total_amount) || 0;

      if (!statusMap[status]) statusMap[status] = {};
      statusMap[status][period] = { count, amount };

      if (!byPeriod[period]) byPeriod[period] = { count: 0, amount: 0 };
      byPeriod[period].count += count;
      byPeriod[period].amount += amount;

      if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
      byStatus[status].count += count;
      byStatus[status].amount += amount;

      grand.count += count;
      grand.amount += amount;
    }

    const periods = Object.keys(byPeriod).sort((a, b) => (a < b ? 1 : -1));
    const statuses = Object.keys(byStatus).sort(
      (a, b) => byStatus[b].amount - byStatus[a].amount
    );

    const data = statuses.map((status) => ({
      status,
      cells: statusMap[status],
      total: byStatus[status],
    }));

    return NextResponse.json({
      data,
      periods,
      granularity,
      totals: { byPeriod, grand },
      brandId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
