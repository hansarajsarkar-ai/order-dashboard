import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, CHANNEL_CASE, campaignClause, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Acquisition QUALITY: attribute each install (first session, has buyerId) to the
// buyer's first real order placed at/after install, joining history.session →
// purchaseOrder.purchaseOrder. Grouped by channel or by Meta campaign.
//   buyers     = distinct acquired buyers in the window
//   ordered    = how many placed ≥1 order since install (not DRAFT/CANCELLED; REJECTED counts)
//   conv%      = ordered / buyers
//   gmv        = sum of those orders' amount (net amount column)
//   avgDays    = mean days from install → first order (only those who ordered)
// Note: conversion rises as a cohort matures, so recent installs understate it.

interface Row {
  grp: string;
  buyers: string;
  ordered: string;
  gmv: string;
  avg_days: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const by = searchParams.get('by') === 'campaign' ? 'campaign' : 'channel';
  const dp = parseDateParams(searchParams);

  const grpExpr = by === 'campaign' ? `"installReferrer"->>'campaign_name'` : CHANNEL_CASE;
  // Campaign view only makes sense for Meta paid installs (they have campaign_name).
  const paidFilter = by === 'campaign' ? `AND jsonb_typeof("installReferrer") = 'object'` : '';
  const limit = by === 'campaign' ? 'LIMIT 200' : '';
  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:conversion:${by}:${dateKey(dp)}:${campaign}`, 10 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause, lowerBound } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        WITH inst AS (
          SELECT DISTINCT ON ("buyerId")
                 "buyerId"   AS bid,
                 created_at  AS inst_at,
                 ${grpExpr}  AS grp
          FROM history.session
          WHERE ${COHORT_WHERE}
            AND "buyerId" IS NOT NULL
            ${paidFilter}
            ${clause}
            ${camp}
          ORDER BY "buyerId", created_at
        ),
        ord AS (
          -- A counted order = placed and not DRAFT/CANCELLED (REJECTED IS included).
          -- ordered count, GMV and days-to-first-order all use this filter so
          -- cancelled orders don't inflate conversion or revenue.
          SELECT i.bid, i.grp, i.inst_at,
                 MIN(po."markedPendingTime") FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')) AS fo,
                 COUNT(po.*) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')) AS pc,
                 COALESCE(SUM((po."amount")::numeric) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')), 0) AS gmv
          FROM inst i
          LEFT JOIN "purchaseOrder"."purchaseOrder" po
            ON po."buyerId" = i.bid
           AND po."isTest" = FALSE
           AND po."isFalseOrder" = FALSE
           AND po."markedPendingTime" >= i.inst_at
           -- Redundant constant bound (installs are within the window, so any
           -- qualifying order is too) — lets Postgres prune purchaseOrder via the
           -- markedPendingTime index instead of scanning all 1.4M rows. 42s -> ~1s.
           AND po."markedPendingTime" >= ${lowerBound}
          GROUP BY i.bid, i.grp, i.inst_at
        )
        SELECT COALESCE(grp, '(unattributed)')                                   AS grp,
               COUNT(*)::text                                                    AS buyers,
               COUNT(*) FILTER (WHERE pc > 0)::text                              AS ordered,
               COALESCE(ROUND(SUM(gmv)), 0)::text                                AS gmv,
               COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (fo - inst_at)) / 86400)
                              FILTER (WHERE fo IS NOT NULL), 1), 0)::text        AS avg_days
        FROM ord
        GROUP BY grp
        ORDER BY COUNT(*) DESC
        ${limit};
      `;
      const rows = await queryNoNestloop<Row>(sql, params);

      const data = rows.map((r) => {
        const buyers = parseInt(r.buyers, 10);
        const ordered = parseInt(r.ordered, 10);
        return {
          group: r.grp,
          buyers,
          ordered,
          convPct: buyers ? (ordered / buyers) * 100 : 0,
          gmv: parseFloat(r.gmv),
          avgDays: parseFloat(r.avg_days),
        };
      });

      const totBuyers = data.reduce((a, b) => a + b.buyers, 0);
      const totOrdered = data.reduce((a, b) => a + b.ordered, 0);
      const totGmv = data.reduce((a, b) => a + b.gmv, 0);

      return {
        data,
        by,
        totals: { buyers: totBuyers, ordered: totOrdered, gmv: totGmv, convPct: totBuyers ? (totOrdered / totBuyers) * 100 : 0 },
        sql: displaySql(sql, params),
      };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
