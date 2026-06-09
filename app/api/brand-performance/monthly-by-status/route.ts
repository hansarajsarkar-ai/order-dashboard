import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  delivery_status: string | null;
  month: string;
  count: string;
  amount: string;
  buyer_count: string;
}

// Monthly breakdown grouped by status (rows) × month (cols) × deliveryStatus (sub-rows).
// Optional ?brand=<brand prefix> narrows the whole pivot to one brand.
// Includes COUNT(DISTINCT buyerId) per cell so the UI can show how many unique
// buyers placed orders in each (status, month, deliveryStatus) bucket.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');

  try {
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    // brand can be a comma-separated list of brand prefixes for multi-select.
    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      SELECT
        po."status"                                              AS status,
        po."deliveryStatus"                                      AS delivery_status,
        EXTRACT(MONTH FROM po."markedPendingTime")::int          AS month,
        COUNT(*)                                                 AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text             AS amount,
        COUNT(DISTINCT po."buyerId")                             AS buyer_count
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
        AND po."status"          != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${brandFilter}
      GROUP BY po."status", po."deliveryStatus", EXTRACT(MONTH FROM po."markedPendingTime")
      ORDER BY status, delivery_status NULLS LAST, month;
    `;
    const rows = await query<Row>(sql, params);

    // Pivot
    type Cell = { count: number; amount: number; buyers: number; };
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
    const grand: Cell = { count: 0, amount: 0, buyers: 0 };
    const monthsSet = new Set<number>();

    for (const r of rows) {
      const status = r.status;
      const delivery = r.delivery_status;
      const month = parseInt(String(r.month));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);
      const buyers = parseInt(r.buyer_count);
      monthsSet.add(month);

      let s = statusMap.get(status);
      if (!s) {
        s = { status, months: {}, total: { count: 0, amount: 0, buyers: 0 }, deliveryStatuses: new Map() };
        statusMap.set(status, s);
      }
      if (!s.months[month]) s.months[month] = { count: 0, amount: 0, buyers: 0 };
      s.months[month].count += count;
      s.months[month].amount += amount;
      s.months[month].buyers += buyers; // approx — distinct-by-month-status
      s.total.count += count;
      s.total.amount += amount;
      s.total.buyers += buyers;

      const dKey = delivery ?? '__NULL__';
      let d = s.deliveryStatuses.get(dKey);
      if (!d) {
        d = { deliveryStatus: delivery, months: {}, total: { count: 0, amount: 0, buyers: 0 } };
        s.deliveryStatuses.set(dKey, d);
      }
      d.months[month] = { count, amount, buyers };
      d.total.count += count;
      d.total.amount += amount;
      d.total.buyers += buyers;

      if (!byMonth[month]) byMonth[month] = { count: 0, amount: 0, buyers: 0 };
      byMonth[month].count += count;
      byMonth[month].amount += amount;
      byMonth[month].buyers += buyers;
      grand.count += count;
      grand.amount += amount;
      grand.buyers += buyers;
    }

    const data = Array.from(statusMap.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((s) => ({
        status: s.status,
        months: s.months,
        total: s.total,
        deliveryStatuses: Array.from(s.deliveryStatuses.values()).sort((a, b) => b.total.count - a.total.count),
      }));

    const months = Array.from(monthsSet).sort((a, b) => a - b);

    return NextResponse.json({
      data,
      months,
      totals: { byMonth, grand },
      brand: brand || null,
      year,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
