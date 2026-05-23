import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row { city: string | null; district: string | null; count: string; amount: string; buyers: string; }

// Top cities (or districts when city is null) within a buyer state, delivered only.
// Honors the same brand multi-select used elsewhere on the brand-performance page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const state = searchParams.get('state');
  const brand = searchParams.get('brand');

  if (!state) {
    return NextResponse.json({ error: 'state param required' }, { status: 400 });
  }

  try {
    const params: (string | number)[] = [state];
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

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      SELECT
        b."city"                                            AS city,
        b."district"                                        AS district,
        COUNT(*)                                            AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text        AS amount,
        COUNT(DISTINCT po."buyerId")                        AS buyers
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
        AND po."status"          IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        AND b."state"            = $1
        ${whereDate}
        ${brandFilter}
      GROUP BY b."city", b."district"
      ORDER BY count DESC NULLS LAST;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      city: r.city,
      district: r.district,
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
      buyers: parseInt(r.buyers),
    }));
    const grand = data.reduce(
      (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount, buyers: acc.buyers + r.buyers }),
      { count: 0, amount: 0, buyers: 0 }
    );

    return NextResponse.json({ data, grand, state, brand: brand || null, year, startDate: startDate || null, endDate: endDate || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
