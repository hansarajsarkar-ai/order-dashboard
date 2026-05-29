import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  pincode: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  count: string;
  amount: string;
}

type GeoLevel = 'pincode' | 'city' | 'district' | 'state';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const granularity = (searchParams.get('granularity') || 'month') as 'month' | 'week' | 'day';
  const dayMonth = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
  const bucketParam = (searchParams.get('bucket') || '').trim(); // '' or 'total' = whole period
  const statusesParam = (searchParams.get('statuses') || '').trim();
  const geoParam = (searchParams.get('geo') || 'pincode') as GeoLevel;
  const geo: GeoLevel = ['pincode', 'city', 'district', 'state'].includes(geoParam) ? geoParam : 'pincode';

  try {
    const params: (string | number)[] = [year];
    let periodFilter = `AND EXTRACT(YEAR FROM po."markedPendingTime") = $1`;

    // Day mode is always scoped to a single month.
    if (granularity === 'day') {
      params.push(dayMonth);
      periodFilter += ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
    }

    // A specific bucket narrows further; 'total'/empty keeps the whole period.
    if (bucketParam && bucketParam !== 'total') {
      const bucket = parseInt(bucketParam);
      const field = granularity === 'month' ? 'MONTH' : granularity === 'week' ? 'WEEK' : 'DAY';
      params.push(bucket);
      periodFilter += ` AND EXTRACT(${field} FROM po."markedPendingTime") = $${params.length}`;
    }

    let statusFilter = '';
    if (statusesParam) {
      params.push(statusesParam);
      statusFilter = ` AND po."status" = ANY(string_to_array($${params.length}, ','))`;
    }

    // Group/select keys vary by the geo level being drilled into. Non-key geo columns
    // are NULL (or MAX of the parent geo) so the response shape stays consistent.
    let selectKeys: string;
    let groupBy: string;
    let geoNotNull: string;
    switch (geo) {
      case 'state':
        selectKeys = `NULL AS pincode, NULL AS city, NULL AS district, b."state" AS state`;
        groupBy = `b."state"`;
        geoNotNull = `AND b."state" IS NOT NULL AND b."state" <> ''`;
        break;
      case 'district':
        selectKeys = `NULL AS pincode, NULL AS city, b."district" AS district, b."state" AS state`;
        groupBy = `b."state", b."district"`;
        geoNotNull = `AND b."district" IS NOT NULL AND b."district" <> ''`;
        break;
      case 'city':
        selectKeys = `NULL AS pincode, b."city" AS city, MAX(b."district") AS district, b."state" AS state`;
        groupBy = `b."state", b."city"`;
        geoNotNull = `AND b."city" IS NOT NULL AND b."city" <> ''`;
        break;
      case 'pincode':
      default:
        selectKeys = `b."pincode" AS pincode, MAX(b."city") AS city, MAX(b."district") AS district, MAX(b."state") AS state`;
        groupBy = `b."pincode"`;
        geoNotNull = `AND b."pincode" IS NOT NULL AND b."pincode" <> ''`;
        break;
    }

    const sql = `
      SELECT
        ${selectKeys},
        COUNT(*)                                     AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS amount
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
        AND po."status"         != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${geoNotNull}
        ${periodFilter}
        ${statusFilter}
      GROUP BY ${groupBy}
      ORDER BY count DESC, amount DESC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      pincode: r.pincode,
      city: r.city,
      district: r.district,
      state: r.state,
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    }));

    const grand = data.reduce(
      (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      data,
      grand,
      geo,
      rows: data.length,
      granularity,
      bucket: bucketParam || 'total',
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
