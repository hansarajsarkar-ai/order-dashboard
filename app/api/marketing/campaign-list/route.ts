import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, SA, IS_META, CAMPAIGN_NAME, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';
import { campaignLaunchDates, launchCutoff } from '@/lib/campaignLaunch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  campaign: string | null;
  campaign_id: string | null;
  installs: string;
}

// Distinct Meta campaigns (name + id + installs) in the window, to populate the
// header campaign filter. Cached so reopening the dropdown is instant.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:campaign-list:${dateKey(dp)}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const sql = `
        SELECT ${CAMPAIGN_NAME}                                          AS campaign,
               COALESCE(NULLIF("installReferrer"->>'campaign_id',''), NULLIF(${SA}->>'campaignId','')) AS campaign_id,
               COUNT(*)::text                       AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND ${IS_META}
          ${clause}
        GROUP BY 1, 2
        ORDER BY COUNT(*) DESC
        LIMIT 500;
      `;
      const [rows, launch] = await Promise.all([query<Row>(sql, params), campaignLaunchDates()]);
      const cutoff = launchCutoff();
      return {
        data: rows
          .filter((r) => r.campaign && (launch[r.campaign] || '9999') >= cutoff)
          .map((r) => ({ campaign: r.campaign as string, campaignId: r.campaign_id || '', installs: parseInt(r.installs, 10) })),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
