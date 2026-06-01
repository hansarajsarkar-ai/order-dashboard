import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR, MEANINGFUL_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await query<{
      agent_name: string;
      total_calls: string;
      connected_calls: string;
      meaningful_calls: string;
      missed: string;
      avg_duration: string | null;
      total_talk_time: string | null;
      unique_customers: string;
    }>(
      `
      SELECT
        agent_name,
        COUNT(*)::text AS total_calls,
        SUM(${CONNECTED_EXPR}::int)::text AS connected_calls,
        SUM(${MEANINGFUL_EXPR}::int)::text AS meaningful_calls,
        SUM((call_status = 'Missed')::int)::text AS missed,
        AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration,
        SUM(${DURATION_EXPR})::text AS total_talk_time,
        COUNT(DISTINCT call_to_number) FILTER (WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_customers
      FROM "smartFlo"."call_logs"
      WHERE ${where}
        AND agent_name IS NOT NULL AND agent_name <> ''
      GROUP BY agent_name
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
      LIMIT 100
      `,
      params,
    );

    const agents = rows.map((r) => {
      const total = Number(r.total_calls || 0);
      const connected = Number(r.connected_calls || 0);
      const meaningful = Number(r.meaningful_calls || 0);
      return {
        agentName: r.agent_name,
        totalCalls: total,
        connectedCalls: connected,
        meaningfulCalls: meaningful,
        missedCalls: Number(r.missed || 0),
        avgDuration: Math.round(Number(r.avg_duration || 0)),
        totalTalkTime: Number(r.total_talk_time || 0),
        uniqueCustomers: Number(r.unique_customers || 0),
        connectionRate: total ? connected / total : 0,
        meaningfulRate: total ? meaningful / total : 0,
      };
    });

    return NextResponse.json({ agents });
  } catch (err) {
    console.error('agents error', err);
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
}
