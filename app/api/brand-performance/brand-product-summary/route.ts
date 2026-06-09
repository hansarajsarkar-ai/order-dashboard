import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand_label: string | null;
  brand_id: string | null;
  sku_id: string;
  sku_label: string | null;
  sku_size: string | null;
  order_count: string;
  amount: string;
  buyer_count: string;
  quantity: string;
}

// Brand × Product summary: top-level rows are brands, each with a nested list
// of SKUs. Both layers are sortable by ?sort=orders|amount|quantity (default
// amount) and ?direction=asc|desc (default desc), so the "most sold" — or
// least sold — product surfaces at the top of each brand group.
//
// Honors the same date range + brand multi-select used elsewhere on the page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');
  const sortParam = searchParams.get('sort');
  const sort: 'orders' | 'amount' | 'quantity' =
    sortParam === 'quantity' ? 'quantity'
    : sortParam === 'orders' ? 'orders'
    : 'amount';
  const direction: 'asc' | 'desc' = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';

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

    // Product GMV is grossed up to match the po-level total used by the other
    // tabs: each order's (platformMarginDiscount + totalDiscount) is allocated
    // across its items in proportion to item amount. We do this per-item in an
    // inner query (window SUM over the order's qualifying items = denominator),
    // then aggregate by brand/product outside.
    const sql = `
      SELECT
        brand_label,
        brand_id,
        sku_id,
        sku_label,
        sku_size,
        COUNT(DISTINCT po_id)                             AS order_count,
        COALESCE(SUM(gross_amount), 0)::text              AS amount,
        COUNT(DISTINCT buyer_id)                          AS buyer_count,
        COALESCE(SUM(item_qty), 0)::text                  AS quantity
      FROM (
        SELECT
          COALESCE(bra."label", '(unbranded)')              AS brand_label,
          bra."id"::text                                    AS brand_id,
          bs."id"::text                                     AS sku_id,
          bs."label"                                        AS sku_label,
          (bs."brandSKUDataJSON" ->> 'size')                AS sku_size,
          po."id"                                           AS po_id,
          po."buyerId"                                      AS buyer_id,
          poi."quantity"::numeric                           AS item_qty,
          poi."amount"::numeric
            + (COALESCE(po."platformMarginDiscount"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0))
              * poi."amount"::numeric
              / NULLIF(SUM(poi."amount"::numeric) OVER (PARTITION BY po."id"), 0) AS gross_amount
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "purchaseOrder"."purchaseOrderItem" poi ON poi."purchaseOrderId" = po."id"
        JOIN "brands"."brandSKU"                  bs  ON bs."id"  = poi."brandSKUId"
        LEFT JOIN "brands"."brand"                bra ON bra."id" = bs."brandId"
        JOIN "users"."buyer"                      b   ON b."id"   = po."buyerId"
        JOIN "users"."seller"                     s   ON s."id"   = po."sellerId"
        WHERE po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
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
      ) items
      GROUP BY brand_label, brand_id, sku_id, sku_label, sku_size;
    `;

    // Distinct order-level totals — these tie back to the Chart & Trend cards
    // ("Delivered Orders", "Delivered GMV") since they count each purchaseOrder
    // once and sum (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0)) (the order-header total the buyer owes), instead
    // of summing per-SKU line items which double-count orders with multiple SKUs
    // and ignore order-level discounts.
    const distinctSql = `
      WITH qualifying_orders AS (
        SELECT DISTINCT po."id", (po."amount"::numeric + COALESCE(po."platformMarginDiscount", 0)::numeric + COALESCE(po."totalDiscount"::numeric, 0)) AS amt, po."buyerId"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "purchaseOrder"."purchaseOrderItem" poi ON poi."purchaseOrderId" = po."id"
        JOIN "brands"."brandSKU"                  bs  ON bs."id"  = poi."brandSKUId"
        JOIN "users"."buyer"                      b   ON b."id"   = po."buyerId"
        JOIN "users"."seller"                     s   ON s."id"   = po."sellerId"
        WHERE po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."isD2RBrandSeller" = TRUE
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."status"          IN ('DELIVERED', 'COMPLETED')
          AND poi."status"         != 'DRAFT'
          AND po."markedPendingTime" IS NOT NULL
          ${whereDate}
          ${brandFilter}
      )
      SELECT
        COUNT(*)::text                          AS distinct_orders,
        COUNT(DISTINCT "buyerId")::text         AS distinct_buyers,
        COALESCE(SUM(amt), 0)::text             AS po_amount_total
      FROM qualifying_orders;
    `;

    const [rows, distinctRows] = await Promise.all([
      query<Row>(sql, params),
      query<{ distinct_orders: string; distinct_buyers: string; po_amount_total: string }>(distinctSql, params),
    ]);
    const distinct = distinctRows[0] ?? { distinct_orders: '0', distinct_buyers: '0', po_amount_total: '0' };

    type Cell = { count: number; amount: number; buyers: number; quantity: number };
    interface SkuRow {
      skuId: string;
      skuLabel: string;
      size: string | null;
      total: Cell;
    }
    interface BrandRow {
      brandId: string | null;
      brandLabel: string;
      total: Cell;
      products: SkuRow[];
    }

    const brandMap = new Map<string, BrandRow>();
    const grand: Cell = { count: 0, amount: 0, buyers: 0, quantity: 0 };

    for (const r of rows) {
      const key = (r.brand_id ?? '') + '::' + (r.brand_label ?? '');
      const count = parseInt(r.order_count);
      const amount = parseFloat(r.amount);
      const buyers = parseInt(r.buyer_count);
      const quantity = parseFloat(r.quantity);

      let br = brandMap.get(key);
      if (!br) {
        br = {
          brandId: r.brand_id,
          brandLabel: r.brand_label || '(unbranded)',
          total: { count: 0, amount: 0, buyers: 0, quantity: 0 },
          products: [],
        };
        brandMap.set(key, br);
      }
      br.products.push({
        skuId: r.sku_id,
        skuLabel: r.sku_label || '(unnamed SKU)',
        size: r.sku_size,
        total: { count, amount, buyers, quantity },
      });
      br.total.count += count;
      br.total.amount += amount;
      br.total.buyers += buyers;
      br.total.quantity += quantity;

      grand.count += count;
      grand.amount += amount;
      grand.buyers += buyers;
      grand.quantity += quantity;
    }

    const pick = (c: Cell) => sort === 'quantity' ? c.quantity : sort === 'orders' ? c.count : c.amount;
    const sign = direction === 'asc' ? 1 : -1;
    const cmp = (a: Cell, b: Cell) => (pick(a) - pick(b)) * sign;

    const brands = Array.from(brandMap.values())
      .map((br) => ({
        ...br,
        products: br.products.sort((a, b) => cmp(a.total, b.total)),
      }))
      .sort((a, b) => cmp(a.total, b.total));

    const productCount = brands.reduce((s, b) => s + b.products.length, 0);

    return NextResponse.json({
      brands,
      grand,
      // Distinct order-level totals — tie back to Chart & Trend cards. Use these
      // in any footer / KPI display where the column-sum overcount would mislead.
      distinct: {
        orders: parseInt(distinct.distinct_orders),
        buyers: parseInt(distinct.distinct_buyers),
        amount: parseFloat(distinct.po_amount_total),
      },
      brandCount: brands.length,
      productCount,
      sort,
      direction,
      year,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
