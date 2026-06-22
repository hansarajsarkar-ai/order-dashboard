import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, campaignClause, IS_PAID, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  state: string;
  paid: string;
  total: string;
}

// Installs by buyer state, split into Paid (Meta) vs the rest. First sessions
// only, test excluded. State is resolved with a fallback chain to shrink the
// "(unknown)" bucket: install-time userProperties.state → the buyer's current
// profile state (users.buyer.state) → pincode→state (master.pincode, deduped),
// using the buyer's pincode or the install-time pincode.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get('campaign') || '';
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:geography:${dateKey(dp)}:${campaign}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const camp = campaignClause(campaign, params);
      const sql = `
        SELECT COALESCE(NULLIF(s.us_state, ''), NULLIF(b."state", ''), mp."state", '(unknown)') AS state,
               COUNT(*) FILTER (WHERE ${IS_PAID})::text AS paid,
               COUNT(*)::text                                                                   AS total
        FROM (
          SELECT "buyerId",
                 "userProperties"->>'state'                          AS us_state,
                 NULLIF(trim("userProperties"->>'pincode'), '')      AS us_pin,
                 "installReferrer",
                 "additionalDetails"
          FROM history.session
          WHERE ${COHORT_WHERE}
            ${clause}
            ${camp}
        ) s
        LEFT JOIN users.buyer b ON b."id" = s."buyerId"
        LEFT JOIN (SELECT DISTINCT ON ("pincode") "pincode", "state" FROM master."pincode") mp
          ON mp."pincode" = COALESCE(NULLIF(trim(b."pincode"), ''), s.us_pin)
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
      return { data, total: data.reduce((a, b) => a + b.total, 0), sql: displaySql(sql, params) };
    });

    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
