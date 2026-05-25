import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand_name: string | null;
  sku_id: string;
  sku_label: string | null;
  sku_size: string | null;
  month: string;
  order_count: string;
  amount: string;
  buyer_count: string;
  quantity: string;
}

// Product-level breakdown: rows = brandSKU, columns = month.
// Each cell shows distinct orders containing the SKU, ₹ value (SUM of item amount),
// and distinct buyer count. Mirrors the brand multi-select & date filters used by
// the rest of the Brand Performance page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brand = searchParams.get('brand');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '300'), 1), 1000);

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

    const sql = `
      SELECT
        bra."label"                                              AS brand_name,
        bs."id"::text                                            AS sku_id,
        bs."label"                                               AS sku_label,
        (bs."brandSKUDataJSON" ->> 'size')                       AS sku_size,
        EXTRACT(MONTH FROM po."markedPendingTime")::int          AS month,
        COUNT(DISTINCT po."id")                                  AS order_count,
        COALESCE(SUM(poi."amount"::numeric), 0)::text            AS amount,
        COUNT(DISTINCT po."buyerId")                             AS buyer_count,
        COALESCE(SUM(poi."quantity"::numeric), 0)::text          AS quantity
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
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
        ${brandFilter}
      GROUP BY bra."label", bs."id", bs."label", (bs."brandSKUDataJSON" ->> 'size'), EXTRACT(MONTH FROM po."markedPendingTime")
      ORDER BY sku_label, month;
    `;
    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number; buyers: number; quantity: number };
    interface ProductRow {
      skuId: string;
      skuLabel: string;
      brandName: string | null;
      size: string | null;
      months: Record<number, Cell>;
      total: Cell;
    }

    const productMap = new Map<string, ProductRow>();
    const byMonth: Record<number, Cell> = {};
    const grand: Cell = { count: 0, amount: 0, buyers: 0, quantity: 0 };
    const monthsSet = new Set<number>();

    for (const r of rows) {
      const month = parseInt(String(r.month));
      const count = parseInt(r.order_count);
      const amount = parseFloat(r.amount);
      const buyers = parseInt(r.buyer_count);
      const quantity = parseFloat(r.quantity);
      monthsSet.add(month);

      let p = productMap.get(r.sku_id);
      if (!p) {
        p = {
          skuId: r.sku_id,
          skuLabel: r.sku_label || '(unnamed SKU)',
          brandName: r.brand_name,
          size: r.sku_size,
          months: {},
          total: { count: 0, amount: 0, buyers: 0, quantity: 0 },
        };
        productMap.set(r.sku_id, p);
      }
      p.months[month] = { count, amount, buyers, quantity };
      p.total.count += count;
      p.total.amount += amount;
      p.total.buyers += buyers;
      p.total.quantity += quantity;

      if (!byMonth[month]) byMonth[month] = { count: 0, amount: 0, buyers: 0, quantity: 0 };
      byMonth[month].count += count;
      byMonth[month].amount += amount;
      byMonth[month].buyers += buyers;
      byMonth[month].quantity += quantity;
      grand.count += count;
      grand.amount += amount;
      grand.buyers += buyers;
      grand.quantity += quantity;
    }

    const allProducts = Array.from(productMap.values()).sort((a, b) => b.total.amount - a.total.amount);
    const truncated = allProducts.length > limit;
    const data = allProducts.slice(0, limit);
    const months = Array.from(monthsSet).sort((a, b) => a - b);

    return NextResponse.json({
      data,
      months,
      totals: { byMonth, grand },
      productCount: allProducts.length,
      returned: data.length,
      truncated,
      limit,
      brand: brand || null,
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
