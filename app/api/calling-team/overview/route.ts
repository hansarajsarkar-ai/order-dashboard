import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, MISSED_EXPR, NO_ANSWER_EXPR, DURATION_EXPR, MEANINGFUL_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await query<{
      total_calls: string;
      unique_customers: string;
      unique_agents: string;
      connected_calls: string;
      missed_calls: string;
      no_answer_calls: string;
      short_calls: string;
      meaningful_calls: string;
      avg_duration: string | null;
      total_talk_time_sec: string | null;
      avg_duration_connected: string | null;
      repeat_customers: string;
      first_touch_success: string;
    }>(
      `
      WITH base AS (
        SELECT
          call_to_number,
          agent_name,
          call_status,
          ${DURATION_EXPR} AS dur,
          ${CONNECTED_EXPR}::int AS connected_int,
          ${MISSED_EXPR}::int AS missed_int,
          ${NO_ANSWER_EXPR}::int AS no_answer_int,
          ${MEANINGFUL_EXPR}::int AS meaningful_int,
          start_stamp
        FROM "smartFlo"."call_logs"
        WHERE ${where}
      ),
      cust AS (
        SELECT call_to_number,
               COUNT(*) AS calls,
               SUM(connected_int) AS connected
        FROM base
        WHERE call_to_number IS NOT NULL AND call_to_number <> ''
        GROUP BY call_to_number
      )
      SELECT
        (SELECT COUNT(*) FROM base)::text AS total_calls,
        (SELECT COUNT(DISTINCT call_to_number) FROM base WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_customers,
        (SELECT COUNT(DISTINCT agent_name) FROM base WHERE agent_name IS NOT NULL AND agent_name <> '')::text AS unique_agents,
        (SELECT SUM(connected_int) FROM base)::text AS connected_calls,
        (SELECT SUM(missed_int) FROM base)::text AS missed_calls,
        (SELECT SUM(no_answer_int) FROM base)::text AS no_answer_calls,
        (SELECT COUNT(*) FROM base WHERE connected_int = 1 AND dur > 0 AND dur < 15)::text AS short_calls,
        (SELECT SUM(meaningful_int) FROM base)::text AS meaningful_calls,
        (SELECT AVG(dur) FILTER (WHERE connected_int = 1 AND dur > 0) FROM base)::text AS avg_duration_connected,
        (SELECT AVG(dur) FROM base)::text AS avg_duration,
        (SELECT SUM(dur) FROM base)::text AS total_talk_time_sec,
        (SELECT COUNT(*) FROM cust WHERE calls > 1)::text AS repeat_customers,
        (SELECT COUNT(*) FROM cust WHERE calls = 1 AND connected > 0)::text AS first_touch_success
      `,
      params,
    );

    const r = rows[0];
    const total = Number(r.total_calls || 0);
    const connected = Number(r.connected_calls || 0);
    const missed = Number(r.missed_calls || 0);
    const noAnswer = Number(r.no_answer_calls || 0);
    const rejected = Math.max(total - connected - missed - noAnswer, 0);
    const uniqueCustomers = Number(r.unique_customers || 0);
    const uniqueAgents = Number(r.unique_agents || 0);
    const repeat = Number(r.repeat_customers || 0);
    const firstTouchSuccess = Number(r.first_touch_success || 0);

    return NextResponse.json({
      totalCalls: total,
      uniqueCustomers,
      uniqueAgents,
      connectedCalls: connected,
      missedCalls: missed,
      noAnswerCalls: noAnswer,
      rejectedCalls: rejected,
      shortCalls: Number(r.short_calls || 0),
      meaningfulCalls: Number(r.meaningful_calls || 0),
      answerRate: total ? connected / total : 0,
      connectionRate: total ? connected / total : 0,
      missRate: total ? (missed + noAnswer) / total : 0,
      avgDuration: Number(r.avg_duration || 0),
      avgDurationConnected: Number(r.avg_duration_connected || 0),
      totalTalkTimeSec: Number(r.total_talk_time_sec || 0),
      avgCallsPerCustomer: uniqueCustomers ? total / uniqueCustomers : 0,
      avgCallsPerAgent: uniqueAgents ? total / uniqueAgents : 0,
      repeatContactRate: uniqueCustomers ? repeat / uniqueCustomers : 0,
      firstContactSuccessRate: uniqueCustomers ? firstTouchSuccess / uniqueCustomers : 0,
    });
  } catch (err) {
    console.error('overview error', err);
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 });
  }
}
