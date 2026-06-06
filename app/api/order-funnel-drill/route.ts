import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  poNumber: string;
  status: string;
  amount: string | null;
  buyerBusinessName: string | null;
  buyerPhone: string | null;
  sellerBusinessName: string | null;
  createdAt: string | null;
}

// Per-stage status predicate — mirrors /api/order-funnel exactly so a clicked
// MonthWiseOrder cell drills into precisely the rows that were counted.
const STAGE_FILTER: Record<string, string> = {
  total: 'TRUE',
  draft: `po."status" = 'DRAFT'`,
  orderPunched: `po."status" != 'DRAFT'`,
  pending: `po."status" = 'PENDING'`,
  inProgress: `po."status" NOT IN ('DRAFT','PENDING','DELIVERED','COMPLETED','REJECTED','CANCELLED')`,
  fulfilled: `po."status" IN ('DELIVERED','COMPLETED')`,
};

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const year = parseInt(searchParams.get('year') || '', 10);
  const month = parseInt(searchParams.get('month') || '', 10); // 1-based
  const stageParam = searchParams.get('stage') || 'total';
  const stageWhere = STAGE_FILTER[stageParam] || STAGE_FILTER.total;

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year and month (1-12) are required' }, { status: 400 });
  }

  const startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); // last day of month

  try {
    const params: (string | number)[] = [startDate, endDate];

    const sql = `
      SELECT
        po."poNumber"                       AS "poNumber",
        po."status"                         AS "status",
        (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)::text                   AS "amount",
        b."businessName"                    AS "buyerBusinessName",
        b."phone"                           AS "buyerPhone",
        s."businessName"                    AS "sellerBusinessName",
        po."created_at"                     AS "createdAt"
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
        AND po."created_at"::date >= $1::date
        AND po."created_at"::date <= $2::date
        AND (${stageWhere})
      ORDER BY po."created_at" DESC
      LIMIT 3000;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poNumber: r.poNumber,
      status: r.status,
      amount: parseFloat(r.amount || '0'),
      buyerBusinessName: r.buyerBusinessName,
      buyerPhone: r.buyerPhone,
      sellerBusinessName: r.sellerBusinessName,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      data,
      stage: stageParam,
      startDate,
      endDate,
      truncated: rows.length >= 3000,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
