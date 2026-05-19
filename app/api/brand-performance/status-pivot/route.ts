import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand_name: string;
  month: string;
  status: string;
  delivery_status: string | null;
  count: string;
  amount: string;
}

// 4-dim pivot: brand × month × status × deliveryStatus.
// Brand grain is the businessName prefix so ChukDe-GT + ChukDe-NonGT merge.
// The frontend lays it out as:
//   rows         = brand
//   col level 1  = month
//   col level 2  = status (collapsible to reveal level 3)
//   col level 3  = deliveryStatus (visible only for expanded statuses)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

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

    const sql = `
      SELECT
        TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) AS brand_name,
        EXTRACT(MONTH FROM po."markedPendingTime")::int          AS month,
        po."status"                                              AS status,
        po."deliveryStatus"                                      AS delivery_status,
        COUNT(*)                                                 AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text             AS amount
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
      GROUP BY TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)),
               EXTRACT(MONTH FROM po."markedPendingTime"),
               po."status", po."deliveryStatus"
      ORDER BY brand_name, month, status, delivery_status NULLS LAST;
    `;
    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    interface MonthStatusAgg {
      total: Cell;
      byDelivery: Record<string, Cell>; // key: deliveryStatus or '__NULL__'
    }
    interface BrandAgg {
      brandName: string;
      total: Cell;
      // brand[month][status] = { total, byDelivery }
      byMonth: Record<number, { total: Cell; byStatus: Record<string, MonthStatusAgg> }>;
    }

    const brands = new Map<string, BrandAgg>();
    const monthSet = new Set<number>();
    const statusColumnTotals = new Map<string, Cell>();
    const statusDeliverySet = new Map<string, Map<string, Cell>>(); // status -> deliveryKey -> total (union for expanded columns)
    const monthTotals = new Map<number, Cell>(); // column-1 totals per month
    const monthStatusTotals = new Map<string, Cell>(); // key: `${month}__${status}` for footer
    const monthStatusDeliveryTotals = new Map<string, Cell>(); // key: `${month}__${status}__${deliveryKey}` for footer when expanded
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const brandKey = r.brand_name || '(no name)';
      const month = parseInt(String(r.month));
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);
      const deliveryKey = r.delivery_status ?? '__NULL__';

      monthSet.add(month);

      // brand
      let br = brands.get(brandKey);
      if (!br) { br = { brandName: brandKey, total: { count: 0, amount: 0 }, byMonth: {} }; brands.set(brandKey, br); }
      br.total.count += count;
      br.total.amount += amount;

      // brand × month
      if (!br.byMonth[month]) br.byMonth[month] = { total: { count: 0, amount: 0 }, byStatus: {} };
      br.byMonth[month].total.count += count;
      br.byMonth[month].total.amount += amount;

      // brand × month × status
      if (!br.byMonth[month].byStatus[r.status]) br.byMonth[month].byStatus[r.status] = { total: { count: 0, amount: 0 }, byDelivery: {} };
      br.byMonth[month].byStatus[r.status].total.count += count;
      br.byMonth[month].byStatus[r.status].total.amount += amount;

      // brand × month × status × deliveryStatus
      const ds = br.byMonth[month].byStatus[r.status].byDelivery;
      if (!ds[deliveryKey]) ds[deliveryKey] = { count: 0, amount: 0 };
      ds[deliveryKey].count += count;
      ds[deliveryKey].amount += amount;

      // column-side aggregates
      const stTotal = statusColumnTotals.get(r.status) ?? { count: 0, amount: 0 };
      stTotal.count += count; stTotal.amount += amount;
      statusColumnTotals.set(r.status, stTotal);

      if (!statusDeliverySet.has(r.status)) statusDeliverySet.set(r.status, new Map());
      const dMap = statusDeliverySet.get(r.status)!;
      const dTotal = dMap.get(deliveryKey) ?? { count: 0, amount: 0 };
      dTotal.count += count; dTotal.amount += amount;
      dMap.set(deliveryKey, dTotal);

      const mTotal = monthTotals.get(month) ?? { count: 0, amount: 0 };
      mTotal.count += count; mTotal.amount += amount;
      monthTotals.set(month, mTotal);

      const msKey = `${month}__${r.status}`;
      const msTotal = monthStatusTotals.get(msKey) ?? { count: 0, amount: 0 };
      msTotal.count += count; msTotal.amount += amount;
      monthStatusTotals.set(msKey, msTotal);

      const msdKey = `${month}__${r.status}__${deliveryKey}`;
      const msdTotal = monthStatusDeliveryTotals.get(msdKey) ?? { count: 0, amount: 0 };
      msdTotal.count += count; msdTotal.amount += amount;
      monthStatusDeliveryTotals.set(msdKey, msdTotal);

      grand.count += count;
      grand.amount += amount;
    }

    const months = Array.from(monthSet).sort((a, b) => a - b);

    // Status columns: sorted by global total count DESC
    const statusColumns = Array.from(statusColumnTotals.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([status, total]) => ({
        status,
        total,
        deliveryStatuses: Array.from(statusDeliverySet.get(status)!.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([key, t]) => ({ deliveryStatus: key === '__NULL__' ? null : key, total: t })),
      }));

    const brandRows = Array.from(brands.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((br) => ({
        brandName: br.brandName,
        total: br.total,
        byMonth: br.byMonth, // raw map
      }));

    // Footer totals — serialize the maps for transit
    const monthTotalsObj: Record<number, Cell> = {};
    for (const [m, t] of monthTotals) monthTotalsObj[m] = t;
    const monthStatusTotalsObj: Record<string, Cell> = {};
    for (const [k, t] of monthStatusTotals) monthStatusTotalsObj[k] = t;
    const monthStatusDeliveryTotalsObj: Record<string, Cell> = {};
    for (const [k, t] of monthStatusDeliveryTotals) monthStatusDeliveryTotalsObj[k] = t;

    return NextResponse.json({
      brands: brandRows,
      months,
      statusColumns,
      monthTotals: monthTotalsObj,
      monthStatusTotals: monthStatusTotalsObj,
      monthStatusDeliveryTotals: monthStatusDeliveryTotalsObj,
      grand,
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
