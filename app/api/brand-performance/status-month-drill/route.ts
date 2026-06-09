import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Order-level drill-down for a single (status × deliveryStatus × month × brand)
// slice on the Monthly Breakdown by Order Status table. Wired to clicks on the
// Orders / ₹ Value / Buyers numbers in the Dashboard tab.

interface Row {
  po_id: string;
  po_number: string;
  marked_pending_time: string;
  status: string;
  delivery_status: string | null;
  amount: string;
  applied_wallet_amount: string | null;
  buyer_id: string | null;
  buyer_business: string | null;
  buyer_phone: string | null;
  buyer_state: string | null;
  buyer_city: string | null;
  seller_business: string | null;
  seller_phone: string | null;
  qty: string | null;
  item_amount: string | null;
  items: Array<{ label: string | null; qty: string; unitPrice: string | null; amount: string }> | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate   = searchParams.get('endDate');
  const brand     = searchParams.get('brand');             // comma-separated seller prefixes (multi-select)
  const status    = searchParams.get('status');            // optional — order status (REJECTED, COMPLETED, …). When omitted, every non-DRAFT status is included (used for footer-total drill).
  const delivery  = searchParams.get('deliveryStatus');   // optional — '__NULL__' for null, otherwise exact match
  const monthStr  = searchParams.get('month');             // optional 1-12
  const limit     = Math.min(Math.max(parseInt(searchParams.get('limit') || '300'), 1), 1000);

  try {
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    let statusFilter = ` AND po."status" != 'DRAFT'`;
    if (status) {
      params.push(status);
      statusFilter = ` AND po."status" = $${params.length}`;
    }

    let deliveryFilter = '';
    if (delivery !== null) {
      if (delivery === '__NULL__' || delivery === '') {
        deliveryFilter = ` AND po."deliveryStatus" IS NULL`;
      } else {
        params.push(delivery);
        deliveryFilter = ` AND po."deliveryStatus" = $${params.length}`;
      }
    }

    let monthFilter = '';
    if (monthStr) {
      const month = parseInt(monthStr);
      if (!Number.isNaN(month) && month >= 1 && month <= 12) {
        params.push(month);
        monthFilter = ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
      }
    }

    const sql = `
      SELECT
        po."id"::text                                       AS po_id,
        po."poNumber"::text                                 AS po_number,
        po."markedPendingTime"                              AS marked_pending_time,
        po."status"                                         AS status,
        po."deliveryStatus"                                 AS delivery_status,
        (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))::text                                   AS amount,
        po."appliedWalletAmount"::text                      AS applied_wallet_amount,
        po."buyerId"::text                                  AS buyer_id,
        bu."businessName"                                   AS buyer_business,
        bu."phone"                                          AS buyer_phone,
        bu."state"                                          AS buyer_state,
        bu."city"                                           AS buyer_city,
        s."businessName"                                    AS seller_business,
        s."phone"                                           AS seller_phone,
        COALESCE(SUM(poi."quantity"), 0)::text              AS qty,
        COALESCE(SUM(poi."amount"), 0)::text                AS item_amount,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'label',     bs."label",
              'qty',       poi."quantity"::text,
              'unitPrice', poi."unitPrice"::text,
              'amount',    poi."amount"::text
            )
            ORDER BY poi."amount" DESC NULLS LAST
          ) FILTER (WHERE poi."id" IS NOT NULL),
          '[]'::jsonb
        )                                                   AS items
      FROM "purchaseOrder"."purchaseOrder" po
      LEFT JOIN "purchaseOrder"."purchaseOrderItem" poi ON poi."purchaseOrderId" = po."id"
      LEFT JOIN "brands"."brandSKU"                 bs  ON bs."id"  = poi."brandSKUId"
      JOIN "users"."buyer"  bu ON bu."id" = po."buyerId"
      JOIN "users"."seller" s  ON s."id"  = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND bu."isTest"          = FALSE
        AND bu."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status"          != 'DRAFT'
        AND (poi."status" IS NULL OR poi."status" != 'DRAFT')
        AND (poi."comboBrandSKUPOItemId" IS NULL)
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${brandFilter}
        ${statusFilter}
        ${deliveryFilter}
        ${monthFilter}
      GROUP BY po."id", po."poNumber", po."markedPendingTime", po."status", po."deliveryStatus",
               (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0)), po."appliedWalletAmount", po."buyerId",
               bu."businessName", bu."phone", bu."state", bu."city",
               s."businessName", s."phone"
      ORDER BY po."markedPendingTime" DESC
      LIMIT ${limit};
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poId: r.po_id,
      poNumber: r.po_number,
      pendingAt: r.marked_pending_time,
      status: r.status,
      deliveryStatus: r.delivery_status,
      orderAmount: parseFloat(r.amount),
      appliedWalletAmount: r.applied_wallet_amount != null ? parseFloat(r.applied_wallet_amount) : 0,
      buyerId: r.buyer_id,
      buyerBusiness: r.buyer_business,
      buyerPhone: r.buyer_phone,
      buyerState: r.buyer_state,
      buyerCity: r.buyer_city,
      sellerBusiness: r.seller_business,
      sellerPhone: r.seller_phone,
      qty: r.qty != null ? parseFloat(r.qty) : 0,
      itemAmount: r.item_amount != null ? parseFloat(r.item_amount) : 0,
      items: (r.items || []).map((it) => ({
        label: it.label,
        qty: it.qty != null ? parseFloat(it.qty) : 0,
        unitPrice: it.unitPrice != null ? parseFloat(it.unitPrice) : null,
        amount: it.amount != null ? parseFloat(it.amount) : 0,
      })),
    }));

    const summary = {
      orders: data.length,
      orderAmount: data.reduce((s, d) => s + d.orderAmount, 0),
      itemAmount: data.reduce((s, d) => s + d.itemAmount, 0),
      qty: data.reduce((s, d) => s + d.qty, 0),
      buyers: new Set(data.map((d) => d.buyerId ?? '').filter(Boolean)).size,
    };

    return NextResponse.json({
      data,
      summary,
      filters: {
        status,
        deliveryStatus: delivery,
        month: monthStr ? parseInt(monthStr) : null,
        brand: brand || null,
      },
      limit,
      truncated: data.length >= limit,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
