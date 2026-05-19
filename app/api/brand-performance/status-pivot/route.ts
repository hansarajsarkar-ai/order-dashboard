import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand_name: string;
  status: string;
  delivery_status: string | null;
  count: string;
  amount: string;
}

// Brand × Status × DeliveryStatus pivot — frontend collapses sub-status by default,
// expands on click. Brand grain is the businessName prefix so ChukDe-GT + ChukDe-NonGT
// merge into one row (matching the Demography brand picker).
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
      GROUP BY TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)), po."status", po."deliveryStatus"
      ORDER BY brand_name, status, delivery_status NULLS LAST;
    `;
    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    interface DeliveryAgg { deliveryStatus: string | null; total: Cell; }
    interface StatusAgg {
      status: string;
      total: Cell;
      deliveryStatuses: Map<string, DeliveryAgg>;
    }
    interface BrandAgg {
      brandName: string;
      total: Cell;
      byStatus: Map<string, StatusAgg>;
    }

    const brands = new Map<string, BrandAgg>();
    const statusTotals = new Map<string, Cell>();
    const statusDeliveryTotals = new Map<string, Map<string, Cell>>(); // status -> deliveryStatus -> totals (for column union)
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const brandKey = r.brand_name || '(no name)';
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      // brand
      let br = brands.get(brandKey);
      if (!br) {
        br = { brandName: brandKey, total: { count: 0, amount: 0 }, byStatus: new Map() };
        brands.set(brandKey, br);
      }
      br.total.count += count;
      br.total.amount += amount;

      // brand × status
      let st = br.byStatus.get(r.status);
      if (!st) {
        st = { status: r.status, total: { count: 0, amount: 0 }, deliveryStatuses: new Map() };
        br.byStatus.set(r.status, st);
      }
      st.total.count += count;
      st.total.amount += amount;

      // brand × status × deliveryStatus
      const deliveryKey = r.delivery_status ?? '__NULL__';
      let dl = st.deliveryStatuses.get(deliveryKey);
      if (!dl) {
        dl = { deliveryStatus: r.delivery_status, total: { count: 0, amount: 0 } };
        st.deliveryStatuses.set(deliveryKey, dl);
      }
      dl.total.count += count;
      dl.total.amount += amount;

      // status column totals
      const sTotal = statusTotals.get(r.status) ?? { count: 0, amount: 0 };
      sTotal.count += count;
      sTotal.amount += amount;
      statusTotals.set(r.status, sTotal);

      // status × deliveryStatus totals (for expanded column union)
      if (!statusDeliveryTotals.has(r.status)) statusDeliveryTotals.set(r.status, new Map());
      const dMap = statusDeliveryTotals.get(r.status)!;
      const dTotal = dMap.get(deliveryKey) ?? { count: 0, amount: 0 };
      dTotal.count += count;
      dTotal.amount += amount;
      dMap.set(deliveryKey, dTotal);

      grand.count += count;
      grand.amount += amount;
    }

    // Order brand rows by total count DESC
    const brandRows = Array.from(brands.values())
      .sort((a, b) => b.total.count - a.total.count)
      .map((br) => ({
        brandName: br.brandName,
        total: br.total,
        byStatus: Array.from(br.byStatus.values())
          .sort((a, b) => b.total.count - a.total.count)
          .map((s) => ({
            status: s.status,
            total: s.total,
            deliveryStatuses: Array.from(s.deliveryStatuses.values())
              .sort((a, b) => b.total.count - a.total.count),
          })),
      }));

    // Status column order: by total count DESC across all brands
    const statusColumns = Array.from(statusTotals.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([status, total]) => ({
        status,
        total,
        deliveryStatuses: Array.from(statusDeliveryTotals.get(status)!.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([key, dt]) => ({
            deliveryStatus: key === '__NULL__' ? null : key,
            total: dt,
          })),
      }));

    return NextResponse.json({
      brands: brandRows,
      statusColumns,
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
