import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    // Per-customer aggregate, then bucketed.
    const rows = await query<{
      bucket: string;
      customers: string;
    }>(
      `
      WITH cust AS (
        SELECT call_to_number, COUNT(*) AS calls
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND call_to_number IS NOT NULL AND call_to_number <> ''
        GROUP BY call_to_number
      )
      SELECT bucket, COUNT(*)::text AS customers FROM (
        SELECT CASE
          WHEN calls = 1 THEN '1 call'
          WHEN calls = 2 THEN '2 calls'
          WHEN calls = 3 THEN '3 calls'
          WHEN calls = 4 THEN '4 calls'
          WHEN calls BETWEEN 5 AND 9 THEN '5-9 calls'
          WHEN calls BETWEEN 10 AND 19 THEN '10-19 calls'
          ELSE '20+ calls'
        END AS bucket
        FROM cust
      ) b
      GROUP BY bucket
      `,
      params,
    );

    const order = ['1 call', '2 calls', '3 calls', '4 calls', '5-9 calls', '10-19 calls', '20+ calls'];
    const distribution = order.map((b) => {
      const found = rows.find((r) => r.bucket === b);
      return { bucket: b, customers: found ? Number(found.customers) : 0 };
    });

    // Reachability split.
    const r2 = await query<{
      total: string;
      reachable: string;
      unreachable: string;
      frequently_missed: string;
    }>(
      `
      WITH cust AS (
        SELECT call_to_number,
               COUNT(*) AS calls,
               SUM(${CONNECTED_EXPR}::int) AS connected
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND call_to_number IS NOT NULL AND call_to_number <> ''
        GROUP BY call_to_number
      )
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE connected > 0)::text AS reachable,
        COUNT(*) FILTER (WHERE connected = 0)::text AS unreachable,
        COUNT(*) FILTER (WHERE connected = 0 AND calls >= 3)::text AS frequently_missed
      FROM cust
      `,
      params,
    );

    return NextResponse.json({
      distribution,
      reachability: {
        total: Number(r2[0]?.total || 0),
        reachable: Number(r2[0]?.reachable || 0),
        unreachable: Number(r2[0]?.unreachable || 0),
        frequentlyMissed: Number(r2[0]?.frequently_missed || 0),
      },
    });
  } catch (err) {
    console.error('customers error', err);
    return NextResponse.json({ error: 'Failed to load customer behavior' }, { status: 500 });
  }
}
