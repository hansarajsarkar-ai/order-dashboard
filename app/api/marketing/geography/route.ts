import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause, IS_PAID_STRING } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:geography:${days}:${campaign}`, 5 * 60_000, async () => {
      const params: (string | number)[] = [days];
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT COALESCE(NULLIF("userProperties"->>'state', ''), '(unknown)')          AS state,
               COUNT(*) FILTER (WHERE jsonb_typeof("installReferrer") = 'object' OR ${IS_PAID_STRING})::text AS paid,
               COUNT(*)::text                                                          AS total
        FROM history.session
        WHERE ${COHORT_WHERE}
          AND created_at >= current_date - $1::int
          ${camp}
        GROUP BY 1
        ORDER BY COUNT(*) DESC
        LIMIT 40;
      `;
      const rows = await query<Row>(sql, params);
      const data = rows.map((r) => {
        const total = parseInt(r.total, 10);
        const paid = parseInt(r.paid, 10);
        return { state: r.state, paid, other: total - paid, total };
      });
      return { data, total: data.reduce((a, b) => a + b.total, 0), windowDays: days };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
