import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, MISSED_EXPR, NO_ANSWER_EXPR, DURATION_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await query<{
      day: string;
      total: string;
      connected: string;
      missed: string;
      no_answer: string;
      avg_duration: string | null;
      total_talk_time: string | null;
    }>(
      `
      SELECT
        start_date::date AS day,
        COUNT(*)::text AS total,
        SUM(${CONNECTED_EXPR}::int)::text AS connected,
        SUM(${MISSED_EXPR}::int)::text AS missed,
        SUM(${NO_ANSWER_EXPR}::int)::text AS no_answer,
        AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration,
        SUM(${DURATION_EXPR})::text AS total_talk_time
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY day
      ORDER BY day
      `,
      params,
    );

    const series = rows.map((r) => {
      const total = Number(r.total || 0);
      const connected = Number(r.connected || 0);
      const missed = Number(r.missed || 0);
      const noAnswer = Number(r.no_answer || 0);
      const rejected = Math.max(total - connected - missed - noAnswer, 0);
      return {
        day: typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10),
        total,
        connected,
        missed,
        noAnswer,
        rejected,
        avgDuration: Math.round(Number(r.avg_duration || 0)),
        totalTalkTime: Number(r.total_talk_time || 0),
      };
    });

    // 7-day moving average for total.
    const sma = series.map((_, i) => {
      const window = series.slice(Math.max(0, i - 6), i + 1);
      const sum = window.reduce((a, b) => a + b.total, 0);
      return Math.round(sum / window.length);
    });

    const result = series.map((s, i) => ({ ...s, sma7: sma[i] }));

    // Growth %: today vs same point last week (i-7)
    const withGrowth = result.map((s, i) => {
      const prior = i >= 7 ? result[i - 7].total : null;
      const growth = prior && prior > 0 ? ((s.total - prior) / prior) * 100 : null;
      return { ...s, growthWoW: growth === null ? null : Math.round(growth * 10) / 10 };
    });

    return NextResponse.json({ series: withGrowth });
  } catch (err) {
    console.error('trends error', err);
    return NextResponse.json({ error: 'Failed to load trends' }, { status: 500 });
  }
}
