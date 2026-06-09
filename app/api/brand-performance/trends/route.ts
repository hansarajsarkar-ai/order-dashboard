import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Additive trends endpoint — surfaces BA-grade aggregations not already
// covered by /trend, /monthly-by-status, /brand-product-summary.
//   1. brandShare    — top-5 brands' share of delivered GMV per month + Others
//   2. dow           — day-of-week order rhythm (delivered)
//   3. cohort        — new vs returning buyers per month (within window)
//   4. funnel        — status pipeline drop-off with conversion %
//   5. topStates     — top 10 buyer states by delivered GMV
//   6. orderSize     — order-size histogram (₹ buckets) for delivered orders
//   7. monthlyAov    — AOV trend per month (all orders + delivered only)
//   8. kpiDelta      — current window vs immediately-prior comparable window

interface BrandMonthRow { month: string; brand: string; orders: string; amount: string; }
interface DowRow        { dow: string; orders: string; amount: string; }
interface CohortRow     { month: string; new_buyers: string; returning_buyers: string; orders: string; amount: string; }
interface FunnelRow     { status: string; orders: string; amount: string; }
interface StateRow      { state: string | null; orders: string; amount: string; buyers: string; }
interface OrderSizeRow  { bucket: string; orders: string; amount: string; }
interface MonthlyAovRow { month: string; orders: string; amount: string; delivered_orders: string; delivered_amount: string; }
interface GrandRow {
  orders: string; amount: string; buyers: string;
  delivered_orders: string; delivered_amount: string; delivered_buyers: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate   = searchParams.get('endDate');
  const brand     = searchParams.get('brand');

  try {
    // ── Resolve current + prior periods ──────────────────────────────────
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    let curStart: string, curEnd: string, prevStart: string, prevEnd: string;
    if (startDate && endDate) {
      curStart = startDate; curEnd = endDate;
      const start = new Date(curStart + 'T00:00:00Z');
      const end   = new Date(curEnd   + 'T00:00:00Z');
      const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const prevEndDate   = new Date(start.getTime() - 86400000);
      const prevStartDate = new Date(prevEndDate.getTime() - (days - 1) * 86400000);
      prevStart = fmt(prevStartDate); prevEnd = fmt(prevEndDate);
    } else {
      curStart  = `${year}-01-01`;
      curEnd    = fmt(today);
      prevStart = `${year - 1}-01-01`;
      prevEnd   = `${year - 1}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    }

    const baseParams: (string | number)[] = [curStart, curEnd];
    let brandFilter = '';
    if (brand) {
      baseParams.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${baseParams.length}, ','))`;
    }

    const commonWhere = `
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
        AND po."markedPendingTime"::date BETWEEN $1 AND $2
        ${brandFilter}
    `;
    const fromJoin = `
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
    `;

    // ── 1. Brand × month (delivered only) ────────────────────────────────
    const brandMonthSql = `
      SELECT
        EXTRACT(MONTH FROM po."markedPendingTime")::int      AS month,
        TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) AS brand,
        COUNT(*)                                             AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text         AS amount
      ${fromJoin}
      ${commonWhere}
        AND po."status" IN ('DELIVERED', 'COMPLETED')
      GROUP BY month, brand
      ORDER BY month;
    `;

    // ── 2. Day of week (operational rhythm, delivered) ───────────────────
    const dowSql = `
      SELECT
        EXTRACT(DOW FROM po."markedPendingTime")::int        AS dow,
        COUNT(*)                                             AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text         AS amount
      ${fromJoin}
      ${commonWhere}
        AND po."status" IN ('DELIVERED', 'COMPLETED')
      GROUP BY dow
      ORDER BY dow;
    `;

    // ── 3. Buyer cohort — new vs returning (within window) ───────────────
    const cohortSql = `
      WITH buyer_first_month AS (
        SELECT
          po."buyerId",
          MIN(date_trunc('month', po."markedPendingTime")) AS first_month
        ${fromJoin}
        ${commonWhere}
          AND po."status" IN ('DELIVERED','COMPLETED')
        GROUP BY po."buyerId"
      )
      SELECT
        EXTRACT(MONTH FROM po."markedPendingTime")::int AS month,
        COUNT(DISTINCT po."buyerId") FILTER (
          WHERE date_trunc('month', po."markedPendingTime") = bfm.first_month
        ) AS new_buyers,
        COUNT(DISTINCT po."buyerId") FILTER (
          WHERE date_trunc('month', po."markedPendingTime") > bfm.first_month
        ) AS returning_buyers,
        COUNT(*) AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text AS amount
      ${fromJoin}
      JOIN buyer_first_month bfm ON bfm."buyerId" = po."buyerId"
      ${commonWhere}
        AND po."status" IN ('DELIVERED','COMPLETED')
      GROUP BY month
      ORDER BY month;
    `;

    // ── 4. Funnel — status pipeline drop-off ─────────────────────────────
    const funnelSql = `
      SELECT
        po."status"                                          AS status,
        COUNT(*)                                             AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text         AS amount
      ${fromJoin}
      ${commonWhere}
      GROUP BY po."status";
    `;

    // ── 5. Top buyer states by delivered GMV ─────────────────────────────
    const stateSql = `
      SELECT
        b."state"                                            AS state,
        COUNT(*)                                             AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text         AS amount,
        COUNT(DISTINCT po."buyerId")                         AS buyers
      ${fromJoin}
      ${commonWhere}
        AND po."status" IN ('DELIVERED', 'COMPLETED')
      GROUP BY b."state"
      ORDER BY SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))) DESC NULLS LAST
      LIMIT 10;
    `;

    // ── 6. Order-size histogram (delivered) ──────────────────────────────
    const orderSizeSql = `
      SELECT bucket, COUNT(*) AS orders, COALESCE(SUM(amount::numeric),0)::text AS amount
      FROM (
        SELECT
          CASE
            WHEN (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) <  500   THEN '1 · < ₹500'
            WHEN (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) <  1000  THEN '2 · ₹500–1K'
            WHEN (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) <  2500  THEN '3 · ₹1K–2.5K'
            WHEN (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) <  5000  THEN '4 · ₹2.5K–5K'
            WHEN (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) <  10000 THEN '5 · ₹5K–10K'
            ELSE                                     '6 · > ₹10K'
          END AS bucket,
          (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0)) AS amount
        ${fromJoin}
        ${commonWhere}
          AND po."status" IN ('DELIVERED', 'COMPLETED')
      ) t
      GROUP BY bucket
      ORDER BY bucket;
    `;

    // ── 7. Monthly AOV (all + delivered) ─────────────────────────────────
    const monthlyAovSql = `
      SELECT
        EXTRACT(MONTH FROM po."markedPendingTime")::int      AS month,
        COUNT(*)                                             AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text         AS amount,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')) AS delivered_orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount
      ${fromJoin}
      ${commonWhere}
      GROUP BY month
      ORDER BY month;
    `;

    // ── 8. KPI grand for current + prior windows ─────────────────────────
    const grandSqlFor = (where: string) => `
      SELECT
        COUNT(*)                                                                            AS orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text                                        AS amount,
        COUNT(DISTINCT po."buyerId")                                                        AS buyers,
        COUNT(*) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))                    AS delivered_orders,
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)::text AS delivered_amount,
        COUNT(DISTINCT po."buyerId") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')) AS delivered_buyers
      ${fromJoin}
      ${where};
    `;

    const prevParams: (string | number)[] = [prevStart, prevEnd];
    if (brand) prevParams.push(brand);
    const prevWhere = `
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
        AND po."markedPendingTime"::date BETWEEN $1 AND $2
        ${brand ? ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($3, ','))` : ''}
    `;

    const [brandMonth, dow, cohort, funnel, states, orderSize, monthlyAov, curGrandRows, prevGrandRows] = await Promise.all([
      query<BrandMonthRow>(brandMonthSql, baseParams),
      query<DowRow>(dowSql, baseParams),
      query<CohortRow>(cohortSql, baseParams),
      query<FunnelRow>(funnelSql, baseParams),
      query<StateRow>(stateSql, baseParams),
      query<OrderSizeRow>(orderSizeSql, baseParams),
      query<MonthlyAovRow>(monthlyAovSql, baseParams),
      query<GrandRow>(grandSqlFor(commonWhere), baseParams),
      query<GrandRow>(grandSqlFor(prevWhere), prevParams),
    ]);

    // ── Brand share: top-5 by amount, rest bucketed as "Others" ──────────
    const brandTotals = new Map<string, number>();
    for (const r of brandMonth) {
      const k = r.brand || '(unbranded)';
      brandTotals.set(k, (brandTotals.get(k) ?? 0) + parseFloat(r.amount));
    }
    const topBrands = Array.from(brandTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    const topBrandSet = new Set(topBrands);
    const brandShareMonths = new Map<number, Record<string, number>>();
    for (const r of brandMonth) {
      const m = parseInt(r.month);
      const key = topBrandSet.has(r.brand) ? r.brand : 'Others';
      if (!brandShareMonths.has(m)) brandShareMonths.set(m, {});
      brandShareMonths.get(m)![key] = (brandShareMonths.get(m)![key] ?? 0) + parseFloat(r.amount);
    }
    const brandShareOut = Array.from(brandShareMonths.entries())
      .map(([month, bag]) => ({ month, ...bag }))
      .sort((a, b) => Number(a.month) - Number(b.month));

    const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowOut = DOW_LABELS.map((label, i) => {
      const row = dow.find((r) => parseInt(r.dow) === i);
      return {
        dow: label,
        orders: row ? parseInt(row.orders) : 0,
        amount: row ? parseFloat(row.amount) : 0,
      };
    });

    const cohortOut = cohort.map((r) => ({
      month: parseInt(r.month),
      new: parseInt(r.new_buyers),
      returning: parseInt(r.returning_buyers),
      orders: parseInt(r.orders),
      amount: parseFloat(r.amount),
    }));

    // ── Funnel / status breakdown ──────────────────────────────────────
    // We can't compute true funnel conversion without status-history; the
    // 'status' column is the order's CURRENT state. So we show a status
    // snapshot grouped into Success / In-flight / Failed buckets, with
    // share-of-total for each row.
    const STATUS_BUCKET: Record<string, 'success' | 'inflight' | 'failed'> = {
      DELIVERED:  'success',  COMPLETED:  'success',
      PENDING:    'inflight', ACCEPTED:   'inflight', INVOICED:   'inflight',
      DISPATCHED: 'inflight', INPROGRESS: 'inflight',
      REJECTED:   'failed',   CANCELLED:  'failed',
    };
    const grandFunnelOrders = funnel.reduce((s, r) => s + parseInt(r.orders), 0);
    const funnelOut = funnel
      .map((r) => {
        const o = parseInt(r.orders);
        const a = parseFloat(r.amount);
        return {
          status: r.status,
          bucket: STATUS_BUCKET[r.status] ?? 'inflight',
          orders: o,
          amount: a,
          sharePct: grandFunnelOrders > 0 ? (o / grandFunnelOrders) * 100 : 0,
        };
      })
      .sort((a, b) => b.orders - a.orders);
    const funnelBuckets = (['success', 'inflight', 'failed'] as const).map((b) => {
      const rows = funnelOut.filter((r) => r.bucket === b);
      const orders = rows.reduce((s, r) => s + r.orders, 0);
      const amount = rows.reduce((s, r) => s + r.amount, 0);
      return {
        bucket: b,
        orders,
        amount,
        sharePct: grandFunnelOrders > 0 ? (orders / grandFunnelOrders) * 100 : 0,
      };
    });

    // ── Top states ─────────────────────────────────────────────────────
    const topStatesOut = states.map((r) => ({
      state: r.state || '(unknown)',
      orders: parseInt(r.orders),
      amount: parseFloat(r.amount),
      buyers: parseInt(r.buyers),
    }));

    // ── Order-size histogram ───────────────────────────────────────────
    const orderSizeOut = orderSize.map((r) => ({
      bucket: r.bucket.replace(/^\d+ · /, ''), // strip sort prefix
      sortKey: parseInt(r.bucket.split(' · ')[0]),
      orders: parseInt(r.orders),
      amount: parseFloat(r.amount),
    })).sort((a, b) => a.sortKey - b.sortKey);

    // ── Monthly AOV ────────────────────────────────────────────────────
    const monthlyAovOut = monthlyAov.map((r) => {
      const o = parseInt(r.orders); const a = parseFloat(r.amount);
      const dO = parseInt(r.delivered_orders); const dA = parseFloat(r.delivered_amount);
      return {
        month: parseInt(r.month),
        orders: o,
        amount: a,
        aov: o > 0 ? a / o : 0,
        deliveredOrders: dO,
        deliveredAmount: dA,
        deliveredAov: dO > 0 ? dA / dO : 0,
      };
    });

    // ── KPI delta ───────────────────────────────────────────────────────
    const c = curGrandRows[0]; const p = prevGrandRows[0];
    const num = (v: string | number | undefined | null) => Number(v ?? 0);
    const safePctDelta = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : null;

    const cOrders = num(c?.orders); const pOrders = num(p?.orders);
    const cAmount = num(c?.amount); const pAmount = num(p?.amount);
    const cBuyers = num(c?.buyers); const pBuyers = num(p?.buyers);
    const cDelivered = num(c?.delivered_orders); const pDelivered = num(p?.delivered_orders);
    const cDelAmt = num(c?.delivered_amount); const pDelAmt = num(p?.delivered_amount);
    const cAov = cOrders > 0 ? cAmount / cOrders : 0;
    const pAov = pOrders > 0 ? pAmount / pOrders : 0;
    const cDeliveryRate = cOrders > 0 ? (cDelivered / cOrders) * 100 : 0;
    const pDeliveryRate = pOrders > 0 ? (pDelivered / pOrders) * 100 : 0;
    const cDelAov = cDelivered > 0 ? cDelAmt / cDelivered : 0;
    const pDelAov = pDelivered > 0 ? pDelAmt / pDelivered : 0;

    const kpi = {
      current: {
        orders: cOrders, amount: cAmount, buyers: cBuyers,
        deliveredOrders: cDelivered, deliveredAmount: cDelAmt,
        deliveredBuyers: num(c?.delivered_buyers),
        aov: cAov, deliveryRate: cDeliveryRate, delAov: cDelAov,
      },
      prior: {
        orders: pOrders, amount: pAmount, buyers: pBuyers,
        deliveredOrders: pDelivered, deliveredAmount: pDelAmt,
        aov: pAov, deliveryRate: pDeliveryRate, delAov: pDelAov,
      },
      deltaPct: {
        orders:          safePctDelta(cOrders, pOrders),
        amount:          safePctDelta(cAmount, pAmount),
        buyers:          safePctDelta(cBuyers, pBuyers),
        aov:             safePctDelta(cAov, pAov),
        deliveredOrders: safePctDelta(cDelivered, pDelivered),
        deliveredAmount: safePctDelta(cDelAmt, pDelAmt),
        delAov:          safePctDelta(cDelAov, pDelAov),
        deliveryRate:    pDeliveryRate > 0 ? cDeliveryRate - pDeliveryRate : null, // pp delta
      },
    };

    return NextResponse.json({
      brandShare: brandShareOut,
      topBrands,
      dow: dowOut,
      cohort: cohortOut,
      funnel: funnelOut,
      funnelBuckets,
      topStates: topStatesOut,
      orderSize: orderSizeOut,
      monthlyAov: monthlyAovOut,
      kpi,
      window: { curStart, curEnd, prevStart, prevEnd },
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
