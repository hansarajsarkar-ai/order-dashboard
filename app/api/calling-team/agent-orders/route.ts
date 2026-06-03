import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere } from '../_filters';

export const dynamic = 'force-dynamic';

// Agent-wise order summary: per agent on the Warm/Cold lead campaigns, calls
// initiated (outbound) vs connected vs buyers who placed a same-day qualified
// D2R intercity order (order placement = markedPendingTime).
export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  // Index-friendly IST timestamp bounds for the order side. Passing these as
  // explicit timestamptz params lets Postgres range-scan the markedPendingTime
  // index instead of full-scanning purchaseOrder (an AT TIME ZONE expression on
  // the column would defeat the index).
  const startTs = `${f.startDate}T00:00:00+05:30`;
  const endExclusive = new Date(`${f.endDate}T00:00:00+05:30`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const pStart = params.push(startTs);
  const pEnd = params.push(endExclusive.toISOString());

  try {
    const rows = await query<{
      agent_name: string;
      total_calls: string;
      unique_buyer_attempt: string;
      connected: string;
      connected_unique_buyer: string;
      order_placed_buyer: string;
      avg_halting_call: string | null;
      ge15: string;
      lt15: string;
      total_talk_time: string | null;
    }>(
      `
      WITH base AS MATERIALIZED (
        SELECT
          agent_name,
          CASE WHEN call_to_number LIKE '%-%'
            THEN RIGHT(REGEXP_REPLACE(SPLIT_PART(call_to_number, '-', 1), '[^0-9]', '', 'g'), 10)
            ELSE RIGHT(REGEXP_REPLACE(call_to_number, '[^0-9]', '', 'g'), 10) END AS phone,
          start_date::date AS call_date,
          (call_status = 'Answer') AS connected,
          COALESCE(NULLIF(duration,'')::int, 0) AS dur
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND (LOWER(direction) = 'outbound' OR direction = 'Manual')
          AND campaign_name IN ('Warm_Lead', 'Cold Lead Campaign')
          AND agent_name IS NOT NULL AND agent_name <> ''
          AND call_to_number IS NOT NULL AND call_to_number <> ''
      ),
      agg AS (
        SELECT
          agent_name,
          COUNT(*) AS total_calls,
          COUNT(DISTINCT phone) AS unique_buyer_attempt,
          COUNT(*) FILTER (WHERE connected) AS connected,
          COUNT(DISTINCT phone) FILTER (WHERE connected) AS connected_unique_buyer,
          AVG(dur) FILTER (WHERE connected AND dur > 0) AS avg_halting_call,
          COUNT(*) FILTER (WHERE connected AND dur >= 15) AS ge15,
          COUNT(*) FILTER (WHERE connected AND dur < 15) AS lt15,
          SUM(dur) AS total_talk_time
        FROM base GROUP BY agent_name
      ),
      connected_calls AS MATERIALIZED (
        SELECT DISTINCT agent_name, phone, call_date FROM base WHERE connected
      ),
      buyer_orders AS MATERIALIZED (
        -- Qualified D2R intercity (third-party) orders, placement = markedPendingTime.
        -- Index-friendly markedPendingTime bounds derived from the IST call window;
        -- order date resolved in IST.
        SELECT
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
      order_placed AS (
        SELECT cc.agent_name, COUNT(DISTINCT cc.phone) AS order_placed_buyer
        FROM connected_calls cc
        JOIN buyer_orders o ON o.phone = cc.phone AND o.order_date = cc.call_date
        GROUP BY cc.agent_name
      )
      SELECT
        a.agent_name,
        a.total_calls::text                       AS total_calls,
        a.unique_buyer_attempt::text              AS unique_buyer_attempt,
        a.connected::text                         AS connected,
        a.connected_unique_buyer::text            AS connected_unique_buyer,
        COALESCE(op.order_placed_buyer, 0)::text  AS order_placed_buyer,
        a.avg_halting_call::text                  AS avg_halting_call,
        a.ge15::text                              AS ge15,
        a.lt15::text                              AS lt15,
        a.total_talk_time::text                   AS total_talk_time
      FROM agg a
      LEFT JOIN order_placed op ON op.agent_name = a.agent_name
      WHERE a.total_calls >= 5
      ORDER BY a.total_calls DESC
      LIMIT 100
      `,
      params,
    );

    const agents = rows.map((r) => {
      const totalCalls = Number(r.total_calls || 0);
      const connected = Number(r.connected || 0);
      const connectedUniqueBuyer = Number(r.connected_unique_buyer || 0);
      const orderPlacedBuyer = Number(r.order_placed_buyer || 0);
      return {
        agentName: r.agent_name,
        totalCalls,
        uniqueBuyerAttempt: Number(r.unique_buyer_attempt || 0),
        connected,
        connectedRate: totalCalls ? connected / totalCalls : 0,
        connectedUniqueBuyer,
        orderPlacedBuyer,
        orderConvRate: connectedUniqueBuyer ? orderPlacedBuyer / connectedUniqueBuyer : 0,
        // Avg connected-call duration in minutes; total talk time in hours.
        avgHaltingMins: Number(r.avg_halting_call || 0) / 60,
        connectedGte15: Number(r.ge15 || 0),
        connectedLt15: Number(r.lt15 || 0),
        totalTalkHours: Number(r.total_talk_time || 0) / 3600,
      };
    });

    return NextResponse.json({ agents });
  } catch (err) {
    console.error('agent-orders error', err);
    return NextResponse.json({ error: 'Failed to load agent orders' }, { status: 500 });
  }
}
