import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

// One row per (buyer state, calendar month), broken into the order-status funnel.
// Drives the State wise pivot: rows = states, column groups = months,
// sub-columns = status (count / % of punched / amount).
interface Row {
  state: string | null;
  ym: string; // 'YYYY-MM'
  punched_count: string;
  punched_amount: string;
  delivered_count: string;
  delivered_amount: string;
  rejected_count: string;
  rejected_amount: string;
  cancelled_count: string;
  cancelled_amount: string;
  pending_count: string;
  pending_amount: string;
  inprogress_count: string;
  inprogress_amount: string;
  dispatched_count: string;
  dispatched_amount: string;
  inflight_count: string;
  inflight_amount: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
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

    const sql = `
      SELECT
        b."state" AS state,
        to_char(po."markedPendingTime", 'YYYY-MM') AS ym,
        COUNT(*)                                                                                        AS punched_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text                                                    AS punched_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED', 'COMPLETED'))                               AS delivered_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                                                AS rejected_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'REJECTED'), 0)::text            AS rejected_amount,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                                               AS cancelled_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'CANCELLED'), 0)::text           AS cancelled_amount,
        COUNT(*) FILTER (WHERE po."status" = 'PENDING')                                                 AS pending_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'PENDING'), 0)::text             AS pending_amount,
        COUNT(*) FILTER (WHERE po."status" = 'INPROGRESS')                                              AS inprogress_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'INPROGRESS'), 0)::text          AS inprogress_amount,
        COUNT(*) FILTER (WHERE po."status" = 'DISPATCHED')                                              AS dispatched_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'DISPATCHED'), 0)::text          AS dispatched_amount,
        COUNT(*) FILTER (WHERE po."status" NOT IN ('DELIVERED','COMPLETED','REJECTED','CANCELLED','PENDING','INPROGRESS','DISPATCHED'))     AS inflight_count,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" NOT IN ('DELIVERED','COMPLETED','REJECTED','CANCELLED','PENDING','INPROGRESS','DISPATCHED')), 0)::text AS inflight_amount
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
      GROUP BY b."state", to_char(po."markedPendingTime", 'YYYY-MM')
      ORDER BY ym ASC;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      state: r.state,
      ym: r.ym,
      punched:   { count: parseInt(r.punched_count),   amount: parseFloat(r.punched_amount) },
      delivered: { count: parseInt(r.delivered_count), amount: parseFloat(r.delivered_amount) },
      rejected:  { count: parseInt(r.rejected_count),  amount: parseFloat(r.rejected_amount) },
      cancelled: { count: parseInt(r.cancelled_count), amount: parseFloat(r.cancelled_amount) },
      pending:    { count: parseInt(r.pending_count),    amount: parseFloat(r.pending_amount) },
      inprogress: { count: parseInt(r.inprogress_count), amount: parseFloat(r.inprogress_amount) },
      dispatched: { count: parseInt(r.dispatched_count), amount: parseFloat(r.dispatched_amount) },
      inflight:  { count: parseInt(r.inflight_count),  amount: parseFloat(r.inflight_amount) },
    }));

    // Distinct months present, ascending — these become the column groups.
    const months = Array.from(new Set(data.map((d) => d.ym))).sort();

    return NextResponse.json({
      data,
      months,
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

export const GET = withQueryCapture(_GET);
