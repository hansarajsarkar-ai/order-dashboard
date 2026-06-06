import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Active Agent Count — distinct agents who made at least one outbound call
 * on a given date, scoped to the lead-generation campaigns.
 *
 *   direction      = 'outbound'   (stored as 'Outbound'; matched case-insensitively)
 *   campaign_name  IN ('Warm_Lead', 'Cold Lead Campaign')
 *   metric         = COUNT(DISTINCT agent_name) per start_date
 *
 * Date window mirrors /api/margin-overview so the chart axis lines up with the
 * P&L tab: either an explicit [startDate, endDate] (inclusive) or a rolling
 * N-day lookback via `days`. start_date is text ISO ('YYYY-MM-DD'), so plain
 * lexical comparison against a formatted date bound is correct.
 */

interface Row {
  day: string | null; // null = GROUPING SETS grand-total row
  active_agents: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const useCustom = !!startDate && !!endDate && isoDate.test(startDate) && isoDate.test(endDate);

  const daysRaw = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

  const dateFilter = useCustom
    ? `start_date >= $1 AND start_date <= $2`
    : `start_date >= to_char(CURRENT_DATE - make_interval(days => $1::int), 'YYYY-MM-DD')`;
  const params: unknown[] = useCustom ? [startDate, endDate] : [days];

  const sql = `
    SELECT
      to_char(start_date::date, 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT agent_name)              AS active_agents
    FROM "smartFlo"."call_logs"
    WHERE ${dateFilter}
      AND LOWER(direction) = 'outbound'
      AND campaign_name IN ('Warm_Lead', 'Cold Lead Campaign')
      AND agent_name IS NOT NULL AND agent_name <> ''
    GROUP BY GROUPING SETS ((start_date::date), ())
    ORDER BY day DESC NULLS FIRST;
  `;

  try {
    const rows = await query<Row>(sql, params);

    // The GROUPING SETS `()` row (day IS NULL) holds the true distinct-agent
    // count across the whole window — agents active on multiple days are only
    // counted once, so this is NOT the sum of the daily counts.
    const grandRow = rows.find((r) => r.day === null);
    const dailyRows = rows.filter((r) => r.day !== null);

    const data = dailyRows.map((r) => ({
      date: r.day as string,
      activeAgentCount: Number(r.active_agents) || 0,
    }));

    const totalDistinctAgents = grandRow ? Number(grandRow.active_agents) || 0 : 0;
    const activeDays = data.length;
    const peak = data.reduce((m, d) => Math.max(m, d.activeAgentCount), 0);
    const avgPerActiveDay = activeDays
      ? Math.round((data.reduce((s, d) => s + d.activeAgentCount, 0) / activeDays) * 10) / 10
      : 0;

    return NextResponse.json({
      days: useCustom ? null : days,
      range: useCustom ? { startDate, endDate } : { days },
      data,
      totals: { totalDistinctAgents, activeDays, peak, avgPerActiveDay },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
