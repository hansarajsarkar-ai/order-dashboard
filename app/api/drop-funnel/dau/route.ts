import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUYER_APP = '2391550b-7f93-4b02-8043-60a8646ec4f4';

// Daily active buyers / devices for the buyer app, vs daily orders placed.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(180, parseInt(searchParams.get('days') || '30', 10) || 30));

  try {
    const payload = await cached(`df:dau:${days}`, 30 * 60_000, async () => {
      const since = `now() - (${days} * interval '1 day')`;
      const dauSql = `
        SELECT date_trunc('day', "sessionStartTimestamp")::date::text AS day,
               count(DISTINCT "buyerId")::int                          AS dau_buyers,
               count(DISTINCT "uniqueDeviceId")::int                   AS dau_devices
        FROM history.session
        WHERE "sessionStartTimestamp" >= ${since}
          AND "appId" = '${BUYER_APP}'
          AND COALESCE("isTest",false) = false
        GROUP BY 1 ORDER BY 1`;
      // Orders dated by markedPendingTime (when the buyer actually PLACES the
      // order), NOT created_at (which is when the draft cart was first made and
      // overcounts a day's orders). status<>'DRAFT' = genuinely placed.
      const ordSql = `
        SELECT "markedPendingTime"::date::text AS day, count(*)::int AS orders
        FROM "purchaseOrder"."purchaseOrder"
        WHERE COALESCE("isTest",false)=false
          AND status <> 'DRAFT'
          AND "markedPendingTime" >= ${since}
        GROUP BY 1 ORDER BY 1`;

      const [dau, ord] = await Promise.all([
        query<{ day: string; dau_buyers: string; dau_devices: string }>(dauSql),
        query<{ day: string; orders: string }>(ordSql),
      ]);
      // run_sql returns every cell as text — coerce to numbers so the client's
      // averages/ratios don't string-concatenate.
      const ordMap = new Map(ord.map((o) => [o.day, Number(o.orders)]));
      // Drop bad future-dated rows from client clock skew.
      const todayISO = new Date().toISOString().slice(0, 10);
      const data = dau
        .filter((d) => d.day <= todayISO)
        .map((d) => ({ day: d.day, buyers: Number(d.dau_buyers), devices: Number(d.dau_devices), orders: ordMap.get(d.day) || 0 }));

      return { data, sql: displaySql(dauSql) + '\n\n-- orders --\n' + displaySql(ordSql) };
    });

    return NextResponse.json({ ...payload, days, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
