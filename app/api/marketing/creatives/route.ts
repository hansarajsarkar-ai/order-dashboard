import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  campaign: string | null;
  adgroup: string | null;
  placement: string | null;
  installs: string;
}

// Creative-level drill of Meta paid installs: campaign → adgroup → placement.
// Lets marketing see which specific creatives/placements drive installs, not just
// the campaign rollup. First sessions, object referrer only.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const sql = `
      SELECT "installReferrer"->>'campaign_name'                          AS campaign,
             "installReferrer"->>'adgroup_name'                           AS adgroup,
             COALESCE(NULLIF("installReferrer"->>'platform_position',''), '(n/a)') AS placement,
             COUNT(*)::text                                               AS installs
      FROM history.session
      WHERE "isFirstSession" = TRUE
        AND "isTest" = FALSE
        AND jsonb_typeof("installReferrer") = 'object'
        AND created_at >= current_date - $1::int
      GROUP BY 1, 2, 3
      ORDER BY COUNT(*) DESC
      LIMIT 300;
    `;
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({
      campaign: r.campaign || '(unnamed)',
      adgroup: r.adgroup || '(unnamed)',
      placement: r.placement || '(n/a)',
      installs: parseInt(r.installs, 10),
    }));
    const total = data.reduce((a, b) => a + b.installs, 0);

    return NextResponse.json({ data, total, windowDays: days, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
