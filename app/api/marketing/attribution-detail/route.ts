import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, SA, parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Extra attribution detail from additionalDetails / standardizedAttribution:
//   platforms   — true ad/install platform (originalSource): instagram, facebook,
//                 audience_network, google-play, direct, whatsapp …
//   entryPoints — how the session opened (sessionContext.entryPoint): APP_ICON,
//                 DEEP_LINK, PUSH_NOTIFICATION …
const AD = `"additionalDetails"->'additionalDetails'`;

interface Row { k: string; installs: string }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:attribution-detail:${dateKey(dp)}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [];
      const { clause } = dateClause('created_at', dp, params);
      const platformSql = `
        SELECT COALESCE(NULLIF(${SA}->>'originalSource', ''), '(unknown)') AS k,
               COUNT(*)::text                                              AS installs
        FROM history.session
        WHERE ${COHORT_WHERE} ${clause}
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 20;
      `;
      const entrySql = `
        SELECT COALESCE(NULLIF(${AD}->'sessionContext'->>'entryPoint', ''), '(unknown)') AS k,
               COUNT(*)::text                                                            AS installs
        FROM history.session
        WHERE ${COHORT_WHERE} ${clause}
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 20;
      `;
      const [plat, entry] = await Promise.all([query<Row>(platformSql, params), query<Row>(entrySql, params)]);
      const map = (rows: Row[]) => rows.map((r) => ({ label: r.k, installs: parseInt(r.installs, 10) }));
      const platforms = map(plat);
      const entryPoints = map(entry);
      return {
        platforms,
        platformsTotal: platforms.reduce((a, b) => a + b.installs, 0),
        entryPoints,
        entryTotal: entryPoints.reduce((a, b) => a + b.installs, 0),
        sql: '-- platforms:\n' + displaySql(platformSql, params) + ';\n\n-- entry points:\n' + displaySql(entrySql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
