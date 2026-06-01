import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Margin Overview — daily P&L for D2R brand sellers on third-party INTERCITY orders.
 *
 *   baDHOMARGIN        = po.amount * (seller badhoFees % / 100)
 *   operationalCostRs  = discount_on_payment_preference_from_badho
 *                        + appliedOfferDiscount
 *                        + deliveryCharge (only when seller bears forward delivery cost)
 *                        + reward wallet credits
 *   profitAndLossRs    = totalMargin - totalOperationalCost
 *
 * `days` query param controls the latest-delivery lookback window (default 30).
 */

interface Row {
  Date: string;
  totalOrders: string;
  totalPoAmount: string | null;
  totalMargin: string | null;
  totalOperationalCost: string | null;
  profitAndLossRs: string | null;
  status: string;
  profitAndLossPercentage_Of_GTV: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysRaw = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

  const sql = `
    WITH latest_delivery AS (
      SELECT DISTINCT ON (di."purchaseOrderId")
        di."id" AS "deliveryId",
        di."purchaseOrderId",
        di."trackingInfo",
        di."status",
        di."codAmountToBeCollected",
        di."created_at",
        di."deliveryCharge"
      FROM "deliveries"."intercityDelivery" di
      WHERE di."created_at" >= CURRENT_DATE - make_interval(days => $1)
      ORDER BY di."purchaseOrderId", di."created_at" DESC, di."id" DESC
    ),
    wallet_txns AS (
      SELECT
        "purchaseOrderId",
        SUM(CASE WHEN "type" = 'CREDIT' AND ("comment" ILIKE '%Reward for PO%' OR "comment" ILIKE '%Yah Reward Aapko%') THEN "amount" END) AS "rewardAmount",
        SUM(CASE WHEN "type" = 'CREDIT' AND "comment" ILIKE '%Payment settled for%' THEN "amount" END) AS "OrderWalletTransctionAmount",
        SUM(CASE WHEN "type" = 'CREDIT' THEN "amount" END) AS "amountForPo"
      FROM "promotions"."sellerWalletTransaction"
      WHERE "purchaseOrderId" IN (SELECT "purchaseOrderId" FROM latest_delivery)
      GROUP BY 1
    ),
    order_base AS (
      SELECT DISTINCT
        po."id" AS po_id,
        po."created_at"::date AS order_date,
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
      LEFT JOIN "payments"."paymentRefundRecord" pf
             ON pf."purchaseOrderId" = po."id"
            AND pf."status" = 'COMPLETED'
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
      order_date                                                     AS "Date",
      COUNT(po_id)                                                   AS "totalOrders",
      SUM(po_amount)                                                 AS "totalPoAmount",
      SUM(badho_margin_rs)                                           AS "totalMargin",
      SUM(operational_cost_rs)                                       AS "totalOperationalCost",
      SUM(badho_margin_rs) - SUM(operational_cost_rs)               AS "profitAndLossRs",
      CASE
        WHEN (SUM(badho_margin_rs) - SUM(operational_cost_rs)) > 0 THEN 'Profit'
        WHEN (SUM(badho_margin_rs) - SUM(operational_cost_rs)) < 0 THEN 'Loss'
        ELSE 'Breakeven'
      END AS "status",
      ROUND(
        (((SUM(badho_margin_rs) - SUM(operational_cost_rs)) * 100.0) / NULLIF(SUM(po_amount), 0))::numeric,
        2
      ) AS "profitAndLossPercentage_Of_GTV"
    FROM order_base
    GROUP BY order_date
    ORDER BY order_date DESC;
  `;

  try {
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({
      date: r.Date,
      totalOrders: Number(r.totalOrders) || 0,
      totalPoAmount: Number(r.totalPoAmount) || 0,
      totalMargin: Number(r.totalMargin) || 0,
      totalOperationalCost: Number(r.totalOperationalCost) || 0,
      profitAndLossRs: Number(r.profitAndLossRs) || 0,
      status: r.status,
      pnlPercentOfGtv: r.profitAndLossPercentage_Of_GTV === null ? null : Number(r.profitAndLossPercentage_Of_GTV),
    }));

    const totals = data.reduce(
      (acc, d) => {
        acc.totalOrders += d.totalOrders;
        acc.totalPoAmount += d.totalPoAmount;
        acc.totalMargin += d.totalMargin;
        acc.totalOperationalCost += d.totalOperationalCost;
        acc.profitAndLossRs += d.profitAndLossRs;
        return acc;
      },
      { totalOrders: 0, totalPoAmount: 0, totalMargin: 0, totalOperationalCost: 0, profitAndLossRs: 0 }
    );

    const pnlPercentOfGtv = totals.totalPoAmount > 0
      ? Math.round((totals.profitAndLossRs * 10000) / totals.totalPoAmount) / 100
      : null;

    const profitDays = data.filter((d) => d.profitAndLossRs > 0).length;
    const lossDays = data.filter((d) => d.profitAndLossRs < 0).length;

    return NextResponse.json({
      days,
      data,
      totals: { ...totals, pnlPercentOfGtv, profitDays, lossDays },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
