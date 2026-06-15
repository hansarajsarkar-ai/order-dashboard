import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * smartFlo phone-call enrichment for the Order Journey, split into its own
 * endpoint so the (occasionally slow) call_logs match never blocks the main
 * journey render. The page loads the journey first, then fetches these calls
 * and merges them into the timeline/calendar.
 *
 * NOTE: the `caller_id_number` arm seq-scans call_logs (~700K rows) because
 * only RIGHT(call_to_number,10) is indexed. Add the mirror index to make this
 * instant:
 *   CREATE INDEX CONCURRENTLY idx_call_logs_caller_last10
 *     ON "smartFlo".call_logs USING btree ("right"(caller_id_number, 10));
 */

const num = (v: string | null | undefined): number | null =>
  v != null && v !== '' ? parseFloat(v) : null;

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  // Match RIGHT(call_to_number,10) directly (NOT wrapped in regexp_replace) so
  // the idx_call_logs_phone_last10 index is used. Window = [placed, completed/
  // delivered + 3d]; start_stamp is text IST and lexicographically sortable.
  const sql = `
    WITH po AS (
      SELECT
        to_char(p."markedPendingTime" AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS t0,
        to_char((COALESCE(p."markedCompletedTime", p."markedDeliveredTime", NOW()) + INTERVAL '3 days')
                AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS t1,
        RIGHT(regexp_replace(b."phone",'[^0-9]','','g'),10) AS bp,
        RIGHT(regexp_replace(s."phone",'[^0-9]','','g'),10) AS sp
      FROM "purchaseOrder"."purchaseOrder" p
      JOIN "users"."buyer"  b ON b."id" = p."buyerId"
      JOIN "users"."seller" s ON s."id" = p."sellerId"
      WHERE p."poNumber" = $1::int
    )
    , matched AS (
      SELECT cl."direction", cl."call_status", cl."duration", cl."start_stamp",
             cl."recording_url", cl."agent_name", cl."call_to_number", cl."caller_id_number"
      FROM "smartFlo".call_logs cl, po
      WHERE po.t0 IS NOT NULL
        AND cl."start_stamp" >= po.t0 AND cl."start_stamp" <= po.t1
        AND RIGHT(cl."call_to_number",10) IN (po.bp, po.sp)
      UNION
      SELECT cl."direction", cl."call_status", cl."duration", cl."start_stamp",
             cl."recording_url", cl."agent_name", cl."call_to_number", cl."caller_id_number"
      FROM "smartFlo".call_logs cl, po
      WHERE po.t0 IS NOT NULL
        AND cl."start_stamp" >= po.t0 AND cl."start_stamp" <= po.t1
        AND RIGHT(cl."caller_id_number",10) IN (po.bp, po.sp)
    )
    SELECT m."direction", m."call_status" AS "callStatus", m."duration",
           m."start_stamp" AS "startStamp", m."recording_url" AS "recordingUrl",
           m."agent_name" AS "agentName",
           CASE
             WHEN RIGHT(m."call_to_number",10) = po.bp
               OR RIGHT(m."caller_id_number",10) = po.bp THEN 'BUYER'
             WHEN RIGHT(m."call_to_number",10) = po.sp
               OR RIGHT(m."caller_id_number",10) = po.sp THEN 'SELLER'
           END AS "party"
    FROM matched m, po
    ORDER BY m."start_stamp" ASC
    LIMIT 60;
  `;

  try {
    const rows = await query<Record<string, string | null>>(sql, [poNumber]);
    const phoneCalls = rows.map((r) => ({
      direction: r.direction,
      callStatus: r.callStatus,
      duration: num(r.duration),
      startStamp: r.startStamp,
      recordingUrl: r.recordingUrl,
      agentName: r.agentName,
      party: r.party,
    }));
    return NextResponse.json({ phoneCalls });
  } catch {
    // best-effort enrichment — never error the section
    return NextResponse.json({ phoneCalls: [] });
  }
}

export const GET = withQueryCapture(_GET);
