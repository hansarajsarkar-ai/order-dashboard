import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  po_number: string;
  status: string;
  delivery_status: string | null;
  amount: string;
  marked_pending_time: string | null;
  marked_delivered_time: string | null;
  buyer_phone: string | null;
  buyer_business_name: string | null;
  buyer_state: string | null;
  buyer_city: string | null;
  buyer_address_line1: string | null;
  buyer_landmark: string | null;
  buyer_pincode: string | null;
  buyer_district: string | null;
  seller_phone: string | null;
  seller_business_name: string | null;
  delivery_network: string | null;
  delivery_type: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    const sql = `
      SELECT
        po."poNumber"::text                                          AS po_number,
        po."status"                                                  AS status,
        po."deliveryStatus"                                          AS delivery_status,
        po."amount"::text                                            AS amount,
        TO_CHAR(po."markedPendingTime",   'DD Mon YYYY HH12:MI AM')  AS marked_pending_time,
        TO_CHAR(po."markedDeliveredTime", 'DD Mon YYYY HH12:MI AM')  AS marked_delivered_time,
        b."phone"                                                    AS buyer_phone,
        b."businessName"                                             AS buyer_business_name,
        b."state"                                                    AS buyer_state,
        b."city"                                                     AS buyer_city,
        b."addressLine1"                                             AS buyer_address_line1,
        b."landmark"                                                 AS buyer_landmark,
        b."pincode"                                                  AS buyer_pincode,
        b."district"                                                 AS buyer_district,
        s."phone"                                                    AS seller_phone,
        s."businessName"                                             AS seller_business_name,
        po."deliveryNetwork"                                         AS delivery_network,
        po."deliveryType"                                            AS delivery_type
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
      ORDER BY po."markedPendingTime" DESC;
    `;
    const rows = await query<Row>(sql, [year]);

    const data = rows.map((r) => ({
      poNumber: r.po_number,
      status: r.status,
      deliveryStatus: r.delivery_status,
      amount: parseFloat(r.amount),
      markedPendingTime: r.marked_pending_time,
      markedDeliveredTime: r.marked_delivered_time,
      buyerPhone: r.buyer_phone,
      buyerBusinessName: r.buyer_business_name,
      buyerState: r.buyer_state,
      buyerCity: r.buyer_city,
      buyerFullAddress: [
        r.buyer_address_line1,
        r.buyer_landmark,
        r.buyer_pincode,
        r.buyer_city,
        r.buyer_district,
        r.buyer_state,
      ].filter((v) => v != null && String(v).trim() !== '').join(', '),
      buyerAddressLine1: r.buyer_address_line1,
      buyerLandmark: r.buyer_landmark,
      buyerPincode: r.buyer_pincode,
      buyerDistrict: r.buyer_district,
      sellerPhone: r.seller_phone,
      sellerBusinessName: r.seller_business_name,
      deliveryNetwork: r.delivery_network,
      deliveryType: r.delivery_type,
    }));

    const totals = data.reduce(
      (acc, r) => ({ count: acc.count + 1, amount: acc.amount + r.amount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      data,
      totals,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
