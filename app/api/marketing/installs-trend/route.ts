import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const GRAN: Record<string, 'day' | 'week' | 'month'> = { day: 'day', week: 'week', month: 'month' };

interface Row {
  bucket: string;
  installs: string;
  sessions: string;
}

// Installs (= first sessions) and total sessions per day/week/month, from
// history.session. A "first session" (isFirstSession=true) is treated as a new
// install/acquisition event. Test sessions excluded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;
  const gran = GRAN[(searchParams.get('granularity') || 'day').toLowerCase()] || 'day';

  try {
    const sql = `
      SELECT date_trunc($1, created_at)::date::text          AS bucket,
             COUNT(*) FILTER (WHERE "isFirstSession")::text  AS installs,
             COUNT(*)::text                                  AS sessions
      FROM history.session
      WHERE "isTest" = FALSE
        AND created_at >= current_date - $2::int
      GROUP BY 1
      ORDER BY 1;
    `;
    const rows = await query<Row>(sql, [gran, days]);

    const data = rows.map((r) => ({
      bucket: r.bucket,
      installs: parseInt(r.installs, 10),
      sessions: parseInt(r.sessions, 10),
    }));

    const totalInstalls = data.reduce((a, b) => a + b.installs, 0);
    const totalSessions = data.reduce((a, b) => a + b.sessions, 0);
    const peak = data.reduce(
      (best, r) => (r.installs > best.installs ? r : best),
      { bucket: '', installs: -1 }
    );
    const avg = data.length ? Math.round(totalInstalls / data.length) : 0;

    return NextResponse.json({
      data,
      summary: {
        totalInstalls,
        totalSessions,
        avg,
        peak: peak.installs >= 0 ? peak.installs : 0,
        peakBucket: peak.bucket || null,
        granularity: gran,
        windowDays: days,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
