import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';

interface Row {
  campaign: string | null;
  campaign_id: string | null;
  installs: string;
}

// Distinct Meta campaigns (name + id + installs) in the window, to populate the
// header campaign filter. Cached so reopening the dropdown is instant.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const payload = await cached(`mkt:campaign-list:${days}`, 5 * 60_000, async () => {
      const sql = `
        SELECT "installReferrer"->>'campaign_name' AS campaign,
               "installReferrer"->>'campaign_id'   AS campaign_id,
               COUNT(*)::text                       AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND jsonb_typeof("installReferrer") = 'object'
          AND created_at >= current_date - $1::int
        GROUP BY 1, 2
        ORDER BY COUNT(*) DESC
        LIMIT 500;
      `;
      const rows = await query<Row>(sql, [days]);
      return {
        data: rows
          .filter((r) => r.campaign)
          .map((r) => ({ campaign: r.campaign as string, campaignId: r.campaign_id || '', installs: parseInt(r.installs, 10) })),
        windowDays: days,
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
