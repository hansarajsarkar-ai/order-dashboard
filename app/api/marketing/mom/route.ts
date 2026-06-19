import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Month-over-month, TILL DATE: installs this calendar month so far vs the SAME
// number of days in the previous month (e.g. Jun 1–18 vs May 1–18). Independent
// of the dashboard date filter (it's inherently a current-vs-previous-month KPI);
// respects the campaign filter. Compares equal complete-day spans (excludes
// today, which is partial), so the % is fair.
interface Row { this_mtd: string; last_mtd: string; span_days: string; this_label: string; last_label: string }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get('campaign') || '';

  try {
    const payload = await cached(`mkt:mom:${campaign}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT
          (SELECT COUNT(*) FROM history.session
             WHERE ${COHORT_WHERE}
               AND created_at >= date_trunc('month', current_date)
               AND created_at < current_date
               ${camp})::text AS this_mtd,
          (SELECT COUNT(*) FROM history.session
             WHERE ${COHORT_WHERE}
               AND created_at >= date_trunc('month', current_date) - interval '1 month'
               AND created_at < (date_trunc('month', current_date) - interval '1 month')::date
                                 + (current_date - date_trunc('month', current_date)::date)
               ${camp})::text AS last_mtd,
          (current_date - date_trunc('month', current_date)::date)::text       AS span_days,
          to_char(date_trunc('month', current_date), 'Mon')                    AS this_label,
          to_char(date_trunc('month', current_date) - interval '1 month', 'Mon') AS last_label
      `;
      const rows = await query<Row>(sql, params);
      const r = rows[0];
      const thisMtd = parseInt(r?.this_mtd || '0', 10);
      const lastMtd = parseInt(r?.last_mtd || '0', 10);
      return {
        thisMtd,
        lastMtd,
        spanDays: parseInt(r?.span_days || '0', 10),
        thisLabel: r?.this_label || '',
        lastLabel: r?.last_label || '',
        pct: lastMtd ? ((thisMtd - lastMtd) / lastMtd) * 100 : null,
        sql: displaySql(sql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
