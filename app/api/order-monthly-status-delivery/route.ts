import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  delivery_status: string | null;
  month: string;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const params: (string | number)[] = [year];
    const monthsFilter = appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);
    const sql = `
      SELECT
        po."status"                                    AS status,
        po."deliveryStatus"                            AS delivery_status,
        EXTRACT(MONTH FROM po."markedPendingTime")::int AS month,
        COUNT(*)                                       AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text   AS amount
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
      GROUP BY po."status", po."deliveryStatus", EXTRACT(MONTH FROM po."markedPendingTime")
      ORDER BY status, delivery_status NULLS LAST, month;
    `;

    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    interface DeliveryAgg {
      deliveryStatus: string | null;
      months: Record<number, Cell>;
      total: Cell;
    }
    interface StatusAgg {
      status: string;
      months: Record<number, Cell>;
      total: Cell;
      deliveryStatuses: Map<string, DeliveryAgg>;
    }

    const statusMap = new Map<string, StatusAgg>();
    const byMonth: Record<number, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const status = r.status;
      const delivery = r.delivery_status; // can be null
      const month = parseInt(String(r.month));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      let s = statusMap.get(status);
      if (!s) {
        s = { status, months: {}, total: { count: 0, amount: 0 }, deliveryStatuses: new Map() };
        statusMap.set(status, s);
      }
      // status-level rollup
      if (!s.months[month]) s.months[month] = { count: 0, amount: 0 };
      s.months[month].count += count;
      s.months[month].amount += amount;
      s.total.count += count;
      s.total.amount += amount;

      // delivery-status child
      const deliveryKey = delivery ?? '__NULL__';
      let d = s.deliveryStatuses.get(deliveryKey);
      if (!d) {
        d = { deliveryStatus: delivery, months: {}, total: { count: 0, amount: 0 } };
        s.deliveryStatuses.set(deliveryKey, d);
      }
      d.months[month] = { count, amount };
      d.total.count += count;
      d.total.amount += amount;

      // month + grand totals
      if (!byMonth[month]) byMonth[month] = { count: 0, amount: 0 };
      byMonth[month].count += count;
      byMonth[month].amount += amount;
      grand.count += count;
      grand.amount += amount;
    }

    // Serialize: sort statuses by total count desc; within each, sort delivery statuses by count desc.
    const data = Array.from(statusMap.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((s) => ({
        status: s.status,
        months: s.months,
        total: s.total,
        deliveryStatuses: Array.from(s.deliveryStatuses.values()).sort(
          (a, b) => b.total.count - a.total.count
        ),
      }));

    return NextResponse.json({
      data,
      totals: { byMonth, grand },
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
