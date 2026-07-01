import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause, SA, IS_META, CAMPAIGN_NAME, AD_PLATFORM, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';
import { campaignLaunchDates, launchCutoff, LAUNCH_MONTHS } from '@/lib/campaignLaunch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  campaign: string | null;
  platform: string | null;
  objective: string | null;
  installs: string;
  median_cti: string | null;
}

// Meta (Facebook/Instagram) paid-ad campaign performance — installs attributed
// to each campaign × publisher platform. Scoped by the canonical IS_META so the
// total matches the Meta bucket everywhere; campaign/platform names come from the
// installReferrer object, falling back to standardizedAttribution (so string-deeplink
// Meta installs are included). First sessions only (= installs), test excluded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get('campaign') || '';
  const showAll = searchParams.get('all') === '1'; // bypass the recent-launch filter
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:campaigns:${dateKey(dp)}:${campaign}:${showAll ? 'all' : 'recent'}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT ${CAMPAIGN_NAME}                          AS campaign,
               ${AD_PLATFORM}                            AS platform,
               "installReferrer"->>'ad_objective_name'   AS objective,
               COUNT(*)::text                            AS installs,
               -- median seconds from ad click to install (creative-quality signal);
               -- sane range only, skip junk/huge values.
               ROUND(percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY (${SA}->>'clickToInstallDuration')::numeric
               ) FILTER (
                 WHERE ${SA}->>'clickToInstallDuration' ~ '^[0-9]+$'
                   AND (${SA}->>'clickToInstallDuration')::numeric BETWEEN 0 AND 86400
               ))::text                                  AS median_cti
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND ${IS_META}
          ${clause}
          ${camp}
        GROUP BY 1, 2, 3
        ORDER BY COUNT(*) DESC
        LIMIT 300;
      `;
      // Always resolve launch dates (cached) so the Launched column is populated even
      // in show-all mode; showAll only disables the recency FILTER below.
      const [rows, launch] = await Promise.all([query<Row>(sql, params), campaignLaunchDates()]);
      const cutoff = launchCutoff();
      let dropped = 0;
      const data = rows
        .map((r) => ({
          campaign: r.campaign || '(unnamed)',
          launchedAt: r.campaign ? launch[r.campaign] || null : null,
          platform: r.platform || '—',
          objective: r.objective || '—',
          installs: parseInt(r.installs, 10),
          medianCti: r.median_cti != null ? parseInt(r.median_cti, 10) : null,
        }))
        // Keep recently-launched campaigns; unnamed/unknown-launch rows are kept
        // (they aren't a nameable "old campaign"). ?all=1 disables the filter.
        .filter((r) => {
          if (showAll || !r.launchedAt) return true;
          if (r.launchedAt >= cutoff) return true;
          dropped++;
          return false;
        });
      return {
        data,
        total: data.reduce((a, b) => a + b.installs, 0),
        recentOnly: !showAll,
        launchMonths: LAUNCH_MONTHS,
        cutoff,
        droppedOld: dropped,
        sql: displaySql(sql, params),
      };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
