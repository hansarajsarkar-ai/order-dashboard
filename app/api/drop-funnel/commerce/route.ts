import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Carts (new cart system) and orders (purchaseOrder flow: DRAFT = cart,
// non-DRAFT = placed). Both are small tables relative to events/sessions.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '90', 10) || 90));
  try {
    const payload = await cached(`df:commerce:${days}`, 30 * 60_000, async () => {
      const since = `now() - (${days} * interval '1 day')`;
      const cartSql = `
        SELECT count(*)::int AS carts_created,
               count(DISTINCT "buyerId")::int AS buyers_with_cart,
               count(*) FILTER (WHERE COALESCE("isArchived",false)=false)::int AS active_carts,
               count(DISTINCT "buyerId") FILTER (WHERE COALESCE("isArchived",false)=false)::int AS buyers_active_cart
        FROM "purchaseOrder".cart
        WHERE COALESCE("isTest",false)=false AND created_at >= ${since}`;
      const orderSql = `
        SELECT count(*) FILTER (WHERE status='DRAFT')::int AS draft_carts,
               count(DISTINCT "buyerId") FILTER (WHERE status='DRAFT')::int AS draft_buyers,
               count(*) FILTER (WHERE status<>'DRAFT')::int AS placed_orders,
               count(DISTINCT "buyerId") FILTER (WHERE status<>'DRAFT')::int AS placed_buyers,
               count(*) FILTER (WHERE status IN ('COMPLETED','DELIVERED'))::int AS completed_orders
        FROM "purchaseOrder"."purchaseOrder"
        WHERE COALESCE("isTest",false)=false AND created_at >= ${since}`;

      const [ct, od] = await Promise.all([
        query<{ carts_created: number; buyers_with_cart: number; active_carts: number; buyers_active_cart: number }>(cartSql),
        query<{ draft_carts: number; draft_buyers: number; placed_orders: number; placed_buyers: number; completed_orders: number }>(orderSql),
      ]);
      const cart = ct[0] || { carts_created: 0, buyers_with_cart: 0, active_carts: 0, buyers_active_cart: 0 };
      const order = od[0] || { draft_carts: 0, draft_buyers: 0, placed_orders: 0, placed_buyers: 0, completed_orders: 0 };
      const num = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)])) as { [K in keyof T]: number };
      return { cart: num(cart), order: num(order), sql: { cart: displaySql(cartSql), order: displaySql(orderSql) } };
    });
    return NextResponse.json({ ...payload, days, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
