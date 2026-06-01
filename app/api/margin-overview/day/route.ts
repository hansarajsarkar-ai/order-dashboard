import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Margin Overview — per-order drill-down for a single day.
 *
 * Returns the individual D2R / third-party INTERCITY orders that make up one
 * row of the daily P&L table (same filters & cost model as /api/margin-overview).
 * Requires `date` (the order_date bucket, YYYY-MM-DD). The delivery lookback
 * window must match the parent table, so pass the same `days` OR
 * `startDate`+`endDate` params the table is using.
 */

interface Row {
  poId: string;
  poNumber: string | null;
  orderDate: string;
  sellerName: string | null;
  buyerName: string | null;
  poAmount: string | null;
  marginRs: string | null;
  operationalCostRs: string | null;
  profitAndLossRs: string | null;
  status: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!date || !isoDate.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const useCustom = !!startDate && !!endDate && isoDate.test(startDate) && isoDate.test(endDate);

  const daysRaw = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

  // Keep the latest-delivery window identical to the parent table so the order
  // set matches exactly, then filter down to the clicked order_date.
  const deliveryFilter = useCustom
    ? `di."created_at" >= $1::date AND di."created_at" < ($2::date + 1)`
    : `di."created_at" >= CURRENT_DATE - make_interval(days => $1)`;
  const params: unknown[] = useCustom ? [startDate, endDate, date] : [days, date];
  const dateParam = useCustom ? '$3' : '$2';

  const sql = `
    WITH latest_delivery AS (
      SELECT DISTINCT ON (di."purchaseOrderId")
        di."id" AS "deliveryId",
        di."purchaseOrderId",
        di."created_at",
        di."deliveryCharge"
      FROM "deliveries"."intercityDelivery" di
      WHERE ${deliveryFilter}
      ORDER BY di."purchaseOrderId", di."created_at" DESC, di."id" DESC
    ),
    wallet_txns AS (
      SELECT
        "purchaseOrderId",
        SUM(CASE WHEN "type" = 'CREDIT' AND ("comment" ILIKE '%Reward for PO%' OR "comment" ILIKE '%Yah Reward Aapko%') THEN "amount" END) AS "rewardAmount"
      FROM "promotions"."sellerWalletTransaction"
      WHERE "purchaseOrderId" IN (SELECT "purchaseOrderId" FROM latest_delivery)
      GROUP BY 1
    ),
    order_base AS (
      SELECT DISTINCT
        po."id" AS po_id,
        po."poNumber" AS po_number,
        po."created_at"::date AS order_date,
        s."businessName" AS seller_name,
        b."businessName" AS buyer_name,
        po."amount" AS po_amount,
        po."amount" * (COALESCE((s."deliveryChargesJSON"->'badhoFees'->>'value')::numeric, 0) / 100.0) AS badho_margin_rs,
        CASE WHEN LOWER(s."deliveryChargesJSON"->>'forwardDeliveryCostToSeller') = 'false' THEN
          (COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0) + COALESCE(po."appliedOfferDiscount", 0) + COALESCE(dv."deliveryCharge", 0) + COALESCE(wt."rewardAmount", 0))
        ELSE
          (COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0) + COALESCE(po."appliedOfferDiscount", 0) + COALESCE(wt."rewardAmount", 0))
        END AS operational_cost_rs
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      JOIN latest_delivery dv ON dv."purchaseOrderId" = po."id"
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
             ON pop."purchaseOrderId" = po."id"
            AND pop."status" = 'COMPLETED'
            AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      LEFT JOIN wallet_txns as wt ON wt."purchaseOrderId" = po."id"
      WHERE s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isTest"          = FALSE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."isFalseOrder"    = FALSE
    )
    SELECT
      po_id                                              AS "poId",
      po_number::text                                    AS "poNumber",
      order_date                                         AS "orderDate",
      seller_name                                        AS "sellerName",
      buyer_name                                         AS "buyerName",
      po_amount                                          AS "poAmount",
      badho_margin_rs                                    AS "marginRs",
      operational_cost_rs                                AS "operationalCostRs",
      badho_margin_rs - operational_cost_rs              AS "profitAndLossRs",
      CASE
        WHEN (badho_margin_rs - operational_cost_rs) > 0 THEN 'Profit'
        WHEN (badho_margin_rs - operational_cost_rs) < 0 THEN 'Loss'
        ELSE 'Breakeven'
      END AS "status"
    FROM order_base
    WHERE order_date = ${dateParam}::date
    ORDER BY (badho_margin_rs - operational_cost_rs) ASC;
  `;

  try {
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poId: r.poId,
      poNumber: r.poNumber,
      orderDate: r.orderDate,
      sellerName: r.sellerName,
      buyerName: r.buyerName,
      poAmount: Number(r.poAmount) || 0,
      marginRs: Number(r.marginRs) || 0,
      operationalCostRs: Number(r.operationalCostRs) || 0,
      profitAndLossRs: Number(r.profitAndLossRs) || 0,
      status: r.status,
    }));

    const totals = data.reduce(
      (acc, d) => {
        acc.poAmount += d.poAmount;
        acc.marginRs += d.marginRs;
        acc.operationalCostRs += d.operationalCostRs;
        acc.profitAndLossRs += d.profitAndLossRs;
        return acc;
      },
      { poAmount: 0, marginRs: 0, operationalCostRs: 0, profitAndLossRs: 0 }
    );

    return NextResponse.json({
      date,
      count: data.length,
      data,
      totals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
