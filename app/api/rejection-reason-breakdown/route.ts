import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RejectReasonRow {
  reason_category: string;
  order_status: string | null;
  delivery_status: string | null;
  period: string;
  count: string;
  amount: string;
}

type Granularity = 'month' | 'week' | 'day';

const REASON_CASE = `
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "deliveries"."intercityDelivery" di
      WHERE di."purchaseOrderId" = po."id"
        AND di."status" = 'NOT PICKED'
        AND di."autoRejectionTime" IS NOT NULL
    )
      THEN 'Delivery Partner SLA Breach'
    WHEN po."deliveryStatus" = 'RTO'
      THEN 'Rejected due to RTO'
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
      THEN 'Brand SLA Breach'
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%serviceab%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%serviceab%'
      THEN 'Serviceability Issue'
    WHEN COALESCE(po."rejectReason", '')           ILIKE '%address%'
      OR COALESCE(po."reasonAddedByBadhoTeam", '') ILIKE '%address%'
      THEN 'Address Issue'
    ELSE 'Other Reasons'
  END
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const granularity = (searchParams.get('granularity') || 'month') as Granularity;
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

  try {
    let periodExpr: string;
    const filters: string[] = [];
    const params: (string | number)[] = [year];

    if (granularity === 'month') {
      periodExpr = `TO_CHAR(po."markedPendingTime", 'YYYY-MM')`;
    } else if (granularity === 'week') {
      periodExpr = `EXTRACT(WEEK FROM po."markedPendingTime")::text`;
    } else {
      // day — filter to a single month, bucket by day
      periodExpr = `EXTRACT(DAY FROM po."markedPendingTime")::text`;
      filters.push(`AND EXTRACT(MONTH FROM po."markedPendingTime") = $2`);
      params.push(month);
    }

    const sql = `
      SELECT
        ${REASON_CASE}                       AS reason_category,
        po."status"                          AS order_status,
        po."deliveryStatus"                  AS delivery_status,
        ${periodExpr}                        AS period,
        COUNT(*)                             AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE s."isD2RBrandSeller" = TRUE
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isTest" = FALSE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType" = 'INTERCITY'
        AND po."isFalseOrder" = FALSE
        AND po."status" = 'REJECTED'
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
        ${filters.join(' ')}
      GROUP BY reason_category, po."status", po."deliveryStatus", period
      ORDER BY reason_category, period, po."status", po."deliveryStatus";
    `;

    const rows = await query<RejectReasonRow>(sql, params);

    const reasonMap: Record<string, Record<string, Record<string, { count: number; amount: number }>>> = {};
    const totals = {
      byPeriod: {} as Record<string, { count: number; amount: number }>,
      byReason: {} as Record<string, { count: number; amount: number }>,
      grand: { count: 0, amount: 0 },
    };

    for (const r of rows) {
      const reason = r.reason_category;
      const orderStatus = r.order_status || 'N/A';
      const deliveryStatus = r.delivery_status || 'N/A';
      const period = r.period;
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);
      const comboKey = `${orderStatus}|||${deliveryStatus}`;

      if (!reasonMap[reason]) reasonMap[reason] = {};
      if (!reasonMap[reason][period]) reasonMap[reason][period] = {};

      reasonMap[reason][period][comboKey] = { count, amount };

      if (!totals.byPeriod[period]) totals.byPeriod[period] = { count: 0, amount: 0 };
      totals.byPeriod[period].count += count;
      totals.byPeriod[period].amount += amount;

      if (!totals.byReason[reason]) totals.byReason[reason] = { count: 0, amount: 0 };
      totals.byReason[reason].count += count;
      totals.byReason[reason].amount += amount;

      totals.grand.count += count;
      totals.grand.amount += amount;
    }

    const reasons = Object.keys(reasonMap).sort(
      (a, b) => totals.byReason[b].count - totals.byReason[a].count
    );

    // Build full period list (fill empties)
    let periods: string[] = [];
    if (granularity === 'month') {
      periods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    } else if (granularity === 'week') {
      const seen = new Set(Object.keys(totals.byPeriod).map((w) => parseInt(w)));
      const sortedWeeks = Array.from(seen).sort((a, b) => a - b);
      periods = sortedWeeks.map(String);
    } else {
      const daysInMonth = new Date(year, month, 0).getDate();
      periods = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    }

    const data = reasons.map((reason) => {
      const periodData = reasonMap[reason];
      const cells: Record<string, { count: number; amount: number }> = {};

      for (const p in periodData) {
        let pCount = 0;
        let pAmount = 0;
        for (const combo in periodData[p]) {
          const cell = periodData[p][combo];
          pCount += cell.count;
          pAmount += cell.amount;
        }
        cells[p] = { count: pCount, amount: pAmount };
      }

      return {
        reason,
        cells,
        drilldown: periodData,
        total: totals.byReason[reason],
      };
    });

    return NextResponse.json({
      data,
      totals,
      periods,
      granularity,
      year,
      month: granularity === 'day' ? month : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
