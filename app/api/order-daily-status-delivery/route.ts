import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  delivery_status: string | null;
  day: string;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
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
        po."deliveryStatus"                                    AS delivery_status,
        EXTRACT(DAY FROM po."markedPendingTime")::int          AS day,
        COUNT(*)                                               AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text           AS amount
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
        AND EXTRACT(YEAR  FROM po."markedPendingTime") = $1
        AND EXTRACT(MONTH FROM po."markedPendingTime") = $2
      GROUP BY po."status", po."deliveryStatus", EXTRACT(DAY FROM po."markedPendingTime")
      ORDER BY status, delivery_status NULLS LAST, day;
    `;
    const rows = await query<Row>(sql, [year, month]);

    type Cell = { count: number; amount: number };
    interface DeliveryAgg { deliveryStatus: string | null; days: Record<number, Cell>; total: Cell; }
    interface StatusAgg { status: string; days: Record<number, Cell>; total: Cell; deliveryStatuses: Map<string, DeliveryAgg>; }

    const statusMap = new Map<string, StatusAgg>();
    const byDay: Record<number, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const day = parseInt(String(r.day));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      let s = statusMap.get(r.status);
      if (!s) { s = { status: r.status, days: {}, total: { count: 0, amount: 0 }, deliveryStatuses: new Map() }; statusMap.set(r.status, s); }
      if (!s.days[day]) s.days[day] = { count: 0, amount: 0 };
      s.days[day].count += count;
      s.days[day].amount += amount;
      s.total.count += count;
      s.total.amount += amount;

      const dk = r.delivery_status ?? '__NULL__';
      let d = s.deliveryStatuses.get(dk);
      if (!d) { d = { deliveryStatus: r.delivery_status, days: {}, total: { count: 0, amount: 0 } }; s.deliveryStatuses.set(dk, d); }
      d.days[day] = { count, amount };
      d.total.count += count;
      d.total.amount += amount;

      if (!byDay[day]) byDay[day] = { count: 0, amount: 0 };
      byDay[day].count += count;
      byDay[day].amount += amount;
      grand.count += count;
      grand.amount += amount;
    }

    const data = Array.from(statusMap.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((s) => ({
        status: s.status,
        days: s.days,
        total: s.total,
        deliveryStatuses: Array.from(s.deliveryStatuses.values()).sort((a, b) => b.total.count - a.total.count),
      }));

    const daysInMonth = new Date(year, month, 0).getDate();

    return NextResponse.json({ data, totals: { byDay, grand }, year, month, daysInMonth, query: sql.trim(), queryParams: [year, month], timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
