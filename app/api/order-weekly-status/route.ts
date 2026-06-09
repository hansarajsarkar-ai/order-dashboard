import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  week: string;
  week_start: string;
  count: string;
  amount: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const params: (string | number)[] = [year];
    const monthsFilter = appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);
    // Postgres EXTRACT(WEEK ...) uses ISO 8601 — Monday start, week 1 contains
    // the first Thursday of the year.
    const sql = `
      SELECT
        po."status"                                                  AS status,
        EXTRACT(WEEK FROM po."markedPendingTime")::int               AS week,
        TO_CHAR(
          DATE_TRUNC('week', po."markedPendingTime"),
          'DD Mon'
        )                                                            AS week_start,
        COUNT(*)                                                     AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text                 AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${monthsFilter}
      GROUP BY po."status", EXTRACT(WEEK FROM po."markedPendingTime"),
               DATE_TRUNC('week', po."markedPendingTime")
      ORDER BY status, week;
    `;

    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    const statusMap: Record<string, Record<number, Cell>> = {};
    const byWeek: Record<number, Cell> = {};
    const byStatus: Record<string, Cell> = {};
    const weekStartLabels: Record<number, string> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const week = parseInt(String(r.week));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      if (!statusMap[r.status]) statusMap[r.status] = {};
      statusMap[r.status][week] = { count, amount };
      weekStartLabels[week] = r.week_start;

      if (!byWeek[week]) byWeek[week] = { count: 0, amount: 0 };
      byWeek[week].count += count;
      byWeek[week].amount += amount;

      if (!byStatus[r.status]) byStatus[r.status] = { count: 0, amount: 0 };
      byStatus[r.status].count += count;
      byStatus[r.status].amount += amount;

      grand.count += count;
      grand.amount += amount;
    }

    const statuses = Object.keys(statusMap).sort(
      (a, b) => byStatus[b].count - byStatus[a].count
    );

    const data = statuses.map((status) => ({
      status,
      weeks: statusMap[status],
      total: byStatus[status],
    }));

    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

    return NextResponse.json({
      data,
      weeks,
      weekStartLabels,
      totals: { byWeek, byStatus, grand },
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
