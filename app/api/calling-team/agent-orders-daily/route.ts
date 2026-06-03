import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop } from '@/lib/db';
import { parseFilters, buildWhere } from '../_filters';

export const dynamic = 'force-dynamic';

// Agent × day order-count matrix. Same scope as /agent-orders (outbound ·
// Warm/Cold campaigns · same-day qualified D2R intercity orders, placement =
// markedPendingTime) but grouped by (agent, call day) so the UI can pivot it
// into rows = agents, columns = days. Returns one row per (agent, day) with a
// non-zero order count; the client fills the rest of the grid with zeros.
export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  // Index-friendly IST timestamp bounds for the order side.
  const startTs = `${f.startDate}T00:00:00+05:30`;
  const endExclusive = new Date(`${f.endDate}T00:00:00+05:30`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const pStart = params.push(startTs);
  const pEnd = params.push(endExclusive.toISOString());

  try {
    const rows = await queryNoNestloop<{ agent_name: string; day: string; order_count: string }>(
      `
      WITH ct AS MATERIALIZED (
        SELECT
          agent_name,
          CASE WHEN call_to_number LIKE '%-%'
            THEN RIGHT(REGEXP_REPLACE(SPLIT_PART(call_to_number, '-', 1), '[^0-9]', '', 'g'), 10)
            ELSE RIGHT(REGEXP_REPLACE(call_to_number, '[^0-9]', '', 'g'), 10) END AS phone,
          start_date::date AS call_date,
          (call_status = 'Answer') AS connected
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND (LOWER(direction) = 'outbound' OR direction = 'Manual')
          AND campaign_name IN ('Warm_Lead', 'Cold Lead Campaign')
          AND agent_name IS NOT NULL AND agent_name <> ''
          AND call_to_number IS NOT NULL AND call_to_number <> ''
      ),
      connected_calls AS MATERIALIZED (
        SELECT DISTINCT agent_name, phone, call_date FROM ct WHERE connected
      ),
      buyer_orders AS MATERIALIZED (
        SELECT
          po."poNumber" AS po_number,
          RIGHT(REGEXP_REPLACE(b."phone", '[^0-9]', '', 'g'), 10) AS phone,
          (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')::date AS order_date
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        JOIN "users"."buyer" b ON b."id" = po."buyerId"
        WHERE po."markedPendingTime" >= $${pStart}::timestamptz
          AND po."markedPendingTime" <  $${pEnd}::timestamptz
          AND po."status" != 'DRAFT'
          AND s."isD2RBrandSeller" = TRUE
          AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest" = FALSE AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
          AND po."isTest" = FALSE AND po."isFalseOrder" = FALSE
          AND po."deliveryNetwork" = 'THIRD_PARTY' AND po."deliveryType" = 'INTERCITY'
      )
      SELECT
        cc.agent_name,
        cc.call_date::text AS day,
        COUNT(DISTINCT o.po_number)::text AS order_count
      FROM connected_calls cc
      JOIN buyer_orders o ON o.phone = cc.phone AND o.order_date = cc.call_date
      GROUP BY cc.agent_name, cc.call_date
      `,
      params,
    );

    const cells = rows.map((r) => ({
      agentName: r.agent_name,
      day: r.day,
      orderCount: Number(r.order_count || 0),
    }));

    return NextResponse.json({ cells });
  } catch (err) {
    console.error('agent-orders-daily error', err);
    return NextResponse.json({ error: 'Failed to load daily agent orders' }, { status: 500 });
  }
}
