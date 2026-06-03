import { NextResponse, NextRequest } from 'next/server';
import { queryNoNestloop } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

// Connected calls behind an agent's "Connected" count in the Agent table.
// Same scope as the rest of the calling dashboard (outbound · Warm/Cold ·
// answered), each call joined to the buyer it reached (by normalized phone)
// for name / business / city / address, plus the recording URL.
interface Row {
  callId: string | null;
  callTs: string | null;
  phone: string | null;
  durationSec: number | null;
  subDisposition: string | null;
  recordingUrl: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  addressLine1: string | null;
  landmark: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentName = searchParams.get('agentName');
  if (!agentName) {
    return NextResponse.json({ error: 'agentName is required' }, { status: 400 });
  }

  // Reuse the shared call filters (date range + global filters), forced to this agent.
  const f = parseFilters(req);
  f.agent = agentName;
  const { sql: where, params } = buildWhere(f);

  try {
    const rows = await queryNoNestloop<Row>(
      `
      WITH calls AS MATERIALIZED (
        SELECT
          call_id,
          start_stamp,
          call_to_number,
          COALESCE(NULLIF(duration,'')::int, 0) AS dur,
          sub_disposition,
          recording_url,
          CASE WHEN call_to_number LIKE '%-%'
            THEN RIGHT(REGEXP_REPLACE(SPLIT_PART(call_to_number, '-', 1), '[^0-9]', '', 'g'), 10)
            ELSE RIGHT(REGEXP_REPLACE(call_to_number, '[^0-9]', '', 'g'), 10) END AS phone10
        FROM "smartFlo"."call_logs"
        WHERE ${where}
          AND agent_name IS NOT NULL AND agent_name <> ''
          AND ${CONNECTED_EXPR}
      ),
      buyers AS MATERIALIZED (
        SELECT phone10, "name", "businessName", "city", "district", "state", "pincode", "addressLine1", "landmark"
        FROM (
          SELECT
            RIGHT(REGEXP_REPLACE(b2."phone", '[^0-9]', '', 'g'), 10) AS phone10,
            b2."name", b2."businessName", b2."city", b2."district", b2."state",
            b2."pincode", b2."addressLine1", b2."landmark",
            ROW_NUMBER() OVER (
              PARTITION BY RIGHT(REGEXP_REPLACE(b2."phone", '[^0-9]', '', 'g'), 10)
              ORDER BY b2."businessName" NULLS LAST
            ) AS rn
          FROM "users"."buyer" b2
          WHERE b2."isTest" = FALSE
            AND RIGHT(REGEXP_REPLACE(b2."phone", '[^0-9]', '', 'g'), 10) IN (SELECT DISTINCT phone10 FROM calls)
        ) x WHERE rn = 1
      )
      SELECT
        c.call_id AS "callId",
        c.start_stamp AS "callTs",
        c.call_to_number AS "phone",
        c.dur AS "durationSec",
        c.sub_disposition AS "subDisposition",
        c.recording_url AS "recordingUrl",
        b."name" AS "buyerName",
        b."businessName" AS "buyerBusinessName",
        b."city" AS "city",
        b."district" AS "district",
        b."state" AS "state",
        b."pincode" AS "pincode",
        b."addressLine1" AS "addressLine1",
        b."landmark" AS "landmark"
      FROM calls c
      LEFT JOIN buyers b ON b.phone10 = c.phone10
      ORDER BY c.start_stamp DESC
      LIMIT 5000;
      `,
      params,
    );

    const data = rows.map((r) => ({
      ...r,
      address: [r.addressLine1, r.landmark, r.pincode, r.city, r.district, r.state]
        .filter((v) => v != null && String(v).trim() !== '').join(', '),
    }));

    return NextResponse.json({ data, count: data.length, agentName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    console.error('agent-connected-calls error', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
