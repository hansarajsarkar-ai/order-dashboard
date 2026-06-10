import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

// Daily payment-option mix on the brand-performance trends tab.
// Returns one row per (date, payment option) with distinct PO count.
// Falls back to last 30 days when no startDate/endDate is supplied.

interface Row {
  payment_option: string;
  order_date: string;
  po_count: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');

  try {
    const params: (string | number)[] = [];
    let dateClause: string;
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateClause = `AND a."markedPendingTime"::date BETWEEN $1 AND $2`;
    } else {
      dateClause = `AND a."markedPendingTime" >= current_date - INTERVAL '30 days'`;
    }

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = `AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    const monthsFilter = appendMonthsFilter(searchParams.get('months'), 'a."markedPendingTime"', params);

    const sql = `
      SELECT
        COALESCE(a."paymentInfo"->>'option', 'UNKNOWN')             AS payment_option,
        to_char(a."markedPendingTime"::date, 'YYYY-MM-DD')          AS order_date,
        COUNT(DISTINCT a."poNumber")::text                          AS po_count
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."seller" s ON s."id" = a."sellerId"
      JOIN "users"."buyer"  b ON b."id" = a."buyerId"
      WHERE s."isTest"          = FALSE
        AND b."isTest"          = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."businessName" NOT ILIKE '%test%'
        AND a."isTest"          = FALSE
        AND a."isFalseOrder"    = FALSE
        AND a."deliveryType"    = 'INTERCITY'
        AND a."deliveryNetwork" = 'THIRD_PARTY'
        AND a."status"          != 'DRAFT'
        ${dateClause}
        ${monthsFilter}
        ${brandFilter}
      GROUP BY 1, 2
      ORDER BY 2 ASC;
    `;

    const rows = await query<Row>(sql, params);

    const dateMap = new Map<string, Record<string, number>>();
    const optionTotals = new Map<string, number>();

    for (const r of rows) {
      const date = r.order_date;
      const opt = r.payment_option || 'UNKNOWN';
      const cnt = parseInt(r.po_count);
      if (!dateMap.has(date)) dateMap.set(date, {});
      dateMap.get(date)![opt] = (dateMap.get(date)![opt] || 0) + cnt;
      optionTotals.set(opt, (optionTotals.get(opt) || 0) + cnt);
    }

    const options = Array.from(optionTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([opt]) => opt);

    const data = Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => {
        const row: Record<string, number | string> = { date };
        let total = 0;
        for (const opt of options) {
          const v = counts[opt] || 0;
          row[opt] = v;
          total += v;
        }
        row.total = total;
        return row;
      });

    return NextResponse.json({
      data,
      options,
      optionTotals: Object.fromEntries(optionTotals),
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
