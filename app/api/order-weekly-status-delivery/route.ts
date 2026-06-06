import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  delivery_status: string | null;
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
    const sql = `
      SELECT
        po."status"                                                  AS status,
        po."deliveryStatus"                                          AS delivery_status,
        EXTRACT(WEEK FROM po."markedPendingTime")::int               AS week,
        TO_CHAR(DATE_TRUNC('week', po."markedPendingTime"), 'DD Mon') AS week_start,
        COUNT(*)                                                     AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text                 AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
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
        AND po."status" != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${monthsFilter}
      GROUP BY po."status", po."deliveryStatus", EXTRACT(WEEK FROM po."markedPendingTime"), DATE_TRUNC('week', po."markedPendingTime")
      ORDER BY status, delivery_status NULLS LAST, week;
    `;
    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    interface DeliveryAgg { deliveryStatus: string | null; weeks: Record<number, Cell>; total: Cell; }
    interface StatusAgg { status: string; weeks: Record<number, Cell>; total: Cell; deliveryStatuses: Map<string, DeliveryAgg>; }

    const statusMap = new Map<string, StatusAgg>();
    const byWeek: Record<number, Cell> = {};
    const weekStartLabels: Record<number, string> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const week = parseInt(String(r.week));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      let s = statusMap.get(r.status);
      if (!s) { s = { status: r.status, weeks: {}, total: { count: 0, amount: 0 }, deliveryStatuses: new Map() }; statusMap.set(r.status, s); }
      if (!s.weeks[week]) s.weeks[week] = { count: 0, amount: 0 };
      s.weeks[week].count += count;
      s.weeks[week].amount += amount;
      s.total.count += count;
      s.total.amount += amount;

      const dk = r.delivery_status ?? '__NULL__';
      let d = s.deliveryStatuses.get(dk);
      if (!d) { d = { deliveryStatus: r.delivery_status, weeks: {}, total: { count: 0, amount: 0 } }; s.deliveryStatuses.set(dk, d); }
      d.weeks[week] = { count, amount };
      d.total.count += count;
      d.total.amount += amount;

      if (!byWeek[week]) byWeek[week] = { count: 0, amount: 0 };
      byWeek[week].count += count;
      byWeek[week].amount += amount;
      weekStartLabels[week] = r.week_start;
      grand.count += count;
      grand.amount += amount;
    }

    const data = Array.from(statusMap.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((s) => ({
        status: s.status,
        weeks: s.weeks,
        total: s.total,
        deliveryStatuses: Array.from(s.deliveryStatuses.values()).sort((a, b) => b.total.count - a.total.count),
      }));

    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

    return NextResponse.json({ data, weeks, weekStartLabels, totals: { byWeek, grand }, year, query: sql.trim(), queryParams: params, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
