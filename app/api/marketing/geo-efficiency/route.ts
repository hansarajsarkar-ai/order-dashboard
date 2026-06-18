import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, IS_PAID, campaignClause, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// MARKETING EFFICIENCY BY STATE — surfaces zones where paid marketing is low but
// orders are high (organic strongholds / underspent opportunities) vs over-marketed
// zones. Per state: total installs, PAID installs (marketing intensity), ordering
// buyers + GMV (joined from purchaseOrder like the Conversion tab). The headline
// metric is ordering buyers per 100 paid installs.
interface Row {
  state: string;
  installs: string;
  paid_installs: string;
  ordering_buyers: string;
  gmv: string;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get('campaign') || '';
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:geo-efficiency:${dateKey(dp)}:${campaign}`, 10 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause, lowerBound } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        WITH inst AS (
          SELECT DISTINCT ON ("buyerId")
                 "buyerId"  AS bid,
                 created_at AS inst_at,
                 COALESCE(NULLIF("userProperties"->>'state', ''), '(unknown)') AS st,
                 (CASE WHEN ${IS_PAID} THEN 1 ELSE 0 END) AS paid
          FROM history.session
          WHERE ${COHORT_WHERE}
            AND "buyerId" IS NOT NULL
            ${clause}
            ${camp}
          ORDER BY "buyerId", created_at
        ),
        perbuyer AS (
          SELECT i.bid, i.st, i.paid,
                 COUNT(po.*) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')) AS pc,
                 COALESCE(SUM((po."amount")::numeric) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')), 0) AS gmv
          FROM inst i
          LEFT JOIN "purchaseOrder"."purchaseOrder" po
            ON po."buyerId" = i.bid
           AND po."isTest" = FALSE
           AND po."isFalseOrder" = FALSE
           AND po."markedPendingTime" >= i.inst_at
           AND po."markedPendingTime" >= ${lowerBound}
          GROUP BY i.bid, i.st, i.paid
        )
        SELECT st                                              AS state,
               COUNT(*)::text                                  AS installs,
               SUM(paid)::text                                 AS paid_installs,
               COUNT(*) FILTER (WHERE pc > 0)::text            AS ordering_buyers,
               COALESCE(ROUND(SUM(gmv)), 0)::text              AS gmv
        FROM perbuyer
        WHERE st <> '(unknown)'
        GROUP BY st
        HAVING COUNT(*) >= 50
        ORDER BY (COUNT(*) FILTER (WHERE pc > 0))::numeric / NULLIF(SUM(paid), 0) DESC NULLS LAST;
      `;
      const rows = await queryNoNestloop<Row>(sql, params);

      const data = rows.map((r) => {
        const installs = parseInt(r.installs, 10);
        const paidInstalls = parseInt(r.paid_installs, 10);
        const orderingBuyers = parseInt(r.ordering_buyers, 10);
        const gmv = parseFloat(r.gmv);
        return {
          state: r.state,
          installs,
          paidInstalls,
          orderingBuyers,
          gmv,
          ordersPer100Paid: paidInstalls ? (orderingBuyers / paidInstalls) * 100 : 0,
          gmvPerPaid: paidInstalls ? gmv / paidInstalls : 0,
        };
      });

      // Quadrant thresholds: a state is "underspent / high yield" when its paid
      // intensity is below median yet its order-yield is above median; "over-marketed"
      // is the opposite.
      const medPaid = median(data.map((d) => d.paidInstalls));
      const medYield = median(data.map((d) => d.ordersPer100Paid));
      const tagged = data.map((d) => ({
        ...d,
        tag:
          d.paidInstalls < medPaid && d.ordersPer100Paid > medYield ? 'underspent'
          : d.paidInstalls >= medPaid && d.ordersPer100Paid < medYield ? 'overmarketed'
          : 'normal',
      }));

      const underspent = tagged.filter((d) => d.tag === 'underspent').map((d) => d.state);
      const overmarketed = [...tagged].filter((d) => d.tag === 'overmarketed').sort((a, b) => b.paidInstalls - a.paidInstalls).map((d) => d.state);

      return {
        data: tagged,
        medPaid,
        medYield,
        underspent,
        overmarketed,
        sql: displaySql(sql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
