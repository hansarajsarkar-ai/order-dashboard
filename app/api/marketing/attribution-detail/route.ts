import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { COHORT_WHERE, SA } from '@/lib/marketingCohort';

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
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const payload = await cached(`mkt:attribution-detail:${days}`, 5 * 60_000, async () => {
      const platformSql = `
        SELECT COALESCE(NULLIF(${SA}->>'originalSource', ''), '(unknown)') AS k,
               COUNT(*)::text                                              AS installs
        FROM history.session
        WHERE ${COHORT_WHERE} AND created_at >= current_date - $1::int
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 20;
      `;
      const entrySql = `
        SELECT COALESCE(NULLIF(${AD}->'sessionContext'->>'entryPoint', ''), '(unknown)') AS k,
               COUNT(*)::text                                                            AS installs
        FROM history.session
        WHERE ${COHORT_WHERE} AND created_at >= current_date - $1::int
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 20;
      `;
      const [plat, entry] = await Promise.all([query<Row>(platformSql, [days]), query<Row>(entrySql, [days])]);
      const map = (rows: Row[]) => rows.map((r) => ({ label: r.k, installs: parseInt(r.installs, 10) }));
      const platforms = map(plat);
      const entryPoints = map(entry);
      return {
        platforms,
        platformsTotal: platforms.reduce((a, b) => a + b.installs, 0),
        entryPoints,
        entryTotal: entryPoints.reduce((a, b) => a + b.installs, 0),
        windowDays: days,
        sql: '-- platforms:\n' + displaySql(platformSql, [days]) + ';\n\n-- entry points:\n' + displaySql(entrySql, [days]),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
