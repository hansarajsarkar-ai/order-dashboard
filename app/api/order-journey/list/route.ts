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
const PAGE_SIZES = [25, 50, 75, 100];
const CSV_CAP = 20000;

const num = (v: string | null | undefined): number | null =>
  v != null && v !== '' ? parseFloat(v) : null;

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get('from') || DEFAULT_FROM).trim();
  const to = (searchParams.get('to') || '').trim();
  const isCsv = searchParams.get('format') === 'csv';
  const pageSizeRaw = parseInt(searchParams.get('pageSize') || '50', 10);
  const PAGE_SIZE = PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 50;
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;
  // CSV exports the whole filtered set (capped); the table uses page/pageSize.
  const limit = isCsv ? CSV_CAP : PAGE_SIZE;
  const sliceOffset = isCsv ? 0 : offset;

  // Validate dates (YYYY-MM-DD) to keep them safe for inlining.
  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromDate = dateOk(from) ? from : DEFAULT_FROM;
  const toClause = dateOk(to)
    ? `AND COALESCE(po."markedPendingTime", po."created_at_actual", po."created_at") < ('${to}'::date + INTERVAL '1 day')`
    : '';

  // Status filter (comma-separated). Only uppercase A–Z tokens are accepted, so
  // they can be inlined safely as quoted literals (no bind params via run_sql).
  const statuses = (searchParams.get('status') || '')
    .split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]+$/.test(s));
  const statusClause = statuses.length
    ? `AND po."status" IN (${statuses.map((s) => `'${s}'`).join(', ')})`
    : '';

  // Shipment-status filter. NONE (not shipped) and CANCELLED are excluded so
  // this row stays mutually exclusive with the PO Status row.
  const delivery = (searchParams.get('delivery') || '')
    .split(',').map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z_]+$/.test(s) && s !== 'NONE' && s !== 'CANCELLED');
  const deliveryClause = delivery.length
    ? `AND po."deliveryStatus" IN (${delivery.map((s) => `'${s}'`).join(', ')})`
    : '';

  // Shared filter — placed date derived with a fallback so orders missing
  // markedPendingTime still appear. whereBase excludes the status filter so the
  // status facet counts stay stable as chips are toggled.
  const whereBase = `
    s."isD2RBrandSeller" = TRUE
    AND po."deliveryType" = 'INTERCITY'
    AND po."isTest" = FALSE
    AND po."status" <> 'DRAFT'
    AND s."isTest" = FALSE
    AND s."businessName" NOT ILIKE '%test%'
    AND b."isTest" = FALSE
    AND b."businessName" NOT ILIKE '%test%'
    AND COALESCE(po."markedPendingTime", po."created_at_actual", po."created_at") >= '${fromDate}'::date
    ${toClause}
  `;
  const whereCore = `${whereBase} ${statusClause} ${deliveryClause}`;

  try {
    // All interpolated values (dates, statuses, page size, offset) are validated
    // or numeric, so the queries take no bind params.
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
        LIMIT ${limit} OFFSET ${sliceOffset}
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

    // Per-status counts over the date range (ignores the status filter so the
    // chips show stable totals).
    const facetSql = `
      SELECT po."status" AS status, COUNT(*) AS n
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE ${whereBase}
      GROUP BY po."status"
      ORDER BY n DESC;
    `;

    // Shipment-status facets (over the date range only, so the chips stay
    // stable). Excludes NULL ("not shipped") and CANCELLED so the shipment row
    // stays mutually exclusive with the PO Status row (CANCELLED is a PO status).
    const deliveryFacetSql = `
      SELECT po."deliveryStatus" AS ds, COUNT(*) AS n
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE ${whereBase}
        AND po."deliveryStatus" IS NOT NULL
        AND po."deliveryStatus" <> 'CANCELLED'
      GROUP BY po."deliveryStatus"
      ORDER BY n DESC;
    `;

    // CSV export — the filtered set (no facets/count needed), capped at CSV_CAP.
    if (isCsv) {
      const csvRows = await query<Record<string, string | null>>(listSql, []);
      const header = ['PO Number', 'Placed', 'Seller', 'Buyer', 'City', 'State', 'Status', 'Delivery Status', 'Amount', 'Courier', 'AWB'];
      const lines = [header.join(',')];
      for (const r of csvRows) {
        lines.push([
          r.poNumber, r.placed, r.seller, r.buyer, r.buyerCity, r.buyerState,
          r.status, r.deliveryStatus, r.amount, r.partner, r.awb,
        ].map(csvCell).join(','));
      }
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="order-journey-${fromDate}${dateOk(to) ? `_to_${to}` : ''}.csv"`,
        },
      });
    }

    const [rows, countRows, facetRows, deliveryFacetRows] = await Promise.all([
      query<Record<string, string | null>>(listSql, []),
      query<{ n: string }>(countSql, []),
      query<{ status: string | null; n: string }>(facetSql, []),
      query<{ ds: string | null; n: string }>(deliveryFacetSql, []),
    ]);

    const total = parseInt(countRows[0]?.n || '0', 10);
    const facets = facetRows
      .filter((f) => f.status)
      .map((f) => ({ status: f.status as string, count: parseInt(f.n, 10) }));
    const deliveryFacets = deliveryFacetRows
      .filter((f) => f.ds)
      .map((f) => ({ status: f.ds as string, count: parseInt(f.n, 10) }));
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
      statuses,
      facets,
      delivery,
      deliveryFacets,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
