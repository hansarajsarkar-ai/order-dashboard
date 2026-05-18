import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  po_number: string;
  amount: string;
  delivery_status: string | null;
  marked_pending_time: string | null;
  marked_rejected_time: string | null;
  seller_phone: string | null;
  seller_business_name: string | null;
  seller_address_line1: string | null;
  seller_city: string | null;
  seller_state: string | null;
  buyer_phone: string | null;
  buyer_business_name: string | null;
  buyer_address_line1: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  reject_reason: string | null;
  rejected_by: string | null;
  reason_added_by_badho_team: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const limit = Math.min(parseInt(searchParams.get('limit') || '5000'), 10000);

  try {
    const sql = `
      SELECT
        po."poNumber"::text          AS po_number,
        po."amount"::text            AS amount,
        po."deliveryStatus"          AS delivery_status,
        po."markedPendingTime"       AS marked_pending_time,
        po."markedRejectedTime"      AS marked_rejected_time,
        s."phone"                    AS seller_phone,
        s."businessName"             AS seller_business_name,
        s."addressLine1"             AS seller_address_line1,
        s."city"                     AS seller_city,
        s."state"                    AS seller_state,
        b."phone"                    AS buyer_phone,
        b."businessName"             AS buyer_business_name,
        b."addressLine1"             AS buyer_address_line1,
        b."city"                     AS buyer_city,
        b."state"                    AS buyer_state,
        po."rejectReason"            AS reject_reason,
        po."rejectedBy"              AS rejected_by,
        po."reasonAddedByBadhoTeam"  AS reason_added_by_badho_team
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."status"          = 'REJECTED'
        AND po."deliveryStatus"  ILIKE '%RTO%'
        AND po."markedRejectedTime" IS NOT NULL
        AND EXTRACT(YEAR FROM po."markedRejectedTime") = $1
        AND po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."businessName" NOT ILIKE '%milko%'
        AND s."isD2RBrandSeller" = TRUE
      ORDER BY po."markedRejectedTime" DESC
      LIMIT $2;
    `;

    const rows = await query<Row>(sql, [year, limit]);

    const data = rows.map((r) => ({
      poNumber: r.po_number,
      amount: parseFloat(r.amount),
      deliveryStatus: r.delivery_status,
      markedPendingTime: r.marked_pending_time,
      markedRejectedTime: r.marked_rejected_time,
      sellerPhone: r.seller_phone,
      sellerBusinessName: r.seller_business_name,
      sellerAddress: [r.seller_address_line1, r.seller_city, r.seller_state].filter(Boolean).join(', '),
      sellerState: r.seller_state,
      buyerPhone: r.buyer_phone,
      buyerBusinessName: r.buyer_business_name,
      buyerAddress: [r.buyer_address_line1, r.buyer_city, r.buyer_state].filter(Boolean).join(', '),
      buyerState: r.buyer_state,
      rejectReason: r.reject_reason,
      rejectedBy: r.rejected_by,
      reasonAddedByBadhoTeam: r.reason_added_by_badho_team,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
