import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface MonthRow { month: string; count: string; amount: string; }
interface SellerRow {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  pushed_count: string; pushed_amount: string;
  delivered_count: string; delivered_amount: string;
  rto_count: string; rto_amount: string;
}
interface StateRow {
  state: string | null;
  pushed_count: string; pushed_amount: string;
  delivered_count: string; delivered_amount: string;
  rto_count: string; rto_amount: string;
}
interface GrandRow { count: string; amount: string; }
interface DeliveredRow { delivered_count: string; }

const STD_FILTERS = `
  AND po."isTest"          = FALSE
  AND po."isFalseOrder"    = FALSE
  AND b."isTest"           = FALSE
  AND b."businessName" NOT ILIKE '%test%'
  AND s."isTest"           = FALSE
  AND s."businessName" NOT ILIKE '%test%'
  AND s."businessName" NOT ILIKE '%milko%'
  AND s."isD2RBrandSeller" = TRUE
  AND po."deliveryNetwork" = 'THIRD_PARTY'
  AND po."deliveryType"    = 'INTERCITY'
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    // 1. Grand totals + monthly buckets (RTO = REJECTED + deliveryStatus contains RTO)
    const monthlySql = `
      SELECT
        EXTRACT(MONTH FROM po."markedRejectedTime")::int   AS month,
        COUNT(*)                                            AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text        AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status" = 'REJECTED'
        AND po."deliveryStatus" ILIKE '%RTO%'
        AND po."markedRejectedTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedRejectedTime") = $1
        ${STD_FILTERS}
      GROUP BY EXTRACT(MONTH FROM po."markedRejectedTime")
      ORDER BY month;
    `;
    const monthlyRows = await query<MonthRow>(monthlySql, [year]);

    // 2. Top sellers — funnel (pushed → delivered → RTO) for orders pushed in $year
    const sellerSql = `
      SELECT
        s."id"::text                                  AS seller_id,
        s."phone"                                     AS seller_phone,
        s."businessName"                              AS seller_business_name,
        COUNT(*)                                                                                            AS pushed_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                                        AS pushed_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                                    AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%')              AS rto_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%'), 0)::text AS rto_amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${STD_FILTERS}
      GROUP BY s."id", s."phone", s."businessName"
      HAVING COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%') > 0
      ORDER BY rto_count DESC;
    `;
    const sellerRows = await query<SellerRow>(sellerSql, [year]);

    // 3. Top states — funnel (pushed → delivered → RTO) for orders pushed in $year
    const stateSql = `
      SELECT
        b."state"                                                                                           AS state,
        COUNT(*)                                                                                            AS pushed_count,
        COALESCE(SUM(po."amount"::numeric), 0)::text                                                        AS pushed_amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                                    AS delivered_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%')              AS rto_count,
        COALESCE(SUM(po."amount"::numeric) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%'), 0)::text AS rto_amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${STD_FILTERS}
      GROUP BY b."state"
      HAVING COUNT(*) FILTER (WHERE po."status" = 'REJECTED' AND po."deliveryStatus" ILIKE '%RTO%') > 0
      ORDER BY rto_count DESC;
    `;
    const stateRows = await query<StateRow>(stateSql, [year]);

    // 4. Grand RTO totals
    const grandSql = `
      SELECT
        COUNT(*)                                      AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text  AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status" = 'REJECTED'
        AND po."deliveryStatus" ILIKE '%RTO%'
        AND po."markedRejectedTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedRejectedTime") = $1
        ${STD_FILTERS};
    `;
    const grandRows = await query<GrandRow>(grandSql, [year]);

    // 5. Delivered (DELIVERED + COMPLETED) count for RTO-rate denominator
    const deliveredSql = `
      SELECT COUNT(*) AS delivered_count
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${STD_FILTERS};
    `;
    const deliveredRows = await query<DeliveredRow>(deliveredSql, [year]);

    const byMonth = monthlyRows.map((r) => ({
      month: parseInt(String(r.month)),
      count: parseInt(r.count),
      amount: parseFloat(r.amount),
    }));

    const topSellers = sellerRows.map((r) => {
      const pushedCount = parseInt(r.pushed_count);
      const deliveredCount = parseInt(r.delivered_count);
      const rtoCount = parseInt(r.rto_count);
      const denom = rtoCount + deliveredCount;
      return {
        sellerId: r.seller_id,
        sellerPhone: r.seller_phone,
        sellerBusinessName: r.seller_business_name,
        pushedCount,
        pushedAmount: parseFloat(r.pushed_amount),
        deliveredCount,
        deliveredAmount: parseFloat(r.delivered_amount),
        rtoCount,
        rtoAmount: parseFloat(r.rto_amount),
        rtoRate: denom > 0 ? parseFloat(((rtoCount / denom) * 100).toFixed(2)) : 0,
      };
    });

    const topStates = stateRows.map((r) => {
      const pushedCount = parseInt(r.pushed_count);
      const deliveredCount = parseInt(r.delivered_count);
      const rtoCount = parseInt(r.rto_count);
      const denom = rtoCount + deliveredCount;
      return {
        state: r.state,
        pushedCount,
        pushedAmount: parseFloat(r.pushed_amount),
        deliveredCount,
        deliveredAmount: parseFloat(r.delivered_amount),
        rtoCount,
        rtoAmount: parseFloat(r.rto_amount),
        rtoRate: denom > 0 ? parseFloat(((rtoCount / denom) * 100).toFixed(2)) : 0,
      };
    });

    const grand = {
      count: parseInt(grandRows[0]?.count || '0'),
      amount: parseFloat(grandRows[0]?.amount || '0'),
    };

    const deliveredCount = parseInt(deliveredRows[0]?.delivered_count || '0');
    const rtoRate = deliveredCount > 0
      ? parseFloat(((grand.count / (deliveredCount + grand.count)) * 100).toFixed(2))
      : 0;
    const avgRtoValue = grand.count > 0 ? Math.round(grand.amount / grand.count) : 0;

    return NextResponse.json({
      grand,
      deliveredCount,
      rtoRate,
      avgRtoValue,
      byMonth,
      topSellers,
      topStates,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
