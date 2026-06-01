import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    // Day-of-week (0=Sun .. 6=Sat) × Hour (0-23) heatmap.
    const rows = await query<{
      dow: string;
      hour: string;
      total: string;
      connected: string;
    }>(
      `
      SELECT
        EXTRACT(DOW FROM start_date::date)::int::text AS dow,
        EXTRACT(HOUR FROM start_stamp::timestamp)::int::text AS hour,
        COUNT(*)::text AS total,
        SUM(${CONNECTED_EXPR}::int)::text AS connected
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY dow, hour
      `,
      params,
    );

    const cells = rows
      .filter((r) => r.dow !== null && r.hour !== null)
      .map((r) => ({
        dow: Number(r.dow),
        hour: Number(r.hour),
        total: Number(r.total || 0),
        connected: Number(r.connected || 0),
        connectionRate: Number(r.total) ? Number(r.connected) / Number(r.total) : 0,
      }));

    // Aggregated hour-of-day totals (for peak-hours chart).
    const hourTotals = Array.from({ length: 24 }, (_, h) => {
      const sum = cells.filter((c) => c.hour === h).reduce((a, b) => a + b.total, 0);
      const conn = cells.filter((c) => c.hour === h).reduce((a, b) => a + b.connected, 0);
      return { hour: h, total: sum, connected: conn, connectionRate: sum ? conn / sum : 0 };
    });

    // Weekday performance (0=Sun..6=Sat).
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = Array.from({ length: 7 }, (_, d) => {
      const day = cells.filter((c) => c.dow === d);
      const total = day.reduce((a, b) => a + b.total, 0);
      const conn = day.reduce((a, b) => a + b.connected, 0);
      return {
        dow: d,
        name: dowNames[d],
        total,
        connected: conn,
        connectionRate: total ? conn / total : 0,
      };
    });

    return NextResponse.json({ cells, hourTotals, weekday });
  } catch (err) {
    console.error('heatmap error', err);
    return NextResponse.json({ error: 'Failed to load heatmap' }, { status: 500 });
  }
}
