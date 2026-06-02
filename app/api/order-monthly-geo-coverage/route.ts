import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface BucketRow {
  bucket: number;
  week_start: string | null;
  pincode_covered: string;
  pincode_orders: string;
  pincode_amount: string;
  city_covered: string;
  city_orders: string;
  city_amount: string;
  district_covered: string;
  district_orders: string;
  district_amount: string;
  state_covered: string;
  state_orders: string;
  state_amount: string;
}

type GeoKey = 'pincode' | 'city' | 'district' | 'state';
type Cell = { covered: number; count: number; amount: number };

const COVERED_SELECT = `
  COUNT(DISTINCT b."pincode") FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> '')::text AS pincode_covered,
  COUNT(*) FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> '')::text AS pincode_orders,
  COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."pincode" IS NOT NULL AND b."pincode" <> ''), 0)::text AS pincode_amount,

  COUNT(DISTINCT (b."state", b."city")) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> '')::text AS city_covered,
  COUNT(*) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> '')::text AS city_orders,
  COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."city" IS NOT NULL AND b."city" <> ''), 0)::text AS city_amount,

  COUNT(DISTINCT (b."state", b."district")) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> '')::text AS district_covered,
  COUNT(*) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> '')::text AS district_orders,
  COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."district" IS NOT NULL AND b."district" <> ''), 0)::text AS district_amount,

  COUNT(DISTINCT b."state") FILTER (WHERE b."state" IS NOT NULL AND b."state" <> '')::text AS state_covered,
  COUNT(*) FILTER (WHERE b."state" IS NOT NULL AND b."state" <> '')::text AS state_orders,
  COALESCE(SUM(po."amount"::numeric) FILTER (WHERE b."state" IS NOT NULL AND b."state" <> ''), 0)::text AS state_amount
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const granularity = (searchParams.get('granularity') || 'month') as 'month' | 'week' | 'day';
  const dayMonth = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
  const statusesParam = (searchParams.get('statuses') || '').trim();

  try {
    const params: (string | number)[] = [year];
    let periodFilter = `AND EXTRACT(YEAR FROM po."markedPendingTime") = $1`;
    if (granularity === 'day') {
      params.push(dayMonth);
      periodFilter += ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
    }
    // "Filter to selected months" — applies in month/week modes.
    periodFilter += appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);

    let statusFilter = '';
    if (statusesParam) {
      params.push(statusesParam);
      statusFilter = ` AND po."status" = ANY(string_to_array($${params.length}, ','))`;
    }

    const bucketExpr =
      granularity === 'month' ? `EXTRACT(MONTH FROM po."markedPendingTime")::int`
      : granularity === 'week' ? `EXTRACT(WEEK FROM po."markedPendingTime")::int`
      : `EXTRACT(DAY FROM po."markedPendingTime")::int`;

    const weekStartSelect = granularity === 'week'
      ? `TO_CHAR(MIN(DATE_TRUNC('week', po."markedPendingTime")), 'DD Mon')`
      : `NULL`;

    const baseWhere = `
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status"         != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${periodFilter}
        ${statusFilter}
    `;

    const fromJoin = `
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
    `;

    // Per-bucket aggregates
    const bucketSql = `
      SELECT
        ${bucketExpr} AS bucket,
        ${weekStartSelect} AS week_start,
        ${COVERED_SELECT}
      ${fromJoin}
      ${baseWhere}
      GROUP BY ${bucketExpr}
      ORDER BY bucket;
    `;
    const bucketRows = await query<BucketRow>(bucketSql, params);

    // Period totals (the "Total" column) — COUNT(DISTINCT) is not summable across buckets.
    const totalsSql = `
      SELECT 0 AS bucket, NULL AS week_start, ${COVERED_SELECT}
      ${fromJoin}
      ${baseWhere};
    `;
    const totalsRows = await query<BucketRow>(totalsSql, params);
    const t = totalsRows[0];

    const geos: GeoKey[] = ['pincode', 'city', 'district', 'state'];
    const cellOf = (r: BucketRow, g: GeoKey): Cell => ({
      covered: parseInt(r[`${g}_covered` as keyof BucketRow] as string),
      count: parseInt(r[`${g}_orders` as keyof BucketRow] as string),
      amount: parseFloat(r[`${g}_amount` as keyof BucketRow] as string),
    });

    // Determine the ordered bucket list shown as columns.
    const daysInMonth = new Date(year, dayMonth, 0).getDate();
    let buckets: number[];
    if (granularity === 'month') buckets = Array.from({ length: 12 }, (_, i) => i + 1);
    else if (granularity === 'day') buckets = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    else buckets = bucketRows.map((r) => Number(r.bucket)).sort((a, b) => a - b);

    const months: Record<GeoKey, Record<number, Cell>> = { pincode: {}, city: {}, district: {}, state: {} };
    const totalsByBucket: Record<number, { count: number; amount: number }> = {};
    const weekStartLabels: Record<number, string> = {};

    for (const r of bucketRows) {
      const bk = Number(r.bucket);
      for (const g of geos) months[g][bk] = cellOf(r, g);
      // Grand-total denominator uses the pincode non-null pool (broadest), matching count(*) closely.
      totalsByBucket[bk] = { count: cellOf(r, 'pincode').count, amount: cellOf(r, 'pincode').amount };
      if (r.week_start) weekStartLabels[bk] = r.week_start;
    }

    const total: Record<GeoKey, Cell> = {
      pincode: cellOf(t, 'pincode'),
      city: cellOf(t, 'city'),
      district: cellOf(t, 'district'),
      state: cellOf(t, 'state'),
    };

    const data = geos.map((geo) => ({ geo, months: months[geo], total: total[geo] }));

    return NextResponse.json({
      granularity,
      buckets,
      weekStartLabels,
      daysInMonth,
      month: dayMonth,
      data,
      totals: {
        byMonth: totalsByBucket,
        grand: { count: total.pincode.count, amount: total.pincode.amount },
      },
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
