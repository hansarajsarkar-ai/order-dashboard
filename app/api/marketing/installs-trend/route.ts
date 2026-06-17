import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GRAN: Record<string, 'day' | 'week' | 'month'> = { day: 'day', week: 'week', month: 'month' };

interface Row {
  bucket: string;
  installs: string;
}

// New-buyer installs per day/week/month, from history.session, scoped to the
// shared cohort (buyer + buyer-app + first session + not master/test).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;
  const gran = GRAN[(searchParams.get('granularity') || 'day').toLowerCase()] || 'day';
  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:installs-trend:${gran}:${days}:${campaign}`, 5 * 60_000, async () => {
      const params: (string | number)[] = [gran, days];
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT date_trunc($1, created_at)::date::text AS bucket,
               COUNT(*)::text                         AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND created_at >= current_date - $2::int
          ${camp}
        GROUP BY 1
        ORDER BY 1;
      `;
      const rows = await query<Row>(sql, params);

      const data = rows.map((r) => ({ bucket: r.bucket, installs: parseInt(r.installs, 10) }));
      const totalInstalls = data.reduce((a, b) => a + b.installs, 0);
      const peak = data.reduce((best, r) => (r.installs > best.installs ? r : best), { bucket: '', installs: -1 });
      const avg = data.length ? Math.round(totalInstalls / data.length) : 0;

      return {
        data,
        summary: {
          totalInstalls,
          avg,
          peak: peak.installs >= 0 ? peak.installs : 0,
          peakBucket: peak.bucket || null,
          granularity: gran,
          windowDays: days,
        },
      };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
