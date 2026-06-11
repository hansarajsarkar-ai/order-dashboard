import { NextRequest, NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  po_number: string;
  order_datetime: string;
  itl_datetime: string;
  status: string;
  amount: string;
  coupon_value: string;
  payment_mode: string | null;
  seller_name: string;
  seller_phone: string;
  shipment_status: string;
  awb_number: string;
  courier_name: string;
  cod_collect: string;
}

async function _GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const buyerId = searchParams.get('buyerId');
  const month   = searchParams.get('month'); // '2026-06-01'

  if (!buyerId || !month) {
    return NextResponse.json({ error: 'buyerId and month required' }, { status: 400 });
  }

  try {
    // Per-order detail for a buyer in a month. AWB / courier / shipment status
    // come from the latest intercity delivery (its trackingInfo JSON), not the
    // purchase order. Mirrors the canonical order-details query.
    const rows = await query<Row>(`
      SELECT
        po."poNumber"::text                                       AS po_number,
        TO_CHAR(po."markedPendingTime", 'DD Mon YYYY HH12:MI AM')  AS order_datetime,
        TO_CHAR(di."created_at", 'DD Mon YYYY HH12:MI AM')         AS itl_datetime,
        po."status"                                               AS status,
        ROUND(po."amount"::numeric, 2)                            AS amount,
        COALESCE(po."appliedOfferDiscount", 0)                    AS coupon_value,
        po."paymentInfo"->>'option'                               AS payment_mode,
        s."businessName"                                          AS seller_name,
        s."phone"                                                 AS seller_phone,
        di."status"                                               AS shipment_status,
        di."trackingInfo"->>'awbNumber'                           AS awb_number,
        di."trackingInfo"->>'courierName'                         AS courier_name,
        COALESCE(di."codAmountToBeCollected", 0)                  AS cod_collect
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "deliveries"."intercityDelivery" di
        ON po."id" = di."purchaseOrderId"
      JOIN LATERAL (
        SELECT d."id"
        FROM "deliveries"."intercityDelivery" d
        WHERE d."purchaseOrderId" = po."id"
          AND d."isTest" = FALSE
        ORDER BY d."created_at" DESC
        LIMIT 1
      ) di_latest ON TRUE
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest"        = FALSE
        AND po."isFalseOrder"  = FALSE
        AND b."isTest"         = FALSE
        AND b."businessName"   NOT ILIKE '%test%'
        AND s."isTest"         = FALSE
        AND s."businessName"   NOT ILIKE '%test%'
        AND di."isTest"        = FALSE
        AND di."id"            = di_latest."id"
        AND po."buyerId"       = $1
        AND po."markedPendingTime" >= $2::date
        AND po."markedPendingTime" <  ($2::date + INTERVAL '1 month')
      ORDER BY po."markedPendingTime" DESC
    `, [buyerId, month]);

    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
