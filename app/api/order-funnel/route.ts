import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  total_count: string;
  total_amount: string;
  delivered_count: string;
  delivered_amount: string;
  rejected_count: string;
  rejected_amount: string;
  cancelled_count: string;
  cancelled_amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const currentYear = new Date().getFullYear();

  try {
    // Build date window on created_at
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."created_at"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."created_at"::date <= $${params.length}`;
      }
    } else {
      params.push(currentYear);
      whereDate = ` AND EXTRACT(YEAR FROM po."created_at") = $${params.length}`;
    }

    // Total created = all non-DRAFT orders (placed, not abandoned carts).
    // Buckets: DELIVERED+COMPLETED, REJECTED, CANCELLED. Remaining sit in in-flight statuses.
    const sql = `
      SELECT
        COUNT(*)                                                                              AS total_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                          AS total_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                      AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                                      AS rejected_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'REJECTED'), 0)::text  AS rejected_amount,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                                     AS cancelled_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'CANCELLED'), 0)::text AS cancelled_amount
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
        AND po."created_at" IS NOT NULL
        ${whereDate};
    `;
    const rows = await query<Row>(sql, params);
    const r = rows[0];

    const totalCount      = parseInt(r?.total_count      || '0');
    const totalAmount     = parseFloat(r?.total_amount   || '0');
    const deliveredCount  = parseInt(r?.delivered_count  || '0');
    const deliveredAmount = parseFloat(r?.delivered_amount || '0');
    const rejectedCount   = parseInt(r?.rejected_count   || '0');
    const rejectedAmount  = parseFloat(r?.rejected_amount || '0');
    const cancelledCount  = parseInt(r?.cancelled_count  || '0');
    const cancelledAmount = parseFloat(r?.cancelled_amount || '0');
    const inFlightCount   = totalCount  - deliveredCount  - rejectedCount  - cancelledCount;
    const inFlightAmount  = totalAmount - deliveredAmount - rejectedAmount - cancelledAmount;

    return NextResponse.json({
      totalCount, totalAmount,
      deliveredCount, deliveredAmount,
      rejectedCount, rejectedAmount,
      cancelledCount, cancelledAmount,
      inFlightCount, inFlightAmount,
      startDate: startDate || null,
      endDate: endDate || null,
      year: !startDate && !endDate ? currentYear : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
