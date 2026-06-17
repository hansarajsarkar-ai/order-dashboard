import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, CHANNEL_CASE } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  channel: string;
  installs: string;
}

// Classify each install by acquisition channel (see CHANNEL_CASE), over the
// shared new-buyer-install cohort (see COHORT_WHERE).

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const payload = await cached(`mkt:channel-mix:${days}`, 5 * 60_000, async () => {
      const sql = `
        SELECT ${CHANNEL_CASE} AS channel,
               COUNT(*)::text  AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND created_at >= current_date - $1::int
        GROUP BY 1
        ORDER BY COUNT(*) DESC;
      `;
      const rows = await query<Row>(sql, [days]);
      const data = rows.map((r) => ({ channel: r.channel, installs: parseInt(r.installs, 10) }));
      return { data, total: data.reduce((a, b) => a + b.installs, 0), windowDays: days };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
