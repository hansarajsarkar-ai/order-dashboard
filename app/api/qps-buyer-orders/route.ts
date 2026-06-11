import { NextRequest, NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  po_number: string;
  marked_pending_time: string;
  status: string;
  amount: string;
  seller_name: string;
  seller_phone: string;
  awb_number: string;
  courier_name: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const buyerId = searchParams.get('buyerId');
  const month   = searchParams.get('month'); // '2026-06-01'

  if (!buyerId || !month) {
    return NextResponse.json({ error: 'buyerId and month required' }, { status: 400 });
  }

  try {
    const rows = await query<Row>(`
      SELECT
        po."poNumber"::text                     AS po_number,
        po."markedPendingTime"                  AS marked_pending_time,
        po."status"                             AS status,
        ROUND(po."amount"::numeric, 2)          AS amount,
        s."businessName"                        AS seller_name,
        s."phone"                               AS seller_phone,
        COALESCE(po."awbNumber", '')            AS awb_number,
        COALESCE(po."courierName", '')          AS courier_name
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."buyerId"           = $1
        AND po."isTest"            = FALSE
        AND po."deliveryType"      = 'INTERCITY'
        AND po."deliveryNetwork"   = 'THIRD_PARTY'
        AND po."status"           != 'DRAFT'
        AND po."markedPendingTime" >= $2::date
        AND po."markedPendingTime" <  ($2::date + INTERVAL '1 month')
        AND s."id" != $3
      ORDER BY po."markedPendingTime" DESC
    `, [buyerId, month, EXCLUDED_SELLER]);

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
