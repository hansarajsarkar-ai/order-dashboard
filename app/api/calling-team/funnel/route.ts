import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await query<{
      total_calls: string;
      called_customers: string;
      connected_customers: string;
      meaningful_customers: string;
      successful_customers: string;
    }>(
      `
      WITH base AS (
        SELECT
          call_to_number,
          ${DURATION_EXPR} AS dur,
          ${CONNECTED_EXPR} AS connected,
          disposition->>'name' AS dispo_name,
          disposition->>'code' AS dispo_code
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND call_to_number IS NOT NULL AND call_to_number <> ''
      )
      SELECT
        (SELECT COUNT(*) FROM base)::text AS total_calls,
        (SELECT COUNT(DISTINCT call_to_number) FROM base)::text AS called_customers,
        (SELECT COUNT(DISTINCT call_to_number) FROM base WHERE connected)::text AS connected_customers,
        (SELECT COUNT(DISTINCT call_to_number) FROM base WHERE connected AND dur >= 30)::text AS meaningful_customers,
        (SELECT COUNT(DISTINCT call_to_number)
           FROM base
           WHERE connected AND dur >= 30
             AND (
               (dispo_name IS NOT NULL AND (
                 dispo_name ILIKE '%interested%' OR
                 dispo_name ILIKE '%promise%' OR
                 dispo_name ILIKE '%order%' OR
                 dispo_name ILIKE '%converted%' OR
                 dispo_name ILIKE '%eligible%' OR
                 dispo_name ILIKE '%confirm%'
               ))
               OR dispo_code IN ('INT','PTB','CONV','ORD')
             )
        )::text AS successful_customers
      `,
      params,
    );

    const r = rows[0];
    const calledCustomers = Number(r.called_customers || 0);
    const connectedCustomers = Number(r.connected_customers || 0);
    const meaningfulCustomers = Number(r.meaningful_customers || 0);
    const successfulCustomers = Number(r.successful_customers || 0);

    const stages = [
      { name: 'Total Calls', value: Number(r.total_calls || 0) },
      { name: 'Customers Called', value: calledCustomers },
      { name: 'Customers Connected', value: connectedCustomers },
      { name: 'Meaningful Conversation (≥30s)', value: meaningfulCustomers },
      { name: 'Successful Outcome', value: successfulCustomers },
    ];

    return NextResponse.json({ stages });
  } catch (err) {
    console.error('funnel error', err);
    return NextResponse.json({ error: 'Failed to load funnel' }, { status: 500 });
  }
}
