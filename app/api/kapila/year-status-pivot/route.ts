import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KAPILA_BRAND_ID = '7dae193a-96a1-4495-a9da-e2316fc0c2c7';

interface Row {
  status: string;
  yr: string;
  total_po: string;
  total_amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId') || KAPILA_BRAND_ID;

  try {
    const sql = `
      SELECT
        po."status"                                       AS status,
        EXTRACT(YEAR FROM po."created_at")::int::text     AS yr,
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
      GROUP BY po."status", EXTRACT(YEAR FROM po."created_at")
      ORDER BY EXTRACT(YEAR FROM po."created_at") DESC, po."status";
    `;

    const rows = await query<Row>(sql, [brandId]);

    type Cell = { count: number; amount: number };
    const statusMap: Record<string, Record<string, Cell>> = {};
    const byYear: Record<string, Cell> = {};
    const byStatus: Record<string, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const status = r.status;
      const yr = r.yr;
      const count = parseInt(r.total_po, 10) || 0;
      const amount = parseFloat(r.total_amount) || 0;

      if (!statusMap[status]) statusMap[status] = {};
      statusMap[status][yr] = { count, amount };

      if (!byYear[yr]) byYear[yr] = { count: 0, amount: 0 };
      byYear[yr].count += count;
      byYear[yr].amount += amount;

      if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
      byStatus[status].count += count;
      byStatus[status].amount += amount;

      grand.count += count;
      grand.amount += amount;
    }

    const years = Object.keys(byYear).sort((a, b) => (a < b ? 1 : -1));
    const statuses = Object.keys(byStatus).sort(
      (a, b) => byStatus[b].amount - byStatus[a].amount
    );

    const data = statuses.map((status) => ({
      status,
      cells: statusMap[status],
      total: byStatus[status],
    }));

    return NextResponse.json({
      data,
      years,
      totals: { byYear, grand },
      brandId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
