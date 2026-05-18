import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  state: string | null;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  // Accept comma-separated list of seller IDs (a brand may span multiple sellers, e.g. ChukDe).
  const sellerIdsParam = searchParams.get('sellerIds') || searchParams.get('sellerId');

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

    let whereSeller = '';
    if (sellerIdsParam) {
      params.push(sellerIdsParam);
      whereSeller = ` AND po."sellerId"::text = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      SELECT
        b."state"                                    AS state,
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
        AND po."status" != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${whereSeller}
      GROUP BY b."state"
      ORDER BY count DESC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
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
