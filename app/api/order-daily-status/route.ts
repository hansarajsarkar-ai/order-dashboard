import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  day: string;
  count: string;
  amount: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const month = parseInt(searchParams.get('month') || '0');

  if (!month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month parameter required (1-12)' }, { status: 400 });
  }

  try {
    const sql = `
      SELECT
        po."status"                                            AS status,
        EXTRACT(DAY FROM po."markedPendingTime")::int          AS day,
        COUNT(*)                                               AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text           AS amount
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
        AND EXTRACT(YEAR  FROM po."markedPendingTime") = $1
        AND EXTRACT(MONTH FROM po."markedPendingTime") = $2
      GROUP BY po."status", EXTRACT(DAY FROM po."markedPendingTime")
      ORDER BY status, day;
    `;

    const rows = await query<Row>(sql, [year, month]);

    type Cell = { count: number; amount: number };
    const statusMap: Record<string, Record<number, Cell>> = {};
    const byDay: Record<number, Cell> = {};
    const byStatus: Record<string, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const day = parseInt(String(r.day));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      if (!statusMap[r.status]) statusMap[r.status] = {};
      statusMap[r.status][day] = { count, amount };

      if (!byDay[day]) byDay[day] = { count: 0, amount: 0 };
      byDay[day].count += count;
      byDay[day].amount += amount;

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
      days: statusMap[status],
      total: byStatus[status],
    }));

    // Number of days in the requested month
    const daysInMonth = new Date(year, month, 0).getDate();

    return NextResponse.json({
      data,
      totals: { byDay, byStatus, grand },
      year,
      month,
      daysInMonth,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
