import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR, MEANINGFUL_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  // The call-metrics query uses only the buildWhere params; the conversion query
  // additionally needs index-friendly IST timestamp bounds for the order side (an
  // AT TIME ZONE expression on created_at would defeat the index). Keep separate
  // param arrays so neither query is bound with parameters it doesn't reference.
  const callParams = params;
  const startTs = `${f.startDate}T00:00:00+05:30`;
  const endExclusive = new Date(`${f.endDate}T00:00:00+05:30`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const convParams = [...params];
  const pStart = convParams.push(startTs);
  const pEnd = convParams.push(endExclusive.toISOString());

  try {
    // Two queries share the same filtered call window (`where` / `params`).
    // buildWhere always pushes startDate as $1 and endDate as $2, so the
    // conversion query reuses $1/$2 to bound the order side to the same range.
    const [rows, convRows] = await Promise.all([
      query<{
        agent_name: string;
        total_calls: string;
        connected_calls: string;
        meaningful_calls: string;
        missed: string;
        avg_duration: string | null;
        total_talk_time: string | null;
        unique_customers: string;
      }>(
        `
        SELECT
          agent_name,
          COUNT(*)::text AS total_calls,
          SUM(${CONNECTED_EXPR}::int)::text AS connected_calls,
          SUM(${MEANINGFUL_EXPR}::int)::text AS meaningful_calls,
          SUM((call_status = 'Missed')::int)::text AS missed,
          AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration,
          SUM(${DURATION_EXPR})::text AS total_talk_time,
          COUNT(DISTINCT call_to_number) FILTER (WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_customers
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND agent_name IS NOT NULL AND agent_name <> ''
        GROUP BY agent_name
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC
        LIMIT 100
        `,
        callParams,
      ),
      // Same-day order conversion: of the unique customers an agent called,
      // how many placed an order on the same calendar day (IST) as the call,
      // how many of those orders landed in the 10AM–7PM window, and the total
      // order count / GMV those same-day orders generated.
      query<{
        agent_name: string;
        users_called: string;
        same_day_users: string;
        timeslot_users: string;
        order_count: string;
        gmv: string | null;
      }>(
        `
        WITH called AS MATERIALIZED (
          SELECT DISTINCT
            agent_name,
            CASE WHEN call_to_number LIKE '%-%'
              THEN RIGHT(REGEXP_REPLACE(SPLIT_PART(call_to_number, '-', 1), '[^0-9]', '', 'g'), 10)
              ELSE RIGHT(REGEXP_REPLACE(call_to_number, '[^0-9]', '', 'g'), 10) END AS phone,
            start_date::date AS call_date
          FROM "smartFlo"."call_logs"
          WHERE ${where}
            AND agent_name IS NOT NULL AND agent_name <> ''
            AND call_to_number IS NOT NULL AND call_to_number <> ''
        ),
        called_counts AS (
          SELECT agent_name, COUNT(DISTINCT phone) AS users_called
          FROM called GROUP BY agent_name
        ),
        buyer_orders AS MATERIALIZED (
          -- Qualified D2R intercity (third-party) orders only — the universe the
          -- calling team drives. order_date/hour resolved in IST. created_at is the
          -- placement timestamp (markedPendingTime is null for COMPLETED/CANCELLED).
          SELECT
            RIGHT(REGEXP_REPLACE(b."phone", '[^0-9]', '', 'g'), 10) AS phone,
            po."id" AS order_id,
            (po."created_at" AT TIME ZONE 'Asia/Kolkata')::date AS order_date,
            EXTRACT(HOUR FROM (po."created_at" AT TIME ZONE 'Asia/Kolkata')) AS order_hour,
            (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) AS amount
          FROM "purchaseOrder"."purchaseOrder" po
          JOIN "users"."seller" s ON s."id" = po."sellerId"
          JOIN "users"."buyer" b ON b."id" = po."buyerId"
          WHERE po."status" != 'DRAFT'
            AND s."isD2RBrandSeller" = TRUE
            AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
            AND s."isTest" = FALSE AND s."businessName" NOT ILIKE '%test%'
            AND po."isTest" = FALSE AND po."isFalseOrder" = FALSE
            AND po."deliveryNetwork" = 'THIRD_PARTY' AND po."deliveryType" = 'INTERCITY'
            AND po."created_at" >= $${pStart}::timestamptz
            AND po."created_at" <  $${pEnd}::timestamptz
        ),
        matched AS (
          SELECT c.agent_name, c.phone, o.order_id, o.order_hour, o.amount
          FROM called c
          JOIN buyer_orders o ON o.phone = c.phone AND o.order_date = c.call_date
        ),
        conv AS (
          SELECT
            agent_name,
            COUNT(DISTINCT phone) AS same_day_users,
            COUNT(DISTINCT CASE WHEN order_hour BETWEEN 10 AND 18 THEN phone END) AS timeslot_users,
            COUNT(DISTINCT order_id) AS order_count,
            SUM(amount) AS gmv
          FROM matched GROUP BY agent_name
        )
        SELECT
          cc.agent_name,
          cc.users_called::text                       AS users_called,
          COALESCE(cv.same_day_users, 0)::text         AS same_day_users,
          COALESCE(cv.timeslot_users, 0)::text         AS timeslot_users,
          COALESCE(cv.order_count, 0)::text            AS order_count,
          COALESCE(cv.gmv, 0)::text                    AS gmv
        FROM called_counts cc
        LEFT JOIN conv cv ON cv.agent_name = cc.agent_name
        `,
        convParams,
      ),
    ]);

    const convByAgent = new Map(convRows.map((c) => [c.agent_name, c]));

    const agents = rows.map((r) => {
      const total = Number(r.total_calls || 0);
      const connected = Number(r.connected_calls || 0);
      const meaningful = Number(r.meaningful_calls || 0);
      const cv = convByAgent.get(r.agent_name);
      const usersCalled = Number(cv?.users_called || 0);
      const sameDayUsers = Number(cv?.same_day_users || 0);
      const timeslotUsers = Number(cv?.timeslot_users || 0);
      return {
        agentName: r.agent_name,
        totalCalls: total,
        connectedCalls: connected,
        meaningfulCalls: meaningful,
        missedCalls: Number(r.missed || 0),
        avgDuration: Math.round(Number(r.avg_duration || 0)),
        totalTalkTime: Number(r.total_talk_time || 0),
        uniqueCustomers: Number(r.unique_customers || 0),
        connectionRate: total ? connected / total : 0,
        meaningfulRate: total ? meaningful / total : 0,
        // Same-day order conversion (attributes orders placed on the call day).
        usersCalled,
        sameDayUsers,
        sameDayRate: usersCalled ? sameDayUsers / usersCalled : 0,
        timeslotUsers,
        timeslotRate: usersCalled ? timeslotUsers / usersCalled : 0,
        orderCount: Number(cv?.order_count || 0),
        gmv: Number(cv?.gmv || 0),
      };
    });

    return NextResponse.json({ agents });
  } catch (err) {
    console.error('agents error', err);
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
}
