import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

// Per-month rollup for MoM (Month-over-Month) analysis.
export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await query<{
      month_key: string;
      total_attempts: string;
      unique_attempts: string;
      total_connected: string;
      unique_connected: string;
      connected_under_15: string;
      connected_15_plus: string;
      avg_connected_duration: string | null;
      active_agents: string;
      total_talk_time: string;
    }>(
      `
      SELECT
        TO_CHAR(start_date::date, 'YYYY-MM')                                                AS month_key,
        COUNT(*)::text                                                                       AS total_attempts,
        COUNT(DISTINCT call_to_number) FILTER (WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_attempts,
        SUM(${CONNECTED_EXPR}::int)::text                                                    AS total_connected,
        COUNT(DISTINCT call_to_number) FILTER (WHERE ${CONNECTED_EXPR} AND call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_connected,
        SUM((${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0 AND ${DURATION_EXPR} < 15)::int)::text AS connected_under_15,
        SUM((${CONNECTED_EXPR} AND ${DURATION_EXPR} >= 15)::int)::text                       AS connected_15_plus,
        AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_connected_duration,
        COUNT(DISTINCT agent_name) FILTER (WHERE agent_name IS NOT NULL AND agent_name <> '')::text AS active_agents,
        SUM(${DURATION_EXPR})::text                                                          AS total_talk_time
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY month_key
      ORDER BY month_key
      `,
      params,
    );

    const months = rows.map((r) => {
      const totalAttempts = Number(r.total_attempts || 0);
      const totalConnected = Number(r.total_connected || 0);
      return {
        monthKey: r.month_key,
        totalAttempts,
        uniqueAttempts: Number(r.unique_attempts || 0),
        totalConnected,
        uniqueConnected: Number(r.unique_connected || 0),
        connectedPct: totalAttempts ? totalConnected / totalAttempts : 0,
        connectedUnder15: Number(r.connected_under_15 || 0),
        connected15Plus: Number(r.connected_15_plus || 0),
        avgConnectedDuration: Math.round(Number(r.avg_connected_duration || 0)),
        activeAgents: Number(r.active_agents || 0),
        totalTalkTime: Number(r.total_talk_time || 0),
      };
    });

    return NextResponse.json({ months });
  } catch (err) {
    console.error('mom error', err);
    return NextResponse.json({ error: 'Failed to load MoM summary' }, { status: 500 });
  }
}
