import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KAPILA_BRAND_ID = '7dae193a-96a1-4495-a9da-e2316fc0c2c7';

interface Row {
  status: string;
  day: string;
  total_po: string;
  total_amount: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date();
  const defaultStart = ymd(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
  const defaultEnd = ymd(today);

  const startDate = searchParams.get('startDate') || defaultStart;
  const endDate = searchParams.get('endDate') || defaultEnd;
  const brandId = searchParams.get('brandId') || KAPILA_BRAND_ID;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    // Filter on poi."brandId" (indexed hot path), narrow to date range BEFORE joining users.
    // Memory: poi.status != 'DRAFT' (draft items persist on completed orders → inflates totals)
    // Memory: poi.comboBrandSKUPOItemId IS NULL (combo parent + children both have amount → double-counts)
    const sql = `
      SELECT
        po."status"                                       AS status,
        po."created_at"::date::text                       AS day,
        COUNT(DISTINCT po."poNumber")                     AS total_po,
        COALESCE(SUM(poi."amount"::numeric), 0)::text     AS total_amount
      FROM "purchaseOrder"."purchaseOrderItem" poi
      JOIN "purchaseOrder"."purchaseOrder" po ON poi."purchaseOrderId" = po."id"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE poi."brandId"                  = $1
        AND poi."status"                  != 'DRAFT'
        AND poi."comboBrandSKUPOItemId"   IS NULL
        AND po."status"                   != 'DRAFT'
        AND po."isTest"                    = FALSE
        AND po."isFalseOrder"              = FALSE
        AND b."isTest"                     = FALSE
        AND s."isTest"                     = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."businessName" NOT ILIKE '%test%'
        AND po."created_at" >= $2::date
        AND po."created_at" <  ($3::date + INTERVAL '1 day')
      GROUP BY po."status", po."created_at"::date
      ORDER BY po."created_at"::date DESC, po."status";
    `;

    const rows = await query<Row>(sql, [brandId, startDate, endDate]);

    type Cell = { count: number; amount: number };
    const dayMap: Record<string, Record<string, Cell>> = {};
    const byDay: Record<string, Cell> = {};
    const byStatus: Record<string, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const day = r.day;
      const status = r.status;
      const count = parseInt(r.total_po, 10) || 0;
      const amount = parseFloat(r.total_amount) || 0;

      if (!dayMap[day]) dayMap[day] = {};
      dayMap[day][status] = { count, amount };

      if (!byDay[day]) byDay[day] = { count: 0, amount: 0 };
      byDay[day].count += count;
      byDay[day].amount += amount;

      if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
      byStatus[status].count += count;
      byStatus[status].amount += amount;

      grand.count += count;
      grand.amount += amount;
    }

    const statuses = Object.keys(byStatus).sort(
      (a, b) => byStatus[b].amount - byStatus[a].amount
    );
    const days = Object.keys(dayMap).sort((a, b) => (a < b ? 1 : -1));

    const data = days.map((day) => ({
      day,
      cells: dayMap[day],
      total: byDay[day],
    }));

    return NextResponse.json({
      data,
      statuses,
      totals: { byStatus, grand },
      startDate,
      endDate,
      brandId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
