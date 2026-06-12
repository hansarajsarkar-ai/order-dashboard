import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_GOAL = 10000000;
const GOAL_OVERRIDES: Record<string, number> = {
  '2026-6': 3000000,
};
const goalFor = (year: number, month: number) =>
  GOAL_OVERRIDES[`${year}-${month}`] ?? DEFAULT_GOAL;

interface Row {
  achieved: string;
  orders: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const monthParam = searchParams.get('month');
  const month = monthParam !== null && monthParam !== '' && monthParam !== 'all'
    ? parseInt(monthParam)
    : currentMonth;

  try {
    const sql = `
      SELECT
        COALESCE(SUM((po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))), 0)::text AS achieved,
        COUNT(*)::text AS orders
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest" = FALSE
        AND po."isFalseOrder" = FALSE
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" >= $1::timestamptz
        AND po."markedPendingTime" <  $2::timestamptz
        -- Optional delivery cutoff: when set, count only orders DELIVERED by this
        -- instant. Used to age-match the prior month to the current month-to-date
        -- (both measured at the same point within their month), so a still-in-
        -- progress current month isn't compared against a fully-delivered prior
        -- month. NULL = no cutoff (count everything delivered so far).
        AND ($3::timestamptz IS NULL OR po."markedDeliveredTime" < $3::timestamptz);
    `;

    // Sargable [monthStart, nextMonthStart) range -> uses the markedPendingTime index.
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonthStart = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // ── Prior month, SAME elapsed time span ("till date") ───────────────
    // For the live current month we cut both periods off at the same point:
    // current = [month 1 .. now], prior = [prev month 1 .. same day-of-month/time].
    // For a fully-elapsed historical month we compare the two whole months.
    const isCurrentMonth = year === currentYear && month === currentMonth;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    let prevEnd: string;
    let asOfDay: number | null = null;
    if (isCurrentMonth) {
      const daysInPrev = new Date(prevYear, prevMonth, 0).getDate(); // last day of prev month
      asOfDay = now.getDate();
      const day = Math.min(asOfDay, daysInPrev); // clamp (e.g. May 31 -> Apr 30)
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hh}:${mm}:${ss}`;
    } else {
      prevEnd = monthStart; // whole previous month: [prevMonthStart, monthStart)
    }

    // Current period counts everything delivered so far (no cutoff). For the live
    // current month, the prior period's deliveries are capped at the same month-to-
    // date instant (prevEnd) so both cohorts are measured at equal maturity; for a
    // fully-elapsed historical month it's whole-month vs whole-month (no cutoff).
    const prevDeliveredBefore = isCurrentMonth ? prevEnd : null;
    const [rows, prevRows] = await Promise.all([
      query<Row>(sql, [monthStart, nextMonthStart, null]),
      query<Row>(sql, [prevMonthStart, prevEnd, prevDeliveredBefore]),
    ]);

    const achieved = parseFloat(rows[0]?.achieved || '0');
    const orders = parseInt(rows[0]?.orders || '0');
    const goal = goalFor(year, month);
    const achievePct = goal > 0 ? (achieved / goal) * 100 : 0;
    const remaining = Math.max(goal - achieved, 0);

    const prevAchieved = parseFloat(prevRows[0]?.achieved || '0');
    const prevOrders = parseInt(prevRows[0]?.orders || '0');
    const deltaPct = prevAchieved > 0 ? ((achieved - prevAchieved) / prevAchieved) * 100 : null;
    const ordersDeltaPct = prevOrders > 0 ? ((orders - prevOrders) / prevOrders) * 100 : null;

    return NextResponse.json({
      year,
      month,
      goal,
      achieved,
      orders,
      remaining,
      achievePct: parseFloat(achievePct.toFixed(2)),
      // Prior month over the same elapsed span (month-to-date vs month-to-date).
      prior: {
        year: prevYear,
        month: prevMonth,
        achieved: prevAchieved,
        orders: prevOrders,
        asOfDay,                       // same day-of-month cutoff (null for full historical months)
        sameSpan: isCurrentMonth,      // true = "till date" comparison, false = whole-month
      },
      deltaPct: deltaPct === null ? null : parseFloat(deltaPct.toFixed(1)),
      ordersDeltaPct: ordersDeltaPct === null ? null : parseFloat(ordersDeltaPct.toFixed(1)),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
