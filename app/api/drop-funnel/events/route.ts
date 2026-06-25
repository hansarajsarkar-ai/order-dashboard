import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUYER_APP = '2391550b-7f93-4b02-8043-60a8646ec4f4';

// Funnel stages from events.event. Counts + distinct users (buyer, else session
// for unauthenticated traffic).
//
// PERFORMANCE: events.event is ~79 GB and indexed mainly on created_at, so a
// 90-day distinct scan is slow/will time out without a covering index. Create
// this once (e.g. via pgAdmin) to make these queries index-only & fast:
//
//   CREATE INDEX CONCURRENTLY funnel_evt_buyer_idx
//   ON events.event ("eventTypeId", created_at)
//   INCLUDE ("buyerId","sessionId")
//   WHERE "appId" = '2391550b-7f93-4b02-8043-60a8646ec4f4'
//     AND COALESCE("isTest",false) = false
//     AND "eventTypeId" IN ('home_page_view','added_to_PO','seller_screen_viewed',
//          'cart_viewed','cart_to_payment_clicked',
//          'enter_address_screen_viewed','enter_address_screen_save_address');
//
// Until it exists, keep the window short (7–30 days).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '30', 10) || 30));

  try {
    const payload = await cached(`df:events:${days}`, 30 * 60_000, async () => {
      const since = `now() - (${days} * interval '1 day')`;
      const u = `count(DISTINCT COALESCE("buyerId","sessionId"))`;
      const sql = `
        SELECT
          count(*) FILTER (WHERE "eventTypeId"='home_page_view')::int                     AS home_views,
          ${u} FILTER (WHERE "eventTypeId"='home_page_view')::int                          AS home_users,
          count(*) FILTER (WHERE "eventTypeId"='added_to_PO')::int                         AS atc_events,
          ${u} FILTER (WHERE "eventTypeId"='added_to_PO')::int                             AS atc_users,
          count(*) FILTER (WHERE "eventTypeId"='seller_screen_viewed')::int                AS seller_views,
          ${u} FILTER (WHERE "eventTypeId"='seller_screen_viewed')::int                    AS seller_users,
          count(*) FILTER (WHERE "eventTypeId"='cart_viewed')::int                         AS cart_views,
          ${u} FILTER (WHERE "eventTypeId"='cart_viewed')::int                             AS cart_users,
          count(*) FILTER (WHERE "eventTypeId"='cart_to_payment_clicked')::int             AS mov_events,
          ${u} FILTER (WHERE "eventTypeId"='cart_to_payment_clicked')::int                 AS mov_users,
          count(*) FILTER (WHERE "eventTypeId"='enter_address_screen_viewed')::int         AS addr_viewed,
          count(*) FILTER (WHERE "eventTypeId"='enter_address_screen_save_address')::int   AS addr_saved
        FROM events.event
        WHERE "appId" = '${BUYER_APP}'
          AND COALESCE("isTest",false) = false
          AND "eventTypeId" IN ('home_page_view','added_to_PO','seller_screen_viewed',
               'cart_viewed','cart_to_payment_clicked',
               'enter_address_screen_viewed','enter_address_screen_save_address')
          AND created_at >= ${since}`;

      const rows = await query<Record<string, number>>(sql);
      const r = rows[0] || {};
      const n = (k: string) => Number(r[k] || 0);
      return {
        stages: {
          homeViews: n('home_views'), homeUsers: n('home_users'),
          atcEvents: n('atc_events'), atcUsers: n('atc_users'),
          sellerViews: n('seller_views'), sellerUsers: n('seller_users'),
          cartViews: n('cart_views'), cartUsers: n('cart_users'),
          movEvents: n('mov_events'), movUsers: n('mov_users'),
          addrViewed: n('addr_viewed'), addrSaved: n('addr_saved'),
        },
        sql: displaySql(sql),
      };
    });

    return NextResponse.json({ ...payload, days, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
