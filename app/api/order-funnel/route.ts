import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  year: string;
  month: string;
  total_count: string;
  total_amount: string;
  draft_count: string;     draft_amount: string;     draft_buyers: string;     draft_sellers: string;
  punched_count: string;   punched_amount: string;   punched_buyers: string;   punched_sellers: string;
  pending_count: string;   pending_amount: string;   pending_buyers: string;   pending_sellers: string;
  inprogress_count: string; inprogress_amount: string; inprogress_buyers: string; inprogress_sellers: string;
  fulfilled_count: string; fulfilled_amount: string; fulfilled_buyers: string; fulfilled_sellers: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // Build date window on created_at
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate) {
      params.push(startDate);
      whereDate += ` AND po."created_at"::date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereDate += ` AND po."created_at"::date <= $${params.length}`;
    }
    // Stage definitions (no THIRD_PARTY/INTERCITY/DRAFT exclusion — DRAFT is its own stage):
    //   Draft         = status = 'DRAFT'
    //   Order Punched = status != 'DRAFT' (the order was punched to a seller)
    //   Pending       = status = 'PENDING'
    //   InProgress    = anything between Pending and terminal (ACCEPTED / INVOICED / OUT_FOR_DELIVERY / etc.)
    //   Fulfilled     = status IN ('DELIVERED','COMPLETED')
    // Rejected + Cancelled are not shown as columns — the user-supplied spec lists only these 5.
    const sql = `
      SELECT
        EXTRACT(YEAR  FROM po."created_at")::int AS year,
        EXTRACT(MONTH FROM po."created_at")::int AS month,
        COUNT(*)                                     AS total_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS total_amount,

        COUNT(*) FILTER (WHERE po."status" = 'DRAFT')                                              AS draft_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'DRAFT'), 0)::text          AS draft_amount,
        COUNT(DISTINCT po."buyerId")  FILTER (WHERE po."status" = 'DRAFT')                          AS draft_buyers,
        COUNT(DISTINCT po."sellerId") FILTER (WHERE po."status" = 'DRAFT')                          AS draft_sellers,

        COUNT(*) FILTER (WHERE po."status" != 'DRAFT')                                             AS punched_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" != 'DRAFT'), 0)::text         AS punched_amount,
        COUNT(DISTINCT po."buyerId")  FILTER (WHERE po."status" != 'DRAFT')                         AS punched_buyers,
        COUNT(DISTINCT po."sellerId") FILTER (WHERE po."status" != 'DRAFT')                         AS punched_sellers,

        COUNT(*) FILTER (WHERE po."status" = 'PENDING')                                            AS pending_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'PENDING'), 0)::text        AS pending_amount,
        COUNT(DISTINCT po."buyerId")  FILTER (WHERE po."status" = 'PENDING')                        AS pending_buyers,
        COUNT(DISTINCT po."sellerId") FILTER (WHERE po."status" = 'PENDING')                        AS pending_sellers,

        COUNT(*) FILTER (WHERE po."status" NOT IN ('DRAFT','PENDING','DELIVERED','COMPLETED','REJECTED','CANCELLED')) AS inprogress_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" NOT IN ('DRAFT','PENDING','DELIVERED','COMPLETED','REJECTED','CANCELLED')), 0)::text AS inprogress_amount,
        COUNT(DISTINCT po."buyerId")  FILTER (WHERE po."status" NOT IN ('DRAFT','PENDING','DELIVERED','COMPLETED','REJECTED','CANCELLED')) AS inprogress_buyers,
        COUNT(DISTINCT po."sellerId") FILTER (WHERE po."status" NOT IN ('DRAFT','PENDING','DELIVERED','COMPLETED','REJECTED','CANCELLED')) AS inprogress_sellers,

        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                           AS fulfilled_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS fulfilled_amount,
        COUNT(DISTINCT po."buyerId")  FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))      AS fulfilled_buyers,
        COUNT(DISTINCT po."sellerId") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))      AS fulfilled_sellers
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
      GROUP BY EXTRACT(YEAR FROM po."created_at"), EXTRACT(MONTH FROM po."created_at")
      ORDER BY year DESC, month DESC;
    `;
    const rows = await query<Row>(sql, params);

    interface Stage { count: number; amount: number; buyers: number; sellers: number; }
    const num = (s: string | null) => parseInt(s || '0');
    const fnum = (s: string | null) => parseFloat(s || '0');

    const data = rows.map((r) => ({
      year:  parseInt(r.year),
      month: parseInt(r.month),
      totalCount:  num(r.total_count),
      totalAmount: fnum(r.total_amount),
      draft:        { count: num(r.draft_count),     amount: fnum(r.draft_amount),     buyers: num(r.draft_buyers),     sellers: num(r.draft_sellers) }     as Stage,
      orderPunched: { count: num(r.punched_count),   amount: fnum(r.punched_amount),   buyers: num(r.punched_buyers),   sellers: num(r.punched_sellers) }   as Stage,
      pending:      { count: num(r.pending_count),   amount: fnum(r.pending_amount),   buyers: num(r.pending_buyers),   sellers: num(r.pending_sellers) }   as Stage,
      inProgress:   { count: num(r.inprogress_count), amount: fnum(r.inprogress_amount), buyers: num(r.inprogress_buyers), sellers: num(r.inprogress_sellers) } as Stage,
      fulfilled:    { count: num(r.fulfilled_count), amount: fnum(r.fulfilled_amount), buyers: num(r.fulfilled_buyers), sellers: num(r.fulfilled_sellers) } as Stage,
    }));

    return NextResponse.json({
      data,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
