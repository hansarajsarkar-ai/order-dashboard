import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  bucket: string;
  bucket_label: string;
  count: string;
  amount: string;
}

const STD_FILTERS = `
  AND po."isTest"          = FALSE
  AND po."isFalseOrder"    = FALSE
  AND b."isTest"           = FALSE
  AND b."businessName" NOT ILIKE '%test%'
  AND s."isTest"           = FALSE
  AND s."businessName" NOT ILIKE '%test%'
  AND s."businessName" NOT ILIKE '%milko%'
  AND s."isD2RBrandSeller" = TRUE
  AND po."deliveryNetwork" = 'THIRD_PARTY'
  AND po."deliveryType"    = 'INTERCITY'
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const granularity = (searchParams.get('granularity') || 'month') as 'month' | 'week' | 'day';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // Build the date window
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedRejectedTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedRejectedTime"::date <= $${params.length}`;
      }
    } else {
      params.push(currentYear);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedRejectedTime") = $${params.length}`;
    }

    // Build bucket expressions per granularity
    let bucketSql = '';
    let bucketLabel = '';
    let groupBy = '';
    let orderBy = '';
    if (granularity === 'day') {
      bucketSql    = `po."markedRejectedTime"::date::text`;
      bucketLabel  = `TO_CHAR(po."markedRejectedTime"::date, 'DD Mon')`;
      groupBy      = `po."markedRejectedTime"::date`;
      orderBy      = `po."markedRejectedTime"::date`;
    } else if (granularity === 'week') {
      bucketSql    = `'W' || EXTRACT(WEEK FROM po."markedRejectedTime")::text`;
      bucketLabel  = `'W' || EXTRACT(WEEK FROM po."markedRejectedTime")::text || ' · ' || TO_CHAR(DATE_TRUNC('week', po."markedRejectedTime"), 'DD Mon')`;
      groupBy      = `EXTRACT(WEEK FROM po."markedRejectedTime"), DATE_TRUNC('week', po."markedRejectedTime")`;
      orderBy      = `DATE_TRUNC('week', po."markedRejectedTime")`;
    } else {
      // month (default)
      bucketSql    = `EXTRACT(MONTH FROM po."markedRejectedTime")::text`;
      bucketLabel  = `TO_CHAR(po."markedRejectedTime", 'Mon')`;
      groupBy      = `EXTRACT(MONTH FROM po."markedRejectedTime")`;
      orderBy      = `EXTRACT(MONTH FROM po."markedRejectedTime")`;
    }

    const sql = `
      SELECT
        ${bucketSql}                                  AS bucket,
        MIN(${bucketLabel})                           AS bucket_label,
        COUNT(*)                                      AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text  AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status" = 'REJECTED'
        AND po."deliveryStatus" ILIKE '%RTO%'
        AND po."markedRejectedTime" IS NOT NULL
        ${whereDate}
        ${STD_FILTERS}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy};
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      bucket: r.bucket,
      label: r.bucket_label,
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    }));

    const grand = data.reduce(
      (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      granularity,
      data,
      grand,
      startDate: startDate || null,
      endDate: endDate || null,
      year: currentYear,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
