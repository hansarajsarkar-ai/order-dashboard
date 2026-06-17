import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause, SA } from '@/lib/marketingCohort';

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
// to each campaign × publisher platform, parsed from the installReferrer JSON
// object. First sessions only (= installs), test sessions excluded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:campaigns:${days}:${campaign}`, 5 * 60_000, async () => {
      const params: (string | number)[] = [days];
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT "installReferrer"->>'campaign_name'       AS campaign,
               "installReferrer"->>'publisher_platform'  AS platform,
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
          AND jsonb_typeof("installReferrer") = 'object'
          AND created_at >= current_date - $1::int
          ${camp}
        GROUP BY 1, 2, 3
        ORDER BY COUNT(*) DESC
        LIMIT 300;
      `;
      const rows = await query<Row>(sql, params);
      const data = rows.map((r) => ({
        campaign: r.campaign || '(unnamed)',
        platform: r.platform || '—',
        objective: r.objective || '—',
        installs: parseInt(r.installs, 10),
        medianCti: r.median_cti != null ? parseInt(r.median_cti, 10) : null,
      }));
      return { data, total: data.reduce((a, b) => a + b.installs, 0), windowDays: days };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
