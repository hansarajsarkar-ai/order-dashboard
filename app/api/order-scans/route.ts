import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ScanRow {
  location: string | null;
  date: string | null;
  status: string | null;
  activity: string | null;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  if (!poNumber) {
    return NextResponse.json({ error: 'poNumber required' }, { status: 400 });
  }

  try {
    const sql = `
      WITH latest_delivery AS (
        SELECT di."latestLogDetails" AS "latestLogDetails"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "deliveries"."intercityDelivery" di
               ON di."purchaseOrderId" = po."id"
              AND di."isTest" = FALSE
        WHERE po."poNumber"::text = $1
        ORDER BY di."created_at" DESC
        LIMIT 1
      )
      SELECT
        scan->>'location'  AS "location",
        scan->>'date'      AS "date",
        scan->>'status'    AS "status",
        scan->>'activity'  AS "activity"
      FROM latest_delivery ld
      CROSS JOIN LATERAL jsonb_array_elements(ld."latestLogDetails"->'scans') AS scan
      WHERE jsonb_typeof(ld."latestLogDetails") = 'object'
        AND jsonb_typeof(ld."latestLogDetails"->'scans') = 'array'
        AND scan->>'date' IS NOT NULL
      ORDER BY (scan->>'date')::timestamptz DESC
      LIMIT 3;
    `;

    const scans = await query<ScanRow>(sql, [poNumber]);

    return NextResponse.json({ data: scans });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Batch variant: POST { poNumbers: string[] } -> { data: { [poNumber]: ScanRow[] } }
// Returns up to 3 most-recent scans per PO, so the drill table can render them
// inline as columns without firing one request per row.
async function _POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const poNumbers: string[] = Array.isArray(body?.poNumbers)
      ? body.poNumbers.map((p: unknown) => String(p)).filter(Boolean)
      : [];
    if (poNumbers.length === 0) return NextResponse.json({ data: {} });

    const sql = `
      WITH latest_delivery AS (
        SELECT DISTINCT ON (po."poNumber")
               po."poNumber"::text AS pon,
               di."latestLogDetails" AS l
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "deliveries"."intercityDelivery" di
               ON di."purchaseOrderId" = po."id"
              AND di."isTest" = FALSE
        WHERE po."poNumber"::text = ANY($1::text[])
        ORDER BY po."poNumber", di."created_at" DESC
      ),
      ranked AS (
        SELECT ld.pon,
               scan->>'location' AS "location",
               scan->>'date'     AS "date",
               scan->>'status'   AS "status",
               scan->>'activity' AS "activity",
               ROW_NUMBER() OVER (
                 PARTITION BY ld.pon
                 ORDER BY (scan->>'date')::timestamptz DESC
               ) AS rn
        FROM latest_delivery ld
        CROSS JOIN LATERAL jsonb_array_elements(ld.l->'scans') AS scan
        WHERE jsonb_typeof(ld.l) = 'object'
          AND jsonb_typeof(ld.l->'scans') = 'array'
          AND scan->>'date' IS NOT NULL
      )
      SELECT pon, "location", "date", "status", "activity"
      FROM ranked
      WHERE rn <= 3
      ORDER BY pon, rn;
    `;

    const rows = await query<ScanRow & { pon: string }>(sql, [poNumbers]);
    const data: Record<string, ScanRow[]> = {};
    for (const r of rows) {
      (data[r.pon] ||= []).push({ location: r.location, date: r.date, status: r.status, activity: r.activity });
    }
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
export const POST = withQueryCapture(_POST);
