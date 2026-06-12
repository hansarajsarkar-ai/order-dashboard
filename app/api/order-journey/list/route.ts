import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * D2R orders list for the Order Journey landing table — every D2R order
 * (seller.isD2RBrandSeller AND deliveryType=INTERCITY) placed on/after the
 * cutoff (default 2026-01-15), newest first, paginated. Each row links to the
 * single-PO journey. Courier partner + AWB are resolved per-page (LATERAL on
 * the latest intercityDelivery) so the join only runs for the visible rows.
 */

const DEFAULT_FROM = '2026-01-15';
const PAGE_SIZE = 50;

const num = (v: string | null | undefined): number | null =>
  v != null && v !== '' ? parseFloat(v) : null;

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get('from') || DEFAULT_FROM).trim();
  const to = (searchParams.get('to') || '').trim();
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  // Validate dates (YYYY-MM-DD) to keep them safe for inlining.
  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromDate = dateOk(from) ? from : DEFAULT_FROM;
  const toClause = dateOk(to)
    ? `AND COALESCE(po."markedPendingTime", po."created_at_actual", po."created_at") < ($3::date + INTERVAL '1 day')`
    : '';

  // Shared filter — placed date derived with a fallback so orders missing
  // markedPendingTime still appear.
  const whereCore = `
    s."isD2RBrandSeller" = TRUE
    AND po."deliveryType" = 'INTERCITY'
    AND po."isTest" = FALSE
    AND po."status" <> 'DRAFT'
    AND s."isTest" = FALSE
    AND s."businessName" NOT ILIKE '%test%'
    AND b."isTest" = FALSE
    AND b."businessName" NOT ILIKE '%test%'
    AND COALESCE(po."markedPendingTime", po."created_at_actual", po."created_at") >= $1::date
    ${toClause}
  `;

  try {
    const params: unknown[] = [fromDate, PAGE_SIZE];
    if (toClause) params.push(to);
    // OFFSET param index depends on whether `to` was added.
    const offsetIdx = toClause ? 4 : 3;
    params.push(offset);

    const listSql = `
      WITH base AS (
        SELECT
          po."id" AS id,
          po."poNumber" AS "poNumber",
          COALESCE(po."markedPendingTime", po."created_at_actual", po."created_at") AS placed,
          po."status" AS status,
          po."deliveryStatus" AS "deliveryStatus",
          po."amount"::text AS amount,
          s."businessName" AS seller,
          b."businessName" AS buyer,
          po."buyerCity" AS "buyerCity",
          po."buyerState" AS "buyerState"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        WHERE ${whereCore}
        ORDER BY placed DESC
        LIMIT $2 OFFSET $${offsetIdx}
      )
      SELECT
        base."poNumber", base.placed, base.status, base."deliveryStatus",
        base.amount, base.seller, base.buyer, base."buyerCity", base."buyerState",
        di."partner", di."awb"
      FROM base
      LEFT JOIN LATERAL (
        SELECT d."deliveryPartnerId" AS "partner",
               COALESCE(d."trackingInfo"->>'awbNumber', d."latestLogDetails"->>'awb', d."networkReferenceId") AS "awb"
        FROM "deliveries"."intercityDelivery" d
        WHERE d."purchaseOrderId" = base.id AND d."isTest" = FALSE
        ORDER BY d."created_at" DESC LIMIT 1
      ) di ON TRUE
      ORDER BY base.placed DESC;
    `;

    const countSql = `
      SELECT COUNT(*) AS n
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE ${whereCore};
    `;

    const countParams: unknown[] = [fromDate];
    if (toClause) countParams.push(to);

    const [rows, countRows] = await Promise.all([
      query<Record<string, string | null>>(listSql, params),
      query<{ n: string }>(countSql, countParams),
    ]);

    const total = parseInt(countRows[0]?.n || '0', 10);
    const data = rows.map((r) => ({
      poNumber: num(r.poNumber),
      placed: r.placed,
      status: r.status,
      deliveryStatus: r.deliveryStatus,
      amount: num(r.amount),
      seller: r.seller,
      buyer: r.buyer,
      buyerCity: r.buyerCity,
      buyerState: r.buyerState,
      partner: r.partner,
      awb: r.awb,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      from: fromDate,
      to: dateOk(to) ? to : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
