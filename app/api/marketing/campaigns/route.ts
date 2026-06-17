import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { COHORT_WHERE } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';

interface Row {
  campaign: string | null;
  platform: string | null;
  objective: string | null;
  installs: string;
}

// Meta (Facebook/Instagram) paid-ad campaign performance — installs attributed
// to each campaign × publisher platform, parsed from the installReferrer JSON
// object. First sessions only (= installs), test sessions excluded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const sql = `
      SELECT "installReferrer"->>'campaign_name'       AS campaign,
             "installReferrer"->>'publisher_platform'  AS platform,
             "installReferrer"->>'ad_objective_name'   AS objective,
             COUNT(*)::text                            AS installs
      FROM history.session
      WHERE ${COHORT_WHERE}
        AND jsonb_typeof("installReferrer") = 'object'
        AND created_at >= current_date - $1::int
      GROUP BY 1, 2, 3
      ORDER BY COUNT(*) DESC
      LIMIT 300;
    `;
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({
      campaign: r.campaign || '(unnamed)',
      platform: r.platform || '—',
      objective: r.objective || '—',
      installs: parseInt(r.installs, 10),
    }));
    const total = data.reduce((a, b) => a + b.installs, 0);

    return NextResponse.json({
      data,
      total,
      windowDays: days,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
