import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  try {
    const agents = await query<{ agent_name: string; calls: string }>(
      `
      SELECT agent_name, COUNT(*)::text AS calls
      FROM "smartFlo"."call_logs"
      WHERE ${where} AND agent_name IS NOT NULL AND agent_name <> ''
      GROUP BY agent_name
      ORDER BY COUNT(*) DESC
      LIMIT 200
      `,
      params,
    );
    const campaigns = await query<{ campaign_name: string; calls: string }>(
      `
      SELECT campaign_name, COUNT(*)::text AS calls
      FROM "smartFlo"."call_logs"
      WHERE ${where} AND campaign_name IS NOT NULL AND campaign_name <> ''
      GROUP BY campaign_name
      ORDER BY COUNT(*) DESC
      LIMIT 200
      `,
      params,
    );
    const statuses = await query<{ call_status: string; calls: string }>(
      `
      SELECT COALESCE(NULLIF(call_status,''), 'Unknown') AS call_status, COUNT(*)::text AS calls
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      GROUP BY call_status
      ORDER BY COUNT(*) DESC
      `,
      params,
    );
    return NextResponse.json({
      agents: agents.map((r) => ({ value: r.agent_name, calls: Number(r.calls) })),
      campaigns: campaigns.map((r) => ({ value: r.campaign_name, calls: Number(r.calls) })),
      statuses: statuses.map((r) => ({ value: r.call_status, calls: Number(r.calls) })),
    });
  } catch (err) {
    console.error('filters error', err);
    return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 });
  }
}
