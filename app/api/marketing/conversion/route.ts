import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, CHANNEL_CASE, campaignClause, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Acquisition QUALITY: attribute each install (first session, has buyerId) to the
// buyer's orders, joining history.session → purchaseOrder.purchaseOrder. Grouped
// by channel, Meta campaign, or adgroup (creative). Per group:
//   buyers       = distinct acquired buyers in the window
//   signups      = how many completed signup in their first session (funnel step)
//   ordered      = how many placed ≥1 order since install (not DRAFT/CANCELLED; REJECTED counts)
//   totalOrders  = total such orders (for orders-per-buyer)
//   repeatBuyers = how many placed ≥2 orders (repeat/quality)
//   gmv          = sum of those orders' amount (net amount column)
//   avgDays      = mean days from install → first order
// Note: conversion + LTV rise as a cohort matures, so recent installs understate them.

interface Row {
  grp: string;
  buyers: string;
  signups: string;
  ordered: string;
  total_orders: string;
  repeat_buyers: string;
  gmv: string;
  avg_days: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const byRaw = searchParams.get('by');
  const by = byRaw === 'campaign' ? 'campaign' : byRaw === 'adgroup' ? 'adgroup' : 'channel';
  const dp = parseDateParams(searchParams);

  const grpExpr = by === 'campaign' ? `"installReferrer"->>'campaign_name'`
    : by === 'adgroup' ? `"installReferrer"->>'adgroup_name'`
    : CHANNEL_CASE;
  // Campaign/adgroup views only make sense for Meta paid installs (they have the field).
  const paidFilter = by === 'channel' ? '' : `AND jsonb_typeof("installReferrer") = 'object'`;
  const limit = by === 'channel' ? '' : 'LIMIT 200';
  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:conversion:${by}:${dateKey(dp)}:${campaign}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause, lowerBound } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        WITH inst AS (
          SELECT DISTINCT ON ("buyerId")
                 "buyerId"   AS bid,
                 created_at  AS inst_at,
                 ${grpExpr}  AS grp,
                 (CASE WHEN "userProperties"->>'isSignUpCompleted' = 'true' THEN 1 ELSE 0 END) AS signed
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
          SELECT i.bid, i.grp, i.inst_at, i.signed,
                 MIN(po."markedPendingTime") FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')) AS fo,
                 COUNT(po.*) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')) AS pc,
                 COALESCE(SUM((po."amount")::numeric) FILTER (WHERE po."status" NOT IN ('DRAFT','CANCELLED')), 0) AS gmv
          FROM inst i
          LEFT JOIN "purchaseOrder"."purchaseOrder" po
            ON po."buyerId" = i.bid
           AND po."isTest" = FALSE
           AND po."isFalseOrder" = FALSE
           AND po."markedPendingTime" >= i.inst_at
           AND po."markedPendingTime" >= ${lowerBound}
          GROUP BY i.bid, i.grp, i.inst_at, i.signed
        )
        SELECT COALESCE(grp, '(unattributed)')                                   AS grp,
               COUNT(*)::text                                                    AS buyers,
               COALESCE(SUM(signed), 0)::text                                    AS signups,
               COUNT(*) FILTER (WHERE pc > 0)::text                              AS ordered,
               COALESCE(SUM(pc), 0)::text                                        AS total_orders,
               COUNT(*) FILTER (WHERE pc >= 2)::text                             AS repeat_buyers,
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
        const totalOrders = parseInt(r.total_orders, 10);
        const repeatBuyers = parseInt(r.repeat_buyers, 10);
        const signups = parseInt(r.signups, 10);
        const gmv = parseFloat(r.gmv);
        return {
          group: r.grp,
          buyers,
          signups,
          ordered,
          totalOrders,
          repeatBuyers,
          convPct: buyers ? (ordered / buyers) * 100 : 0,
          signupPct: buyers ? (signups / buyers) * 100 : 0,
          repeatPct: ordered ? (repeatBuyers / ordered) * 100 : 0,
          ordersPerBuyer: ordered ? totalOrders / ordered : 0,
          gmv,
          gmvPerBuyer: ordered ? gmv / ordered : 0,
          avgDays: parseFloat(r.avg_days),
        };
      });

      const sum = (k: 'buyers' | 'signups' | 'ordered' | 'totalOrders' | 'repeatBuyers' | 'gmv') => data.reduce((a, b) => a + b[k], 0);
      const tBuyers = sum('buyers'), tOrdered = sum('ordered'), tGmv = sum('gmv'), tSignups = sum('signups'), tRepeat = sum('repeatBuyers'), tOrders = sum('totalOrders');

      return {
        data,
        by,
        totals: {
          buyers: tBuyers, signups: tSignups, ordered: tOrdered, totalOrders: tOrders, repeatBuyers: tRepeat, gmv: tGmv,
          convPct: tBuyers ? (tOrdered / tBuyers) * 100 : 0,
          signupPct: tBuyers ? (tSignups / tBuyers) * 100 : 0,
          repeatPct: tOrdered ? (tRepeat / tOrdered) * 100 : 0,
          ordersPerBuyer: tOrdered ? tOrders / tOrdered : 0,
          gmvPerBuyer: tOrdered ? tGmv / tOrdered : 0,
        },
        sql: displaySql(sql, params),
      };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
