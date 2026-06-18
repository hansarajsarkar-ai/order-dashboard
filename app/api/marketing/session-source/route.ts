import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
        JOIN "users"."buyer" b ON b."id" = a."buyerId"
        WHERE TRUE
          ${clause}
          AND a."buyerId" IS NOT NULL
          AND a."isTest" = FALSE
          AND b."isTest" = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND a."userType" = 'buyer'
          AND a."appUsed" = 'buyer-app'
          AND a."isMasterLogin" = FALSE
        GROUP BY 1
        ORDER BY COUNT(DISTINCT a."id") DESC;
      `;
      const rows = await query<Row>(sql, params);
      const data = rows.map((r) => ({ source: r.src, sessions: parseInt(r.sessions, 10), buyers: parseInt(r.buyers, 10) }));
      return {
        data,
        totalSessions: data.reduce((a, b) => a + b.sessions, 0),
        totalBuyers: data.reduce((a, b) => a + b.buyers, 0),
        sql: displaySql(sql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
