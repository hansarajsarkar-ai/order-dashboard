import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RejectReasonRow {
  reason_category: string;
  delivery_status: string | null;
  status: string | null;
  month: string;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
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
          WHEN COALESCE(po."rejectReason", '')              ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
            OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%AUTO REJECTED DUE TO SLA BREACH%'
            THEN 'Brand SLA Breach'
          WHEN COALESCE(po."rejectReason", '')              ILIKE '%serviceab%'
            OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%serviceab%'
            THEN 'Serviceability Issue'
          WHEN COALESCE(po."rejectReason", '')              ILIKE '%address%'
            OR COALESCE(po."reasonAddedByBadhoTeam", '')    ILIKE '%address%'
            THEN 'Address Issue'
          ELSE 'Other Reasons'
        END AS reason_category,
        po."deliveryStatus",
        pop."status",
        TO_CHAR(po."markedPendingTime", 'YYYY-MM') AS month,
        COUNT(*) AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
        ON pop."purchaseOrderId" = po."id"
        AND pop."status" = 'COMPLETED'
        AND pop."event" IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
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
      GROUP BY reason_category, po."deliveryStatus", pop."status", month
      ORDER BY reason_category, month, po."deliveryStatus", pop."status";
    `;

    const rows = await query<RejectReasonRow>(sql, [year]);

    const reasonMap: Record<string, Record<string, Record<string, Record<number, { count: number; amount: number }>>>> = {};
    const totals = {
      byMonth: {} as Record<string, { count: number; amount: number }>,
      byReason: {} as Record<string, { count: number; amount: number }>,
      grand: { count: 0, amount: 0 },
    };

    for (const r of rows) {
      const reason = r.reason_category;
      const deliveryStatus = r.delivery_status || 'N/A';
      const paymentStatus = r.status || 'N/A';
      const month = r.month;
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);

      if (!reasonMap[reason]) reasonMap[reason] = {};
      if (!reasonMap[reason][month]) reasonMap[reason][month] = {};
      if (!reasonMap[reason][month][deliveryStatus]) reasonMap[reason][month][deliveryStatus] = {};

      reasonMap[reason][month][deliveryStatus][paymentStatus] = { count, amount };

      if (!totals.byMonth[month]) totals.byMonth[month] = { count: 0, amount: 0 };
      totals.byMonth[month].count += count;
      totals.byMonth[month].amount += amount;

      if (!totals.byReason[reason]) totals.byReason[reason] = { count: 0, amount: 0 };
      totals.byReason[reason].count += count;
      totals.byReason[reason].amount += amount;

      totals.grand.count += count;
      totals.grand.amount += amount;
    }

    const reasons = Object.keys(reasonMap).sort(
      (a, b) => totals.byReason[b].count - totals.byReason[a].count
    );

    const data = reasons.map((reason) => {
      const monthData = reasonMap[reason];
      const months: Record<string, { count: number; amount: number }> = {};

      for (const month in monthData) {
        let monthCount = 0;
        let monthAmount = 0;

        for (const deliveryStatus in monthData[month]) {
          for (const paymentStatus in monthData[month][deliveryStatus]) {
            const cell = monthData[month][deliveryStatus][paymentStatus];
            monthCount += cell.count;
            monthAmount += cell.amount;
          }
        }

        months[month] = { count: monthCount, amount: monthAmount };
      }

      return {
        reason,
        months,
        drilldown: monthData,
        total: totals.byReason[reason],
      };
    });

    return NextResponse.json({
      data,
      totals,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
