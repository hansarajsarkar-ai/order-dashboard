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
          start_stamp::timestamp AS call_ts,
          (call_status = 'Answer') AS connected,
          COALESCE(NULLIF(duration,'')::int, 0) AS dur
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND (LOWER(direction) = 'outbound' OR direction = 'Manual')
          AND campaign_name IN ('Warm_Lead', 'Cold Lead Campaign')
          AND agent_name IS NOT NULL AND agent_name <> ''
          AND call_to_number IS NOT NULL AND call_to_number <> ''
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
      ),
      assigned AS (
        -- Last-touch: each order to the agent of the most recent answered call
        -- to that buyer that day (tiebreak: longest call, then agent name).
        SELECT po_number, agent_name, day FROM (
          SELECT o.po_number, b.agent_name, o.order_date AS day,
            ROW_NUMBER() OVER (
              PARTITION BY o.po_number
              ORDER BY b.call_ts DESC, b.dur DESC, b.agent_name
            ) AS rn
          FROM ct b
          JOIN buyer_orders o ON o.phone = b.phone AND o.order_date = b.call_date
          WHERE b.connected
        ) x WHERE rn = 1
      )
      SELECT
        agent_name,
        day::text AS day,
        COUNT(DISTINCT po_number)::text AS order_count
      FROM assigned
      GROUP BY agent_name, day
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
