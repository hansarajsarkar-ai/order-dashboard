import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CHANNEL_CASE = `CASE
  WHEN jsonb_typeof("installReferrer") = 'object' THEN 'Paid (Meta)'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_source=whatsapp%' THEN 'WhatsApp'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_medium=organic%'
    OR "installReferrer" #>> '{}' ILIKE '%google-play%' THEN 'Organic (Play Store)'
  WHEN "installReferrer" IS NULL OR "installReferrer" #>> '{}' IN ('unknown', '') THEN 'Unknown'
  ELSE 'Other'
END`;

interface ChannelRow { channel: string; installs: string; signups: string }
interface ObjRow { objective: string | null; installs: string }

// Two breakdowns for the activation/objective view:
//   channels  — installs vs in-session completed signups (isSignUpCompleted) per channel
//   objectives— Meta ad-objective split (APP_INSTALLS vs ENGAGEMENT vs SALES …)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const channelSql = `
      SELECT ${CHANNEL_CASE} AS channel,
             COUNT(*)::text  AS installs,
             COUNT(*) FILTER (WHERE ("userProperties"->>'isSignUpCompleted') = 'true')::text AS signups
      FROM history.session
      WHERE "isFirstSession" = TRUE
        AND "isTest" = FALSE
        AND created_at >= current_date - $1::int
      GROUP BY 1
      ORDER BY COUNT(*) DESC;
    `;
    const objectiveSql = `
      SELECT "installReferrer"->>'ad_objective_name' AS objective,
             COUNT(*)::text                          AS installs
      FROM history.session
      WHERE "isFirstSession" = TRUE
        AND "isTest" = FALSE
        AND jsonb_typeof("installReferrer") = 'object'
        AND created_at >= current_date - $1::int
      GROUP BY 1
      ORDER BY COUNT(*) DESC;
    `;

    const [channelRows, objRows] = await Promise.all([
      query<ChannelRow>(channelSql, [days]),
      query<ObjRow>(objectiveSql, [days]),
    ]);

    const channels = channelRows.map((r) => {
      const installs = parseInt(r.installs, 10);
      const signups = parseInt(r.signups, 10);
      return { channel: r.channel, installs, signups, signupPct: installs ? (signups / installs) * 100 : 0 };
    });
    const objectives = objRows.map((r) => ({ objective: r.objective || '(unknown)', installs: parseInt(r.installs, 10) }));

    return NextResponse.json({
      channels,
      objectives,
      objectivesTotal: objectives.reduce((a, b) => a + b.installs, 0),
      windowDays: days,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
