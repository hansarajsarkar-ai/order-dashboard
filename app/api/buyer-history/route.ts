import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Canonical "order placed" moment: prefer markedPendingTime, fall back to created_at
// so abandoned/auto-rejected carts (which never get markedPendingTime) still count
// toward the buyer's complete relationship history.
const ORDER_TS = `COALESCE(po."markedPendingTime", po."created_at")`;

// Scope to genuine, non-test orders within the dashboard's intercity / third-party
// universe, so the buyer's history matches the numbers shown in the drill tables.
const BASE_WHERE = `
  po."isTest"       = FALSE
  AND po."isFalseOrder" = FALSE
  AND po."status"  != 'DRAFT'
  AND po."deliveryType"    = 'INTERCITY'
  AND po."deliveryNetwork" = 'THIRD_PARTY'
`;

// Drafts are carts that were started but never placed: status = 'DRAFT', so they have
// no markedPendingTime — created_at is the only timestamp. Same intercity / third-party
// scope as the rest of the modal.
const DRAFT_WHERE = `
  po."isTest"       = FALSE
  AND po."isFalseOrder" = FALSE
  AND po."status"   = 'DRAFT'
  AND po."deliveryType"    = 'INTERCITY'
  AND po."deliveryNetwork" = 'THIRD_PARTY'
`;

interface SummaryRow {
  total_orders: string;
  completed: string;
  rejected: string;
  cancelled: string;
  pending: string;
  inprogress: string;
  dispatched: string;
  first_order: string | null;
  last_order: string | null;
  days_since_last: number | null;
  last_marked_pending: string | null;
  days_since_last_marked_pending: number | null;
  completed_gmv: string;
  rejected_gmv: string;
  cancelled_gmv: string;
  pending_gmv: string;
  inprogress_gmv: string;
  dispatched_gmv: string;
  total_gmv: string;
}
interface SkuRow { brand: string; sku: string; order_count: string; qty: string; amount: string; }
interface BrandRow { brand: string; order_count: string; qty: string; amount: string; }
interface MonthRow { ym: string; orders: string; gmv: string; }
interface DraftRow { draft_count: string; last_draft: string | null; days_since_last_draft: number | null; }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let buyerId = searchParams.get('buyerId');
  const phone = searchParams.get('phone');
  const businessName = searchParams.get('businessName');

  try {
    // Resolve buyerId from phone/businessName if not supplied directly.
    if (!buyerId) {
      if (!phone && !businessName) {
        return NextResponse.json({ error: 'buyerId, phone or businessName required' }, { status: 400 });
      }
      const lp: string[] = [];
      const lw: string[] = [];
      if (phone) { lp.push(phone); lw.push(`b."phone" = $${lp.length}`); }
      if (businessName) { lp.push(businessName); lw.push(`b."businessName" = $${lp.length}`); }
      const found = await query<{ id: string }>(
        `SELECT b."id"::text AS id FROM "users"."buyer" b WHERE ${lw.join(' AND ')} ORDER BY b."created_at" DESC NULLS LAST LIMIT 1`,
        lp
      );
      if (found.length === 0) {
        return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      }
      buyerId = found[0].id;
    }

    const p = [buyerId];

    const summarySql = `
      SELECT
        COUNT(*)                                                                AS total_orders,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))        AS completed,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                        AS rejected,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                       AS cancelled,
        COUNT(*) FILTER (WHERE po."status" = 'PENDING')                         AS pending,
        COUNT(*) FILTER (WHERE po."status" = 'INPROGRESS')                      AS inprogress,
        COUNT(*) FILTER (WHERE po."status" = 'DISPATCHED')                      AS dispatched,
        MIN(${ORDER_TS})::text                                                  AS first_order,
        MAX(${ORDER_TS})::text                                                  AS last_order,
        EXTRACT(DAY FROM NOW() - MAX(${ORDER_TS}))::int                         AS days_since_last,
        MAX(po."markedPendingTime")::text                                       AS last_marked_pending,
        EXTRACT(DAY FROM NOW() - MAX(po."markedPendingTime"))::int              AS days_since_last_marked_pending,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS completed_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'REJECTED'), 0)::text   AS rejected_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'CANCELLED'), 0)::text  AS cancelled_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'PENDING'), 0)::text    AS pending_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'INPROGRESS'), 0)::text AS inprogress_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" = 'DISPATCHED'), 0)::text AS dispatched_gmv,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text                            AS total_gmv
      FROM "purchaseOrder"."purchaseOrder" po
      WHERE po."buyerId" = $1 AND ${BASE_WHERE};
    `;

    const itemJoin = `
      JOIN "purchaseOrder"."purchaseOrderItem" poi ON poi."purchaseOrderId" = po."id"
      LEFT JOIN "brands"."brandSKU" bsku ON bsku."id" = poi."brandSKUId"
    `;
    const itemFilter = `
      AND poi."status" != 'DRAFT'
      AND poi."comboBrandSKUPOItemId" IS NULL
      AND COALESCE(poi."isArchived", FALSE) = FALSE
    `;

    const topSkusSql = `
      SELECT
        COALESCE(bsku."brandLabel", '—')             AS brand,
        COALESCE(bsku."label", '—')                  AS sku,
        COUNT(DISTINCT po."id")                      AS order_count,
        COALESCE(SUM(poi."quantity"), 0)::text       AS qty,
        COALESCE(SUM(poi."amount"::numeric), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      ${itemJoin}
      WHERE po."buyerId" = $1 AND ${BASE_WHERE} ${itemFilter}
      GROUP BY bsku."brandLabel", bsku."label"
      ORDER BY order_count DESC, qty DESC NULLS LAST
      LIMIT 6;
    `;

    const topBrandsSql = `
      SELECT
        COALESCE(bsku."brandLabel", '—')             AS brand,
        COUNT(DISTINCT po."id")                      AS order_count,
        COALESCE(SUM(poi."quantity"), 0)::text       AS qty,
        COALESCE(SUM(poi."amount"::numeric), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      ${itemJoin}
      WHERE po."buyerId" = $1 AND ${BASE_WHERE} ${itemFilter}
      GROUP BY bsku."brandLabel"
      ORDER BY order_count DESC, qty DESC NULLS LAST
      LIMIT 5;
    `;

    const monthlySql = `
      SELECT
        to_char(date_trunc('month', ${ORDER_TS}), 'YYYY-MM')                    AS ym,
        COUNT(*)                                                                AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS gmv
      FROM "purchaseOrder"."purchaseOrder" po
      WHERE po."buyerId" = $1 AND ${BASE_WHERE}
        AND ${ORDER_TS} >= (NOW() - INTERVAL '12 months')
      GROUP BY 1
      ORDER BY 1;
    `;

    const draftSql = `
      SELECT
        COUNT(*)                                                AS draft_count,
        MAX(po."created_at")::text                              AS last_draft,
        EXTRACT(DAY FROM NOW() - MAX(po."created_at"))::int     AS days_since_last_draft
      FROM "purchaseOrder"."purchaseOrder" po
      WHERE po."buyerId" = $1 AND ${DRAFT_WHERE};
    `;

    const [summaryRows, skuRows, brandRows, monthRows, draftRows] = await Promise.all([
      query<SummaryRow>(summarySql, p),
      query<SkuRow>(topSkusSql, p),
      query<BrandRow>(topBrandsSql, p),
      query<MonthRow>(monthlySql, p),
      query<DraftRow>(draftSql, p),
    ]);

    const s = summaryRows[0];
    const total = parseInt(s.total_orders) || 0;
    const completed = parseInt(s.completed) || 0;
    const rejected = parseInt(s.rejected) || 0;
    const d = draftRows[0];

    const summary = {
      totalOrders: total,
      completed,
      rejected,
      cancelled: parseInt(s.cancelled) || 0,
      pending: parseInt(s.pending) || 0,
      inprogress: parseInt(s.inprogress) || 0,
      dispatched: parseInt(s.dispatched) || 0,
      firstOrder: s.first_order,
      lastOrder: s.last_order,
      daysSinceLast: s.days_since_last == null ? null : Number(s.days_since_last),
      lastMarkedPending: s.last_marked_pending,
      daysSinceLastMarkedPending: s.days_since_last_marked_pending == null ? null : Number(s.days_since_last_marked_pending),
      completedGmv: parseFloat(s.completed_gmv) || 0,
      rejectedGmv: parseFloat(s.rejected_gmv) || 0,
      cancelledGmv: parseFloat(s.cancelled_gmv) || 0,
      pendingGmv: parseFloat(s.pending_gmv) || 0,
      inprogressGmv: parseFloat(s.inprogress_gmv) || 0,
      dispatchedGmv: parseFloat(s.dispatched_gmv) || 0,
      totalGmv: parseFloat(s.total_gmv) || 0,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      rejectionRate: total > 0 ? (rejected / total) * 100 : 0,
      draftCount: d ? parseInt(d.draft_count) || 0 : 0,
      lastDraft: d ? d.last_draft : null,
      daysSinceLastDraft: d && d.days_since_last_draft != null ? Number(d.days_since_last_draft) : null,
    };

    const topSkus = skuRows.map((r) => ({
      brand: r.brand,
      sku: r.sku,
      orderCount: parseInt(r.order_count) || 0,
      qty: parseInt(r.qty) || 0,
      amount: parseFloat(r.amount) || 0,
    }));

    const topBrands = brandRows.map((r) => ({
      brand: r.brand,
      orderCount: parseInt(r.order_count) || 0,
      qty: parseInt(r.qty) || 0,
      amount: parseFloat(r.amount) || 0,
    }));

    const monthly = monthRows.map((r) => ({
      ym: r.ym,
      orders: parseInt(r.orders) || 0,
      gmv: parseFloat(r.gmv) || 0,
    }));

    return NextResponse.json({
      buyerId,
      summary,
      topSkus,
      topBrands,
      monthly,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
