import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Write endpoint for the Gift Update tab — saves the per-buyer gift tracker
// (calling status, remarks, Amazon order, ETA, dispatch status, finalize) into
// promotions."qpsBuyerProgress". Only these operational fields are editable;
// qualification/gift level is computed from orders and stays read-only.
//
// Works on both DB layers: params inline safely for Hasura run_sql (l748) and
// bind natively for direct Postgres (order-dashboard).

const CALLING = new Set(['PENDING', 'ATTEMPTED', 'CONNECTED', 'CONFIRMED', 'NOT_INTERESTED', 'INVALID_NUMBER']);
const DISPATCH = new Set(['NOT_ORDERED', 'ORDERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED']);

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const schemeId = String(b.schemeId ?? '').trim();
    const buyerId = String(b.buyerId ?? '').trim();
    if (!schemeId || !buyerId) {
      return NextResponse.json({ error: 'schemeId and buyerId are required' }, { status: 400 });
    }

    const callingStatus = String(b.callingStatus ?? 'PENDING');
    const giftDeliveryStatus = String(b.giftDeliveryStatus ?? 'NOT_ORDERED');
    if (!CALLING.has(callingStatus)) return NextResponse.json({ error: `invalid callingStatus: ${callingStatus}` }, { status: 400 });
    if (!DISPATCH.has(giftDeliveryStatus)) return NextResponse.json({ error: `invalid giftDeliveryStatus: ${giftDeliveryStatus}` }, { status: 400 });

    const remarks = b.remarks ? String(b.remarks).slice(0, 2000) : null;
    const amazonOrderId = b.amazonOrderId ? String(b.amazonOrderId).slice(0, 200) : null;
    // 'YYYY-MM-DD' or null
    const deliveryEta = b.deliveryEta && /^\d{4}-\d{2}-\d{2}$/.test(b.deliveryEta) ? String(b.deliveryEta) : null;
    const isFinalized = b.isFinalized === true || b.isFinalized === 'true';

    // Upsert on the (schemeId, buyerId) unique key. When finalizing, lock the
    // level the buyer's DELIVERED business currently clears, and stamp finalizedAt
    // once (never re-stamp an already-finalized buyer).
    await query(
      `
      INSERT INTO promotions."qpsBuyerProgress"
        (id, "schemeId", "buyerId", "callingStatus", remarks, "amazonOrderId",
         "deliveryEta", "giftDeliveryStatus", "isFinalized", "finalizedLevelId", "finalizedAt", updated_at)
      VALUES (
        gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::date, $7, $8,
        CASE WHEN $8 THEN (
          SELECT l.id FROM promotions."qpsSchemeLevel" l
          JOIN (
            SELECT COALESCE(sum("orderValue") FILTER (WHERE bucket = 'DELIVERED'), 0) AS del
            FROM promotions."qpsBuyerOrder" WHERE "schemeId" = $1 AND "buyerId" = $2
          ) d ON true
          WHERE l."schemeId" = $1 AND l."qualifyingAmount" <= d.del
          ORDER BY l."qualifyingAmount" DESC LIMIT 1
        ) ELSE NULL END,
        CASE WHEN $8 THEN now() ELSE NULL END,
        now()
      )
      ON CONFLICT ("schemeId", "buyerId") DO UPDATE SET
        "callingStatus"     = EXCLUDED."callingStatus",
        remarks             = EXCLUDED.remarks,
        "amazonOrderId"     = EXCLUDED."amazonOrderId",
        "deliveryEta"       = EXCLUDED."deliveryEta",
        "giftDeliveryStatus"= EXCLUDED."giftDeliveryStatus",
        "isFinalized"       = EXCLUDED."isFinalized",
        "finalizedLevelId"  = CASE WHEN EXCLUDED."isFinalized" THEN EXCLUDED."finalizedLevelId" ELSE NULL END,
        "finalizedAt"       = CASE WHEN EXCLUDED."isFinalized"
                                   THEN COALESCE(promotions."qpsBuyerProgress"."finalizedAt", now())
                                   ELSE NULL END,
        updated_at          = now()
      RETURNING id
      `,
      [schemeId, buyerId, callingStatus, remarks, amazonOrderId, deliveryEta, giftDeliveryStatus, isFinalized]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
