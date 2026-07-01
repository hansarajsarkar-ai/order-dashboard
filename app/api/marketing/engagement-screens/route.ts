import { NextResponse } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// WHERE BUYERS ENGAGE — event volume + reach per app screen, from events.event.
// events.event only RETAINS a rolling ~3 days for the buyer app (older data is purged),
// so this is a fixed recent snapshot and intentionally does NOT follow the dashboard
// date filter. Event volume / events-per-buyer is a proxy for "where they spend time"
// (true seconds-on-screen isn't recorded). Restricted to the eventTypeIds covered by
// the funnel_evt_buyer_idx partial index so the scan stays an index-only scan (~4s).
const BUYER_APP_ID = '2391550b-7f93-4b02-8043-60a8646ec4f4';

// Friendly labels + display order for the covered screens (funnel order).
const SCREENS: { id: string; label: string }[] = [
  { id: 'home_page_view', label: 'Home' },
  { id: 'seller_screen_viewed', label: 'Seller Page' },
  { id: 'added_to_PO', label: 'Add to Cart' },
  { id: 'cart_viewed', label: 'Cart' },
  { id: 'cart_to_payment_clicked', label: 'Checkout / Payment' },
  { id: 'enter_address_screen_viewed', label: 'Address' },
  { id: 'enter_address_screen_save_address', label: 'Address Saved' },
];
const EVENT_IDS = SCREENS.map((s) => `'${s.id}'`).join(',');
const LABEL = Object.fromEntries(SCREENS.map((s, i) => [s.id, { label: s.label, order: i }]));

interface Row { ev: string; events: string; buyers: string }
interface Meta { dfrom: string | null; dto: string | null; total_buyers: string }

export async function GET() {
  try {
    const payload = await cached('mkt:engagement-screens', 30 * 60_000, async () => {
      const groupSql = `
        SELECT "eventTypeId"                  AS ev,
               COUNT(*)::text                 AS events,
               COUNT(DISTINCT "buyerId")::text AS buyers
        FROM events.event
        WHERE "appId" = '${BUYER_APP_ID}'
          AND COALESCE("isTest", false) = false
          AND "eventTypeId" IN (${EVENT_IDS})
          AND created_at >= now() - interval '7 days'
        GROUP BY 1;
      `;
      const metaSql = `
        SELECT MIN(created_at)::date::text        AS dfrom,
               MAX(created_at)::date::text        AS dto,
               COUNT(DISTINCT "buyerId")::text    AS total_buyers
        FROM events.event
        WHERE "appId" = '${BUYER_APP_ID}'
          AND COALESCE("isTest", false) = false
          AND "eventTypeId" IN (${EVENT_IDS})
          AND created_at >= now() - interval '7 days';
      `;
      const [rows, meta] = await Promise.all([query<Row>(groupSql), query<Meta>(metaSql)]);
      const data = rows
        .map((r) => {
          const events = parseInt(r.events, 10);
          const buyers = parseInt(r.buyers, 10);
          return {
            screen: LABEL[r.ev]?.label ?? r.ev,
            order: LABEL[r.ev]?.order ?? 99,
            events,
            buyers,
            perBuyer: buyers ? events / buyers : 0,
          };
        })
        .sort((a, b) => a.order - b.order);
      const m = meta[0];
      return {
        data,
        dataFrom: m?.dfrom ?? null,
        dataTo: m?.dto ?? null,
        totalBuyers: parseInt(m?.total_buyers || '0', 10),
        totalEvents: data.reduce((a, b) => a + b.events, 0),
        sql: displaySql(groupSql, []),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
