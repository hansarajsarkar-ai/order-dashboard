import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause, IS_META, CAMPAIGN_NAME, ADGROUP_NAME, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';
import { campaignLaunchDates, launchCutoff, LAUNCH_MONTHS } from '@/lib/campaignLaunch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  campaign: string | null;
  adgroup: string | null;
  placement: string | null;
  installs: string;
}

// Creative-level drill of Meta paid installs: campaign → adgroup → placement.
// Lets marketing see which specific creatives/placements drive installs, not just
// the campaign rollup. Scoped by canonical IS_META (names coalesced installReferrer
// → standardizedAttribution); placement exists on the object form only. First sessions.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get('campaign') || '';
  const showAll = searchParams.get('all') === '1';
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:creatives:${dateKey(dp)}:${campaign}:${showAll ? 'all' : 'recent'}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT ${CAMPAIGN_NAME}                                             AS campaign,
               ${ADGROUP_NAME}                                              AS adgroup,
               COALESCE(NULLIF("installReferrer"->>'platform_position',''), '(n/a)') AS placement,
               COUNT(*)::text                                               AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND ${IS_META}
          ${clause}
          ${camp}
        GROUP BY 1, 2, 3
        ORDER BY COUNT(*) DESC
        LIMIT 300;
      `;
      const [rows, launch] = await Promise.all([
        query<Row>(sql, params),
        showAll ? Promise.resolve({} as Record<string, string>) : campaignLaunchDates(),
      ]);
      const cutoff = launchCutoff();
      // Drop creatives whose PARENT campaign launched before the cutoff.
      const data = rows
        .filter((r) => showAll || !r.campaign || (launch[r.campaign] || '9999') >= cutoff)
        .map((r) => ({
          campaign: r.campaign || '(unnamed)',
          adgroup: r.adgroup || '(unnamed)',
          placement: r.placement || '(n/a)',
          installs: parseInt(r.installs, 10),
        }));
      return { data, total: data.reduce((a, b) => a + b.installs, 0), recentOnly: !showAll, launchMonths: LAUNCH_MONTHS, cutoff, sql: displaySql(sql, params) };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
