import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    // Duration buckets across ALL calls (including 0-duration to flag drop-offs).
    const durRows = await query<{ bucket: string; calls: string }>(
      `
      SELECT bucket, COUNT(*)::text AS calls FROM (
        SELECT CASE
          WHEN ${DURATION_EXPR} = 0 THEN '0 sec (not connected)'
          WHEN ${DURATION_EXPR} BETWEEN 1 AND 14 THEN '1-14 sec'
          WHEN ${DURATION_EXPR} BETWEEN 15 AND 29 THEN '15-29 sec'
          WHEN ${DURATION_EXPR} BETWEEN 30 AND 59 THEN '30-59 sec'
          WHEN ${DURATION_EXPR} BETWEEN 60 AND 119 THEN '1-2 min'
          WHEN ${DURATION_EXPR} BETWEEN 120 AND 299 THEN '2-5 min'
          ELSE '5+ min'
        END AS bucket
        FROM "smartFlo"."call_logs"
        WHERE ${where}
      ) b
      GROUP BY bucket
      `,
      params,
    );

    const order = ['0 sec (not connected)', '1-14 sec', '15-29 sec', '30-59 sec', '1-2 min', '2-5 min', '5+ min'];
    const durationBuckets = order.map((b) => {
      const found = durRows.find((r) => r.bucket === b);
      return { bucket: b, calls: found ? Number(found.calls) : 0 };
    });

    // Top dispositions (call outcomes).
    const dispoRows = await query<{ name: string; code: string; calls: string }>(
      `
      SELECT
        COALESCE(NULLIF(disposition->>'name',''), 'Unknown') AS name,
        COALESCE(NULLIF(disposition->>'code',''), '—')      AS code,
        COUNT(*)::text                                       AS calls
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY name, code
      ORDER BY COUNT(*) DESC
      LIMIT 15
      `,
      params,
    );

    const dispositions = dispoRows.map((r) => ({
      name: r.name,
      code: r.code,
      calls: Number(r.calls || 0),
    }));

    // Opportunity loss split.
    const lossRows = await query<{
      total: string;
      missed: string;
      no_answer: string;
      short: string;
      not_connected: string;
    }>(
      `
      SELECT
        COUNT(*)::text AS total,
        SUM((call_status = 'Missed')::int)::text AS missed,
        SUM((call_status = 'No Answer')::int)::text AS no_answer,
        SUM((${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0 AND ${DURATION_EXPR} < 15)::int)::text AS short,
        SUM((NOT ${CONNECTED_EXPR})::int)::text AS not_connected
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      `,
      params,
    );

    const l = lossRows[0];
    const total = Number(l.total || 0);
    return NextResponse.json({
      durationBuckets,
      dispositions,
      opportunityLoss: {
        total,
        missed: Number(l.missed || 0),
        noAnswer: Number(l.no_answer || 0),
        shortCalls: Number(l.short || 0),
        notConnected: Number(l.not_connected || 0),
        missedRate: total ? Number(l.missed) / total : 0,
        noAnswerRate: total ? Number(l.no_answer) / total : 0,
        shortRate: total ? Number(l.short) / total : 0,
        notConnectedRate: total ? Number(l.not_connected) / total : 0,
      },
    });
  } catch (err) {
    console.error('outcomes error', err);
    return NextResponse.json({ error: 'Failed to load outcomes' }, { status: 500 });
  }
}
