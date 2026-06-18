import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, CHANNEL_CASE, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ChannelRow { channel: string; installs: string; signups: string }
interface ObjRow { objective: string | null; installs: string }

// Two breakdowns for the activation/objective view:
//   channels  — installs vs in-session completed signups (isSignUpCompleted) per channel
//   objectives— Meta ad-objective split (APP_INSTALLS vs ENGAGEMENT vs SALES …)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:signup-funnel:${dateKey(dp)}`, 30 * 60_000, async () => {
    const params: (string | number)[] = [];
    const { clause } = dateClause('created_at', dp, params);
    const channelSql = `
      SELECT ${CHANNEL_CASE} AS channel,
             COUNT(*)::text  AS installs,
             COUNT(*) FILTER (WHERE ("userProperties"->>'isSignUpCompleted') = 'true')::text AS signups
      FROM history.session
      WHERE ${COHORT_WHERE}
        ${clause}
      GROUP BY 1
      ORDER BY COUNT(*) DESC;
    `;
    const objectiveSql = `
      SELECT "installReferrer"->>'ad_objective_name' AS objective,
             COUNT(*)::text                          AS installs
      FROM history.session
      WHERE ${COHORT_WHERE}
        AND jsonb_typeof("installReferrer") = 'object'
        ${clause}
      GROUP BY 1
      ORDER BY COUNT(*) DESC;
    `;

    const [channelRows, objRows] = await Promise.all([
      query<ChannelRow>(channelSql, params),
      query<ObjRow>(objectiveSql, params),
    ]);

    const channels = channelRows.map((r) => {
      const installs = parseInt(r.installs, 10);
      const signups = parseInt(r.signups, 10);
      return { channel: r.channel, installs, signups, signupPct: installs ? (signups / installs) * 100 : 0 };
    });
    const objectives = objRows.map((r) => ({ objective: r.objective || '(unknown)', installs: parseInt(r.installs, 10) }));

      return {
        channels,
        objectives,
        objectivesTotal: objectives.reduce((a, b) => a + b.installs, 0),
        sql: displaySql(channelSql, params) + ';\n\n-- objective split:\n' + displaySql(objectiveSql, params),
      };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
