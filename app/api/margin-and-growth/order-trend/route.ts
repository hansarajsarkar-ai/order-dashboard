import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  bucket: string;
  orders: string;
  buyers: string;
}

const GRANULARITIES: Record<string, 'day' | 'week' | 'month'> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

// Order creation trend — distinct D2R intercity third-party orders (and the
// distinct buyers placing them) bucketed by day / week / month.
// Mirrors the analyst query on purchaseOrder ⋈ seller ⋈ buyer with the same
// test/false-order/delivery filters.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const granParam = (searchParams.get('granularity') || 'day').toLowerCase();
  const gran = GRANULARITIES[granParam] || 'day';

  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const params: (string | number)[] = [gran, days];

    const sql = `
      SELECT
        date_trunc($1, po."created_at")::date::text AS bucket,
        COUNT(DISTINCT po."id")::text                AS orders,
        COUNT(DISTINCT b."id")::text                 AS buyers
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE po."isTest"          = FALSE
        AND po."status"         != 'DRAFT'
        AND po."created_at"::date >= current_date - $2::int
        AND s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."businessName" NOT ILIKE '%milko%'
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."isFalseOrder"    = FALSE
      GROUP BY 1
      ORDER BY 1;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      bucket: r.bucket,
      orders: parseInt(r.orders, 10),
      buyers: parseInt(r.buyers, 10),
    }));

    const orderCounts = data.map((r) => r.orders);
    const totalOrders = orderCounts.reduce((a, b) => a + b, 0);
    const peak = data.reduce(
      (best, r) => (r.orders > best.orders ? r : best),
      { bucket: '', orders: -1, buyers: 0 }
    );
    const avg = orderCounts.length ? Math.round(totalOrders / orderCounts.length) : 0;
    const latest = data.length ? data[data.length - 1].orders : 0;
    const first = data.length ? data[0].orders : 0;
    const changePct = first ? ((latest - first) / first) * 100 : 0;

    return NextResponse.json({
      data,
      summary: {
        totalOrders,
        avg,
        peak: peak.orders >= 0 ? peak.orders : 0,
        peakBucket: peak.bucket || null,
        latest,
        first,
        changePct,
        granularity: gran,
        windowDays: days,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
