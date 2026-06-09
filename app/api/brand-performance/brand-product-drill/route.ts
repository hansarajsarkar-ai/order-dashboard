import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Order-level drill-down for a brand or a specific brand-SKU on the
// Brand × Product tab. Hits when a user clicks a metric (Orders / ₹ Value /
// Buyers / Qty sold) on either a brand row or its expanded SKU row.

interface Row {
  po_id: string;
  po_number: string;
  marked_pending_time: string;
  status: string;
  amount: string;
  applied_wallet_amount: string | null;
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
  const brand     = searchParams.get('brand');         // brand prefix to filter the page
  const drillBrand = searchParams.get('drillBrand');   // brand whose row was clicked (label)
  const drillSku  = searchParams.get('drillSku');      // optional sku id
  const monthStr  = searchParams.get('month');         // optional 1-12, narrows to a single month
  const limit     = Math.min(Math.max(parseInt(searchParams.get('limit') || '300'), 1), 1000);

  if (!drillBrand) {
    return NextResponse.json({ error: 'drillBrand is required' }, { status: 400 });
  }

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

    let monthFilter = '';
    if (monthStr) {
      const m = parseInt(monthStr);
      if (!Number.isNaN(m) && m >= 1 && m <= 12) {
        params.push(m);
        monthFilter = ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
      }
    }

    // Filter orders to those that have ≥1 item of the target brand (or specific SKU).
    // We match the brand via brand.label (case-insensitive) since the seller's
    // businessName prefix can be in a different casing than the brand label.
    let drillFilter = '';
    if (drillSku) {
      params.push(drillSku);
      const i = params.length;
      drillFilter = ` AND EXISTS (
        SELECT 1
        FROM "purchaseOrder"."purchaseOrderItem" pi
        WHERE pi."purchaseOrderId" = po."id"
          AND pi."brandSKUId"::text = $${i}
          AND pi."status" != 'DRAFT'
          AND pi."comboBrandSKUPOItemId" IS NULL
      )`;
    } else {
      params.push(drillBrand);
      const i = params.length;
      drillFilter = ` AND EXISTS (
        SELECT 1
        FROM "purchaseOrder"."purchaseOrderItem" pi
        JOIN "brands"."brandSKU"   bsx ON bsx."id" = pi."brandSKUId"
        LEFT JOIN "brands"."brand" bra ON bra."id" = bsx."brandId"
        WHERE pi."purchaseOrderId" = po."id"
          AND pi."status" != 'DRAFT'
          AND pi."comboBrandSKUPOItemId" IS NULL
          AND (
            LOWER(COALESCE(bra."label", '')) = LOWER($${i})
            OR LOWER(TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1))) = LOWER($${i})
          )
      )`;
    }

    // SUM filter: only count items matching the SKU (if SKU drill) or brand (if brand drill).
    let skuSumFilter = '';
    if (drillSku) {
      skuSumFilter = ` FILTER (WHERE poi."brandSKUId"::text = $${params.length})`;
    } else {
      skuSumFilter = ` FILTER (
        WHERE LOWER(COALESCE(bs."label", '')) <> ''
          AND (
            LOWER(COALESCE(bra2."label", '')) = LOWER($${params.length})
            OR LOWER(TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1))) = LOWER($${params.length})
          )
      )`;
    }

    // Items array: when drilling by SKU, only that SKU; when drilling by brand,
    // only items of that brand (so unrelated SKUs in the same PO aren't listed).
    const itemsAggFilter = drillSku
      ? `FILTER (WHERE poi."brandSKUId"::text = $${params.length})`
      : `FILTER (WHERE LOWER(COALESCE(bra2."label", '')) = LOWER($${params.length})
                   OR LOWER(TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1))) = LOWER($${params.length}))`;

    const sql = `
      SELECT
        po."id"::text                                       AS po_id,
        po."poNumber"::text                                 AS po_number,
        po."markedPendingTime"                              AS marked_pending_time,
        po."status"                                         AS status,
        (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0))::text                                   AS amount,
        po."appliedWalletAmount"::text                      AS applied_wallet_amount,
        bu."businessName"                                   AS buyer_business,
        bu."phone"                                          AS buyer_phone,
        bu."state"                                          AS buyer_state,
        bu."city"                                           AS buyer_city,
        s."businessName"                                    AS seller_business,
        s."phone"                                           AS seller_phone,
        COALESCE(SUM(poi."quantity")${skuSumFilter}, 0)::text  AS qty,
        COALESCE(SUM(poi."amount")${skuSumFilter}, 0)::text    AS item_amount,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'label',     bs."label",
            'qty',       poi."quantity"::text,
            'unitPrice', poi."unitPrice"::text,
            'amount',    poi."amount"::text
          )
          ORDER BY poi."amount" DESC NULLS LAST
        ) ${itemsAggFilter}                                 AS items
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "purchaseOrder"."purchaseOrderItem" poi ON poi."purchaseOrderId" = po."id"
      JOIN "brands"."brandSKU"                 bs   ON bs."id"  = poi."brandSKUId"
      LEFT JOIN "brands"."brand"               bra2 ON bra2."id" = bs."brandId"
      JOIN "users"."buyer"  bu ON bu."id" = po."buyerId"
      JOIN "users"."seller" s  ON s."id" = po."sellerId"
      WHERE po."isTest"          = FALSE
        AND po."isFalseOrder"    = FALSE
        AND bu."isTest"          = FALSE
        AND bu."businessName" NOT ILIKE '%test%'
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status"          IN ('DELIVERED', 'COMPLETED')
        AND poi."status"         != 'DRAFT'
        AND poi."comboBrandSKUPOItemId" IS NULL
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${brandFilter}
        ${monthFilter}
        ${drillFilter}
      GROUP BY po."id", po."poNumber", po."markedPendingTime", po."status", (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0)), po."appliedWalletAmount",
               bu."businessName", bu."phone", bu."state", bu."city", s."businessName", s."phone"
      ORDER BY po."markedPendingTime" DESC
      LIMIT ${limit};
    `;
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poId: r.po_id,
      poNumber: r.po_number,
      pendingAt: r.marked_pending_time,
      status: r.status,
      orderAmount: parseFloat(r.amount),
      appliedWalletAmount: r.applied_wallet_amount != null ? parseFloat(r.applied_wallet_amount) : 0,
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
      buyers: new Set(data.map((d) => d.buyerBusiness ?? '').filter(Boolean)).size,
    };

    return NextResponse.json({
      data,
      summary,
      drillBrand,
      drillSku: drillSku || null,
      limit,
      truncated: data.length >= limit,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
