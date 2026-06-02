import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ScanRow {
  location: string | null;
  date: string | null;
  status: string | null;
  activity: string | null;
}

export async function GET(req: NextRequest) {
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
