import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface DraftOrderRow {
  poNumber: string | number | null;
  amount: string | number | null;
  status: string;
  created_at: string;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
}

interface ResultRow {
  result: {
    rows: DraftOrderRow[] | null;
    total: number;
  } | null;
}

const MAX_PAGE_SIZE = 200;

// Whitelist sort columns so we can safely interpolate into SQL.
// Names must match the projected columns of the `filtered` CTE.
const SORT_COLUMNS: Record<string, string> = {
  created_at: '"created_at"',
  amount:     '"amount"::numeric',
  poNumber:   '"poNumber"',
  buyer:      '"buyerBusinessName"',
  seller:     '"sellerBusinessName"',
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ilikePattern(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // Escape ILIKE metacharacters so user input is treated as a literal substring.
  const esc = t.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${esc}%`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const defaultEnd = yyyymmdd(today);
  const defaultStart = yyyymmdd(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));

  const startDate = searchParams.get('startDate') || defaultStart;
  const endDate   = searchParams.get('endDate')   || defaultEnd;
  if (!isYmd(startDate) || !isYmd(endDate)) {
    return NextResponse.json({ error: 'startDate / endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const poNumber     = searchParams.get('poNumber')     || '';
  const buyerSearch  = searchParams.get('buyer')        || '';
  const sellerSearch = searchParams.get('seller')       || '';
  const minAmountRaw = searchParams.get('minAmount');
  const maxAmountRaw = searchParams.get('maxAmount');
  const minAmount = minAmountRaw && minAmountRaw.trim() !== '' ? Number(minAmountRaw) : null;
  const maxAmount = maxAmountRaw && maxAmountRaw.trim() !== '' ? Number(maxAmountRaw) : null;
  if (minAmount !== null && !Number.isFinite(minAmount)) {
    return NextResponse.json({ error: 'minAmount must be a number' }, { status: 400 });
  }
  if (maxAmount !== null && !Number.isFinite(maxAmount)) {
    return NextResponse.json({ error: 'maxAmount must be a number' }, { status: 400 });
  }

  const sortByRaw  = searchParams.get('sortBy') || 'created_at';
  const sortBy     = SORT_COLUMNS[sortByRaw] ? sortByRaw : 'created_at';
  const sortColSql = SORT_COLUMNS[sortBy];
  const sortDir    = (searchParams.get('sortOrder') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageRaw     = Number(searchParams.get('page')     || '1');
  const pageSizeRaw = Number(searchParams.get('pageSize') || '50');
  const page     = Number.isFinite(pageRaw) && pageRaw     >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1
    ? Math.min(Math.floor(pageSizeRaw), MAX_PAGE_SIZE)
    : 50;
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [
    startDate,                    // $1
    endDate,                      // $2
    ilikePattern(poNumber),       // $3
    ilikePattern(buyerSearch),    // $4
    ilikePattern(sellerSearch),   // $5
    minAmount,                    // $6
    maxAmount,                    // $7
    pageSize,                     // $8
    offset,                       // $9
  ];

  // Fast-path: digits-only poNumber search bypasses the date window, the
  // ILIKE machinery, and the COUNT(*) — it's an indexed equality lookup
  // on a unique column. Drops a 38k-row scan from ~1s to a few ms so
  // typing a PO into the filter feels instant.
  if (/^\d+$/.test(poNumber)) {
    try {
      const fastRows = await query<DraftOrderRow>(`
        SELECT
          a."poNumber",
          a."amount",
          a."status",
          a."created_at",
          b."phone"        AS "buyerPhone",
          b."businessName" AS "buyerBusinessName",
          s."phone"        AS "sellerPhone",
          s."businessName" AS "sellerBusinessName"
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b ON b."id" = a."buyerId"
        JOIN "users"."seller" s ON s."id" = a."sellerId"
        WHERE a."poNumber"::text = $1
          AND s."isD2RBrandSeller" = TRUE
          AND a."status" = 'DRAFT'
        LIMIT 1;
      `, [poNumber]);
      return NextResponse.json({
        rows: fastRows,
        page: 1,
        pageSize: 1,
        total: fastRows.length,
        totalPages: 1,
        filters: {
          startDate, endDate, poNumber, buyer: buyerSearch, seller: sellerSearch,
          minAmount, maxAmount, sortBy, sortOrder: sortDir.toLowerCase(),
        },
        timestamp: new Date().toISOString(),
        fastPath: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const sql = `
      WITH filtered AS (
        SELECT
          a."poNumber",
          a."amount",
          a."status",
          a."created_at",
          b."phone"        AS "buyerPhone",
          b."businessName" AS "buyerBusinessName",
          s."phone"        AS "sellerPhone",
          s."businessName" AS "sellerBusinessName"
        FROM "purchaseOrder"."purchaseOrder" a
        JOIN "users"."buyer"  b ON b."id" = a."buyerId"
        JOIN "users"."seller" s ON s."id" = a."sellerId"
        WHERE s."isD2RBrandSeller" = TRUE
          AND a."status" = 'DRAFT'
          AND a."created_at"::date >= $1::date
          AND a."created_at"::date <= $2::date
          AND ($3::text IS NULL OR a."poNumber"::text ILIKE $3 ESCAPE '\\')
          AND ($4::text IS NULL OR b."businessName" ILIKE $4 ESCAPE '\\' OR b."phone" ILIKE $4 ESCAPE '\\')
          AND ($5::text IS NULL OR s."businessName" ILIKE $5 ESCAPE '\\' OR s."phone" ILIKE $5 ESCAPE '\\')
          AND ($6::numeric IS NULL OR a."amount"::numeric >= $6)
          AND ($7::numeric IS NULL OR a."amount"::numeric <= $7)
      )
      SELECT json_build_object(
        'rows', COALESCE((
          SELECT json_agg(row_to_json(t)) FROM (
            SELECT *
            FROM filtered
            ORDER BY ${sortColSql} ${sortDir} NULLS LAST, "poNumber" DESC
            LIMIT $8 OFFSET $9
          ) t
        ), '[]'::json),
        'total', (SELECT COUNT(*) FROM filtered)
      ) AS result;
    `;

    const rows = await query<ResultRow>(sql, params);
    const r = rows[0]?.result;
    const total = r?.total ?? 0;
    const data = r?.rows ?? [];

    return NextResponse.json({
      rows: data,
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
      filters: {
        startDate, endDate, poNumber, buyer: buyerSearch, seller: sellerSearch,
        minAmount, maxAmount, sortBy, sortOrder: sortDir.toLowerCase(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
