import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  month: string;
  total_count: string;
  total_amount: string;
  pushed_count: string;
  pushed_amount: string;
  delivered_count: string;
  delivered_amount: string;
  rejected_count: string;
  rejected_amount: string;
  cancelled_count: string;
  cancelled_amount: string;
  inprogress_count: string;
  inprogress_amount: string;
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

    // Stages (FILTER aggregates):
    //   total      = ALL orders (includes DRAFT)
    //   pushed     = order pushed to seller (non-DRAFT)
    //   delivered  = DELIVERED + COMPLETED
    //   rejected   = REJECTED
    //   cancelled  = CANCELLED
    //   inprogress = pushed but not yet terminal (= pushed − delivered − rejected − cancelled)
    //
    // No deliveryNetwork/deliveryType filter here — DRAFT orders don't have those set,
    // so applying them would collapse "Total Created" into "Pushed to seller".
    const sql = `
      SELECT
        EXTRACT(MONTH FROM po."created_at")::int AS month,
        COUNT(*)                                                                                 AS total_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                             AS total_amount,
        COUNT(*) FILTER (WHERE po."status" != 'DRAFT')                                           AS pushed_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" != 'DRAFT'), 0)::text       AS pushed_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                         AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                                         AS rejected_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'REJECTED'), 0)::text     AS rejected_amount,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                                        AS cancelled_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'CANCELLED'), 0)::text    AS cancelled_amount,
        COUNT(*) FILTER (WHERE po."status" NOT IN ('DRAFT','DELIVERED','COMPLETED','REJECTED','CANCELLED')) AS inprogress_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" NOT IN ('DRAFT','DELIVERED','COMPLETED','REJECTED','CANCELLED')), 0)::text AS inprogress_amount
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
        AND po."created_at" IS NOT NULL
        ${whereDate}
      GROUP BY EXTRACT(MONTH FROM po."created_at")
      ORDER BY month;
    `;
    const rows = await query<Row>(sql, params);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const data = rows.map((r) => {
      const m = parseInt(String(r.month));
      return {
        month: m,
        label: monthNames[m - 1] || String(m),
        totalCount:      parseInt(r.total_count      || '0'),
        totalAmount:     parseFloat(r.total_amount   || '0'),
        pushedCount:     parseInt(r.pushed_count     || '0'),
        pushedAmount:    parseFloat(r.pushed_amount  || '0'),
        deliveredCount:  parseInt(r.delivered_count  || '0'),
        deliveredAmount: parseFloat(r.delivered_amount || '0'),
        rejectedCount:   parseInt(r.rejected_count   || '0'),
        rejectedAmount:  parseFloat(r.rejected_amount || '0'),
        cancelledCount:  parseInt(r.cancelled_count  || '0'),
        cancelledAmount: parseFloat(r.cancelled_amount || '0'),
        inProgressCount:  parseInt(r.inprogress_count  || '0'),
        inProgressAmount: parseFloat(r.inprogress_amount || '0'),
      };
    });

    const totals = data.reduce(
      (acc, d) => ({
        totalCount:      acc.totalCount      + d.totalCount,
        totalAmount:     acc.totalAmount     + d.totalAmount,
        pushedCount:     acc.pushedCount     + d.pushedCount,
        pushedAmount:    acc.pushedAmount    + d.pushedAmount,
        deliveredCount:  acc.deliveredCount  + d.deliveredCount,
        deliveredAmount: acc.deliveredAmount + d.deliveredAmount,
        rejectedCount:   acc.rejectedCount   + d.rejectedCount,
        rejectedAmount:  acc.rejectedAmount  + d.rejectedAmount,
        cancelledCount:  acc.cancelledCount  + d.cancelledCount,
        cancelledAmount: acc.cancelledAmount + d.cancelledAmount,
        inProgressCount:  acc.inProgressCount  + d.inProgressCount,
        inProgressAmount: acc.inProgressAmount + d.inProgressAmount,
      }),
      { totalCount: 0, totalAmount: 0, pushedCount: 0, pushedAmount: 0, deliveredCount: 0, deliveredAmount: 0, rejectedCount: 0, rejectedAmount: 0, cancelledCount: 0, cancelledAmount: 0, inProgressCount: 0, inProgressAmount: 0 }
    );

    return NextResponse.json({
      data,
      totals,
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
