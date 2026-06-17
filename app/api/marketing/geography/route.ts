import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  state: string;
  paid: string;
  total: string;
}

// Installs by buyer state (from userProperties.state), split into Paid (Meta) vs
// the rest. First sessions only, test excluded. ~1/3 of installs have no state.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const sql = `
      SELECT COALESCE(NULLIF("userProperties"->>'state', ''), '(unknown)')        AS state,
             COUNT(*) FILTER (WHERE jsonb_typeof("installReferrer") = 'object')::text AS paid,
             COUNT(*)::text                                                        AS total
      FROM history.session
      WHERE "isFirstSession" = TRUE
        AND "isTest" = FALSE
        AND created_at >= current_date - $1::int
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 40;
    `;
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => {
      const total = parseInt(r.total, 10);
      const paid = parseInt(r.paid, 10);
      return { state: r.state, paid, other: total - paid, total };
    });
    const grandTotal = data.reduce((a, b) => a + b.total, 0);

    return NextResponse.json({ data, total: grandTotal, windowDays: days, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
