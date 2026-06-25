import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUYER_APP = '2391550b-7f93-4b02-8043-60a8646ec4f4';

// Sessions, devices, new vs returning. Counts and distincts are split into
// separate run_sql calls so no single statement is too heavy.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '90', 10) || 90));
  try {
    const payload = await cached(`df:sessions:${days}`, 30 * 60_000, async () => {
      const since = `now() - (${days} * interval '1 day')`;
      const base = `FROM history.session
        WHERE "sessionStartTimestamp" >= ${since}
          AND "appId" = '${BUYER_APP}'
          AND COALESCE("isTest",false) = false`;

      const countSql = `SELECT count(*)::int AS total_sessions,
               count(*) FILTER (WHERE "buyerId" IS NULL)::int AS unauth_sessions ${base}`;
      const distSql = `SELECT count(DISTINCT "buyerId")::int AS distinct_buyers,
               count(DISTINCT "uniqueDeviceId")::int AS distinct_devices,
               count(DISTINCT "uniqueDeviceId") FILTER (WHERE "buyerId" IS NULL)::int AS unauth_devices ${base}`;
      const newSql = `SELECT count(DISTINCT "buyerId")::int AS new_buyers ${base} AND "buyerId" IS NOT NULL AND "isFirstSession"`;

      // sequential to avoid 3 concurrent big scans contending on the session table
      const c = (await query<{ total_sessions: number; unauth_sessions: number }>(countSql))[0] || { total_sessions: 0, unauth_sessions: 0 };
      const d = (await query<{ distinct_buyers: number; distinct_devices: number; unauth_devices: number }>(distSql))[0] || { distinct_buyers: 0, distinct_devices: 0, unauth_devices: 0 };
      const nb = (await query<{ new_buyers: number }>(newSql))[0]?.new_buyers || 0;

      return {
        total: Number(c.total_sessions), unauth: Number(c.unauth_sessions),
        distinctBuyers: Number(d.distinct_buyers), distinctDevices: Number(d.distinct_devices), unauthDevices: Number(d.unauth_devices),
        newBuyers: Number(nb), returningBuyers: Math.max(0, Number(d.distinct_buyers) - Number(nb)),
        sql: displaySql(countSql) + '\n\n-- distinct --\n' + displaySql(distSql) + '\n\n-- new buyers --\n' + displaySql(newSql),
      };
    });
    return NextResponse.json({ ...payload, days, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
