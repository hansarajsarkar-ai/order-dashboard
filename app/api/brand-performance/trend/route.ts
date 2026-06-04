import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  bucket: string;
  total_orders: string;
  delivered_orders: string;
  rejected_orders: string;
  cancelled_orders: string;
  delivered_amount: string;
  total_amount: string;
  buyer_count: string;
}

// Time-series trend for the Brand Performance Chart tab.
// ?granularity=day|week|month (default month)
// Returns one row per bucket with total/delivered/rejected/cancelled order
// counts, delivered & total GMV, and distinct buyers. The UI derives delivery
// success % and AOV from these.
//
// Same WHERE clause as the other brand-performance endpoints (D2R brand-seller,
// intercity 3PL, real non-test orders, markedPendingTime not null) so the
// numbers tie back to the rest of the page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');
  const gParam = searchParams.get('granularity');
  const granularity: 'day' | 'week' | 'month' =
    gParam === 'day' ? 'day' : gParam === 'week' ? 'week' : 'month';

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

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    const sql = `
      SELECT
        DATE_TRUNC('${granularity}', po."markedPendingTime")::date              AS bucket,
        COUNT(*)                                                                AS total_orders,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))        AS delivered_orders,
        COUNT(*) FILTER (WHERE po."status" = 'REJECTED')                        AS rejected_orders,
        COUNT(*) FILTER (WHERE po."status" = 'CANCELLED')                       AS cancelled_orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric))
          FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text     AS delivered_amount,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric)), 0)::text                            AS total_amount,
        COUNT(DISTINCT po."buyerId")                                            AS buyer_count
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
        AND po."status"          != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${brandFilter}
      GROUP BY bucket
      ORDER BY bucket;
    `;
    const rows = await query<Row>(sql, params);

    interface Point {
      bucket: string;
      totalOrders: number;
      deliveredOrders: number;
      rejectedOrders: number;
      cancelledOrders: number;
      deliveredAmount: number;
      totalAmount: number;
      buyers: number;
      successPct: number;
      aov: number;
    }

    const data: Point[] = rows.map((r) => {
      const totalOrders = parseInt(r.total_orders);
      const deliveredOrders = parseInt(r.delivered_orders);
      const rejectedOrders = parseInt(r.rejected_orders);
      const cancelledOrders = parseInt(r.cancelled_orders);
      const deliveredAmount = parseFloat(r.delivered_amount);
      const totalAmount = parseFloat(r.total_amount);
      const buyers = parseInt(r.buyer_count);
      return {
        bucket: r.bucket,
        totalOrders,
        deliveredOrders,
        rejectedOrders,
        cancelledOrders,
        deliveredAmount,
        totalAmount,
        buyers,
        successPct: totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0,
        aov: deliveredOrders > 0 ? deliveredAmount / deliveredOrders : 0,
      };
    });

    const totals = data.reduce(
      (acc, p) => {
        acc.totalOrders += p.totalOrders;
        acc.deliveredOrders += p.deliveredOrders;
        acc.rejectedOrders += p.rejectedOrders;
        acc.cancelledOrders += p.cancelledOrders;
        acc.deliveredAmount += p.deliveredAmount;
        acc.totalAmount += p.totalAmount;
        acc.buyers += p.buyers;
        return acc;
      },
      { totalOrders: 0, deliveredOrders: 0, rejectedOrders: 0, cancelledOrders: 0, deliveredAmount: 0, totalAmount: 0, buyers: 0 },
    );

    return NextResponse.json({
      data,
      totals: {
        ...totals,
        successPct: totals.totalOrders > 0 ? (totals.deliveredOrders / totals.totalOrders) * 100 : 0,
        aov: totals.deliveredOrders > 0 ? totals.deliveredAmount / totals.deliveredOrders : 0,
      },
      granularity,
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
