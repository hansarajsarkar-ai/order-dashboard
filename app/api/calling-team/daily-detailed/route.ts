import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, MISSED_EXPR, NO_ANSWER_EXPR, DURATION_EXPR, MEANINGFUL_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);
  const { searchParams } = new URL(req.url);
  const focusDay = searchParams.get('day'); // YYYY-MM-DD, optional

  try {
    // Per-day rich metrics across the filter window.
    const rows = await query<{
      day: string;
      total: string;
      connected: string;
      missed: string;
      no_answer: string;
      meaningful: string;
      short_calls: string;
      avg_duration_connected: string | null;
      total_talk_time: string | null;
      unique_customers: string;
      unique_agents: string;
    }>(
      `
      SELECT
        start_date::date                                                                     AS day,
        COUNT(*)::text                                                                       AS total,
        SUM(${CONNECTED_EXPR}::int)::text                                                    AS connected,
        SUM(${MISSED_EXPR}::int)::text                                                       AS missed,
        SUM(${NO_ANSWER_EXPR}::int)::text                                                    AS no_answer,
        SUM(${MEANINGFUL_EXPR}::int)::text                                                   AS meaningful,
        SUM((${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0 AND ${DURATION_EXPR} < 15)::int)::text AS short_calls,
        AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration_connected,
        SUM(${DURATION_EXPR})::text                                                          AS total_talk_time,
        COUNT(DISTINCT call_to_number) FILTER (WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_customers,
        COUNT(DISTINCT agent_name)     FILTER (WHERE agent_name     IS NOT NULL AND agent_name     <> '')::text AS unique_agents
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY day
      ORDER BY day
      `,
      params,
    );

    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const series = rows.map((r) => {
      const dayStr = typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
      const [y, m, d] = dayStr.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const total = Number(r.total || 0);
      const connected = Number(r.connected || 0);
      const missed = Number(r.missed || 0);
      const noAnswer = Number(r.no_answer || 0);
      const meaningful = Number(r.meaningful || 0);
      return {
        day: dayStr,
        dow,
        dowName: dowNames[dow],
        total,
        connected,
        missed,
        noAnswer,
        meaningful,
        shortCalls: Number(r.short_calls || 0),
        avgDuration: Math.round(Number(r.avg_duration_connected || 0)),
        totalTalkTime: Number(r.total_talk_time || 0),
        uniqueCustomers: Number(r.unique_customers || 0),
        uniqueAgents: Number(r.unique_agents || 0),
        connectionRate: total ? connected / total : 0,
        meaningfulRate: total ? meaningful / total : 0,
        notConnected: Math.max(total - connected, 0),
      };
    });

    // Per-day comparison: vs prior day, vs same-day last week.
    const byDay = new Map(series.map((s) => [s.day, s]));
    const enriched = series.map((s, i) => {
      const prev = i > 0 ? series[i - 1] : null;
      const wow = i >= 7 ? series[i - 7] : null;
      return {
        ...s,
        deltaPrevTotal: prev ? s.total - prev.total : null,
        deltaPrevPct: prev && prev.total > 0 ? ((s.total - prev.total) / prev.total) * 100 : null,
        wowDeltaPct: wow && wow.total > 0 ? ((s.total - wow.total) / wow.total) * 100 : null,
        wowConnectDelta: wow ? s.connectionRate - wow.connectionRate : null,
      };
    });

    // Day-of-week aggregate.
    const dowAgg = Array.from({ length: 7 }, (_, d) => {
      const sub = series.filter((s) => s.dow === d);
      const total = sub.reduce((a, b) => a + b.total, 0);
      const conn = sub.reduce((a, b) => a + b.connected, 0);
      const meaningful = sub.reduce((a, b) => a + b.meaningful, 0);
      const days = sub.length || 1;
      return {
        dow: d,
        name: dowNames[d],
        avgCalls: Math.round(total / days),
        avgConnected: Math.round(conn / days),
        avgMeaningful: Math.round(meaningful / days),
        connectionRate: total ? conn / total : 0,
        days: sub.length,
      };
    });

    // Period summary buckets.
    const totalCalls = series.reduce((a, b) => a + b.total, 0);
    const totalConnected = series.reduce((a, b) => a + b.connected, 0);
    const last7 = series.slice(-7);
    const prev7 = series.slice(-14, -7);
    const last7Total = last7.reduce((a, b) => a + b.total, 0);
    const prev7Total = prev7.reduce((a, b) => a + b.total, 0);
    const last7Avg = last7.length ? last7Total / last7.length : 0;
    const prev7Avg = prev7.length ? prev7Total / prev7.length : 0;
    const last7Connected = last7.reduce((a, b) => a + b.connected, 0);
    const last7ConnectRate = last7Total ? last7Connected / last7Total : 0;
    const prev7Connected = prev7.reduce((a, b) => a + b.connected, 0);
    const prev7ConnectRate = prev7Total ? prev7Connected / prev7Total : 0;

    const todayRow = series[series.length - 1] || null;
    const yesterdayRow = series[series.length - 2] || null;

    const periodSummary = {
      todayCalls: todayRow?.total ?? 0,
      todayConnectRate: todayRow?.connectionRate ?? 0,
      yesterdayCalls: yesterdayRow?.total ?? 0,
      yesterdayConnectRate: yesterdayRow?.connectionRate ?? 0,
      last7Avg,
      prev7Avg,
      last7ConnectRate,
      prev7ConnectRate,
      windowAvg: series.length ? totalCalls / series.length : 0,
      windowConnectRate: totalCalls ? totalConnected / totalCalls : 0,
      bestDay: series.length ? series.reduce((a, b) => (b.total > a.total ? b : a)) : null,
      worstDay: series.length ? series.reduce((a, b) => (b.total < a.total ? b : a)) : null,
      bestConnect: series.length ? series.reduce((a, b) => (b.connectionRate > a.connectionRate ? b : a)) : null,
    };

    // Optional: hour-by-hour breakdown for a specific day.
    let dayHourly: { hour: number; total: number; connected: number; missed: number; noAnswer: number; avgDuration: number; connectionRate: number }[] | undefined;
    if (focusDay && byDay.has(focusDay)) {
      // Build a fresh where that scopes to that single day on top of existing filters.
      const dayParams = [...params, focusDay];
      const hourRows = await query<{
        hour: string;
        total: string;
        connected: string;
        missed: string;
        no_answer: string;
        avg_duration: string | null;
      }>(
        `
        SELECT
          EXTRACT(HOUR FROM start_stamp::timestamp)::int::text AS hour,
          COUNT(*)::text AS total,
          SUM(${CONNECTED_EXPR}::int)::text AS connected,
          SUM(${MISSED_EXPR}::int)::text AS missed,
          SUM(${NO_ANSWER_EXPR}::int)::text AS no_answer,
          AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration
        FROM "smartFlo"."call_logs"
        WHERE ${where} AND start_date = $${dayParams.length}
        GROUP BY hour
        ORDER BY hour
        `,
        dayParams,
      );
      const byHour = new Map(hourRows.map((r) => [Number(r.hour), r]));
      dayHourly = Array.from({ length: 24 }, (_, h) => {
        const r = byHour.get(h);
        const total = Number(r?.total || 0);
        const connected = Number(r?.connected || 0);
        return {
          hour: h,
          total,
          connected,
          missed: Number(r?.missed || 0),
          noAnswer: Number(r?.no_answer || 0),
          avgDuration: Math.round(Number(r?.avg_duration || 0)),
          connectionRate: total ? connected / total : 0,
        };
      });
    }

    return NextResponse.json({
      series: enriched,
      dowAgg,
      summary: periodSummary,
      dayHourly,
    });
  } catch (err) {
    console.error('daily-detailed error', err);
    return NextResponse.json({ error: 'Failed to load daily trend' }, { status: 500 });
  }
}
