import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, CHANNEL_CASE, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

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
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:channel-mix:${dateKey(dp)}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const sql = `
        SELECT ${CHANNEL_CASE} AS channel,
               COUNT(*)::text  AS installs
        FROM history.session
        WHERE ${COHORT_WHERE}
          ${clause}
        GROUP BY 1
        ORDER BY COUNT(*) DESC;
      `;
      const rows = await query<Row>(sql, params);
      const data = rows.map((r) => ({ channel: r.channel, installs: parseInt(r.installs, 10) }));
      return { data, total: data.reduce((a, b) => a + b.installs, 0), sql: displaySql(sql, params) };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
