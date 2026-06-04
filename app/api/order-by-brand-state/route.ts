import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface Row {
  brand_name: string;
  state: string | null;
  count: string;
  amount: string;
  districts_covered: string;
}

// Brand × State breakdown — one row per (brand prefix, buyer state).
// Brand prefix = TRIM(SPLIT_PART(businessName, '-', 1)) — merges ChukDe-GT + ChukDe-NonGT into ChukDe.
// Uses the ACHIEVED base (status IN DELIVERED, COMPLETED) so totals reconcile with the GMV tile and the maps.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const state = searchParams.get('state');
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
    whereDate += appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);

    let stateFilter = '';
    if (state) {
      params.push(state);
      stateFilter = ` AND b."state" = $${params.length}`;
    }

    let whereSeller = '';
    if (sellerIdsParam) {
      params.push(sellerIdsParam);
      whereSeller = ` AND po."sellerId"::text = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      WITH seller_brand AS (
        SELECT
          s."id"::text AS seller_id,
          TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) AS brand_name
        FROM "users"."seller" s
        WHERE s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."isD2RBrandSeller" = TRUE
      )
      SELECT
        sb.brand_name                                AS brand_name,
        b."state"                                    AS state,
        COUNT(*)                                     AS count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text AS amount,
        COUNT(DISTINCT b."district") FILTER (WHERE b."district" IS NOT NULL) AS districts_covered
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN seller_brand sb ON sb.seller_id = po."sellerId"::text
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${stateFilter}
        ${whereSeller}
      GROUP BY sb.brand_name, b."state"
      ORDER BY count DESC, sb.brand_name ASC;
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      brandName: r.brand_name || '(no name)',
      state: r.state,
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
      districtsCovered: parseInt(r.districts_covered || '0'),
    }));

    const grand = data.reduce(
      (acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      data,
      grand,
      year,
      state: state || null,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
