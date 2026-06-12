import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Resolve a search term (a PO Number OR a courier AWB) to a poNumber so the
 * journey view can load it. Tries an exact poNumber match first, then the
 * courier waybill fields on intercityDelivery (trackingInfo.awbNumber,
 * latestLogDetails.awb, networkReferenceId — covers Delhivery & Shiprocket).
 */
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ found: false });

  try {
    const sql = `
      SELECT pn, kind FROM (
        SELECT po."poNumber"::text AS pn, 'PO' AS kind, 1 AS pri
        FROM "purchaseOrder"."purchaseOrder" po
        WHERE po."poNumber"::text = $1
        UNION ALL
        SELECT di."poNumber"::text AS pn, 'AWB' AS kind, 2 AS pri
        FROM "deliveries"."intercityDelivery" di
        WHERE di."isTest" = FALSE
          AND ( di."trackingInfo"->>'awbNumber' = $1
             OR di."latestLogDetails"->>'awb' = $1
             OR di."networkReferenceId" = $1 )
      ) x
      WHERE pn IS NOT NULL
      ORDER BY pri ASC
      LIMIT 1;
    `;
    const rows = await query<{ pn: string | null; kind: string }>(sql, [q]);
    if (rows.length === 0 || rows[0].pn == null) {
      return NextResponse.json({ found: false });
    }
    return NextResponse.json({ found: true, poNumber: parseInt(rows[0].pn, 10), matchedBy: rows[0].kind });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
