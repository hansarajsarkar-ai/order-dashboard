import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  campaign: string | null;
  sessions: string;
}

// WhatsApp-attributed installs — first sessions whose installReferrer is a
// WhatsApp deeplink (utm_source=whatsapp), grouped by utm_campaign. Scoped to
// the same new-buyer-install cohort as every other panel (COHORT_WHERE), so the
// "sessions" here are first-session installs, not all re-engagement clicks. The
// jsonb_typeof='string' pre-filter keeps the scan light (skips paid-ad objects).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const payload = await cached(`mkt:whatsapp:${days}`, 5 * 60_000, async () => {
      const sql = `
        SELECT substring(r FROM 'utm_campaign=([^&]+)') AS campaign,
               COUNT(*)::text                           AS sessions
        FROM (
          SELECT "installReferrer" #>> '{}' AS r
          FROM history.session
          WHERE ${COHORT_WHERE}
            AND jsonb_typeof("installReferrer") = 'string'
            AND created_at >= current_date - $1::int
        ) s
        WHERE r ILIKE '%utm_source=whatsapp%'
        GROUP BY 1
        ORDER BY COUNT(*) DESC
        LIMIT 300;
      `;
      const rows = await query<Row>(sql, [days]);
      const data = rows.map((r) => ({ campaign: r.campaign || '(no campaign)', sessions: parseInt(r.sessions, 10) }));
      return { data, total: data.reduce((a, b) => a + b.sessions, 0), windowDays: days, sql: displaySql(sql, [days]) };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
