import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // heavy all-sessions scan; give large windows room

// "Source-wise sessions" — ALL buyer-app sessions (NOT just first-session installs)
// classified by source, for the selected window. This is the dashboard's only
// re-engagement view; every other tab is install-only.
//
// Based on the user's "Today Source Wise Session Alert" SQL, with two changes:
//   1. Push fix — the original `additionalDetails::text ILIKE '%notification%'`
//      matched the notificationToken key on ~all sessions, so Push swallowed every
//      organic open. We detect push precisely via sessionContext.entryPoint.
//   2. Perf — classify via JSON-PATH extraction on standardizedAttribution instead
//      of casting the whole (large) additionalDetails column to text per row, which
//      times out over all-sessions. originalSource is the true platform.
const SA = `a."additionalDetails"->'standardizedAttribution'`;
const AD = `a."additionalDetails"->'additionalDetails'`;
const CLASSIFY = `CASE
  WHEN ${SA}->>'medium' = 'whatsapp'
       OR (${AD}->>'utm_source') ILIKE 'whatsapp'
       OR (${AD}->>'utm_medium') ILIKE 'messaging' THEN 'WhatsApp'
  WHEN ${AD}->'sessionContext'->>'entryPoint' = 'PUSH_NOTIFICATION' THEN 'Push Notification'
  WHEN ${SA}->>'originalSource' = 'instagram' THEN 'Instagram'
  WHEN ${SA}->>'originalSource' IN ('facebook','audience_network') OR ${SA}->>'source' = 'meta' THEN 'Facebook / Meta'
  WHEN ${SA}->>'source' = 'google' AND ${SA}->>'medium' <> 'organic' THEN 'Google Ads'
  WHEN a."isFirstSession" = TRUE AND a."installReferrer" IS NOT NULL AND (a."installReferrer")::text <> '' THEN 'Other Paid/Install Source'
  ELSE 'Organic / Direct App Open'
END`;

interface Row { src: string; sessions: string; buyers: string }
interface FreqRow { bucket: string; ord: string; buyers: string; sessions: string }

// Shared cohort predicate for the Sessions tab (all buyer-app sessions, incl. re-engagement).
const SESSION_COHORT = `a."buyerId" IS NOT NULL
  AND a."isTest" = FALSE
  AND a."userType" = 'buyer'
  AND a."appUsed" = 'buyer-app'
  AND a."isMasterLogin" = FALSE`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:session-source:${dateKey(dp)}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('a."sessionStartTimestamp"', dp, params);
      const sql = `
        SELECT ${CLASSIFY}                       AS src,
               COUNT(*)::text                    AS sessions,
               COUNT(DISTINCT a."buyerId")::text AS buyers
        FROM "history"."session" a
        WHERE TRUE
          ${clause}
          AND ${SESSION_COHORT}
        GROUP BY 1
        ORDER BY COUNT(*) DESC;
      `;
      // Engagement distribution: bucket buyers by how many sessions they had in the
      // window, to see where the heavy-usage buyers sit.
      const freqSql = `
        WITH perbuyer AS (
          SELECT a."buyerId" AS b, COUNT(*) AS n
          FROM "history"."session" a
          WHERE TRUE ${clause} AND ${SESSION_COHORT}
          GROUP BY a."buyerId"
        )
        SELECT CASE WHEN n = 1 THEN '1'
                    WHEN n = 2 THEN '2'
                    WHEN n = 3 THEN '3'
                    WHEN n BETWEEN 4 AND 5 THEN '4–5'
                    WHEN n BETWEEN 6 AND 10 THEN '6–10'
                    WHEN n BETWEEN 11 AND 20 THEN '11–20'
                    ELSE '20+' END       AS bucket,
               MIN(n)::text              AS ord,
               COUNT(*)::text            AS buyers,
               SUM(n)::text              AS sessions
        FROM perbuyer
        GROUP BY 1
        ORDER BY MIN(n);
      `;
      const [rows, freqRows] = await Promise.all([query<Row>(sql, params), query<FreqRow>(freqSql, params)]);
      const data = rows.map((r) => ({ source: r.src, sessions: parseInt(r.sessions, 10), buyers: parseInt(r.buyers, 10) }));
      const frequency = freqRows.map((r) => ({ bucket: r.bucket, buyers: parseInt(r.buyers, 10), sessions: parseInt(r.sessions, 10) }));
      // TRUE distinct buyers = every buyer appears once here (a buyer can span several
      // source buckets, so summing per-source buyers over-counts — don't use that).
      const totalBuyers = frequency.reduce((a, b) => a + b.buyers, 0);
      return {
        data,
        frequency,
        totalSessions: data.reduce((a, b) => a + b.sessions, 0),
        totalBuyers,
        avgSessionsPerBuyer: totalBuyers ? data.reduce((a, b) => a + b.sessions, 0) / totalBuyers : 0,
        sql: displaySql(sql, params) + ';\n\n-- sessions-per-buyer distribution:\n' + displaySql(freqSql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
