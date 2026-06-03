import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

// One row per buyer state, broken into the order-status funnel:
//   punched   = every order placed (markedPendingTime set) — the denominator
//   delivered = DELIVERED + COMPLETED
//   rejected  = REJECTED
//   cancelled = CANCELLED
//   inflight  = everything else still moving (DISPATCHED, INPROGRESS, PENDING, …)
interface Row {
  state: string | null;
  punched_count: string;
  punched_amount: string;
  delivered_count: string;
  delivered_amount: string;
  rejected_count: string;
  rejected_amount: string;
  cancelled_count: string;
  cancelled_amount: string;
  inflight_count: string;
  inflight_amount: string;
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
    whereDate += appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);

    let whereSeller = '';
    if (sellerIdsParam) {
      params.push(sellerIdsParam);
      whereSeller = ` AND po."sellerId"::text = ANY(string_to_array($${params.length}, ','))`;
    }

    // NOTE: same universe filters as /api/order-by-state, but WITHOUT the
    // status filter — here we keep every status so we can split the funnel.
    const sql = `
      SELECT
        b."state" AS state,
        COUNT(*)                                                                                        AS punched_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                                    AS punched_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED', 'COMPLETED'))                               AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                                                AS rejected_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'REJECTED'), 0)::text            AS rejected_amount,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                                               AS cancelled_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'CANCELLED'), 0)::text           AS cancelled_amount,
        COUNT(*) FILTER (WHERE po."status" NOT IN ('DELIVERED','COMPLETED','REJECTED','CANCELLED'))     AS inflight_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" NOT IN ('DELIVERED','COMPLETED','REJECTED','CANCELLED')), 0)::text AS inflight_amount
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
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${whereSeller}
      GROUP BY b."state"
      ORDER BY punched_count DESC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      state: r.state,
      punched:   { count: parseInt(r.punched_count),   amount: parseFloat(r.punched_amount) },
      delivered: { count: parseInt(r.delivered_count), amount: parseFloat(r.delivered_amount) },
      rejected:  { count: parseInt(r.rejected_count),  amount: parseFloat(r.rejected_amount) },
      cancelled: { count: parseInt(r.cancelled_count), amount: parseFloat(r.cancelled_amount) },
      inflight:  { count: parseInt(r.inflight_count),  amount: parseFloat(r.inflight_amount) },
    }));

    const grand = data.reduce(
      (acc, r) => ({
        punched:   { count: acc.punched.count   + r.punched.count,   amount: acc.punched.amount   + r.punched.amount },
        delivered: { count: acc.delivered.count + r.delivered.count, amount: acc.delivered.amount + r.delivered.amount },
        rejected:  { count: acc.rejected.count  + r.rejected.count,  amount: acc.rejected.amount  + r.rejected.amount },
        cancelled: { count: acc.cancelled.count + r.cancelled.count, amount: acc.cancelled.amount + r.cancelled.amount },
        inflight:  { count: acc.inflight.count  + r.inflight.count,  amount: acc.inflight.amount  + r.inflight.amount },
      }),
      {
        punched:   { count: 0, amount: 0 },
        delivered: { count: 0, amount: 0 },
        rejected:  { count: 0, amount: 0 },
        cancelled: { count: 0, amount: 0 },
        inflight:  { count: 0, amount: 0 },
      }
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
