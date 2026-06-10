import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Product × Seller price-set: every active brand-SKU mapped to every D2R brand-seller,
// joined with the seller's PurchaseOrderTermSlab to expose unitPrice + margin against
// the consumer MRP. Powers the "Price Set" tab on Brand Performance.

interface Row {
  seller_id: string;
  seller_name: string | null;
  businessName: string | null;
  phone: string | null;
  seller_state: string | null;
  seller_district: string | null;
  seller_city: string | null;
  pincode: string | null;
  brand_name: string | null;
  sku_id: string | null;
  product_name: string | null;
  size: string | null;
  unitPrice: string | null;
  margin: string | null;
  mrp: string | null;
}

const SQL = `
  WITH cte AS (
    SELECT
      us."id"                                  AS seller_id,
      us."name"                                AS seller_name,
      us."businessName",
      us."state"                               AS seller_state,
      us."district"                            AS seller_district,
      us."city"                                AS seller_city,
      us."pincode"                             AS pincode,
      us."phone",
      b."label"                                AS brand_name,
      p."id"::text                             AS sku_id,
      p."label"                                AS product_name,
      (p."brandSKUDataJSON" ->> 'size')        AS size,
      p."consumerSellingPrice"                 AS mrp,
      sb."purchaseOrderTermId"
    FROM "users"."seller" us
    LEFT JOIN "users"."seller_brandSKU" sb ON us."id" = sb."sellerId"
    LEFT JOIN "brands"."brand"          b  ON b."id" = sb."brandId"
    LEFT JOIN "brands"."brandSKU"       p  ON p."id" = sb."brandSKUId"
    WHERE us."isTest"        IS FALSE
      AND us."isAppInstalled" IS TRUE
      AND p."isActive"        IS TRUE
      AND b."isActive"        IS TRUE
      AND us."id" IN (
        SELECT a."id"
        FROM "users"."seller" a
        JOIN "users"."seller_brand" sbr ON sbr."sellerId" = a."id"
        JOIN "brands"."brand"        c   ON c."id"        = sbr."brandId"
        WHERE a."isD2RBrandSeller"   = TRUE
          AND a."isActive"           = TRUE
          AND a."deliveryType"       = 'INTERCITY'
          AND a."deliveryNetwork"    = 'THIRD_PARTY'
          AND a."pickupAddressName" IS NOT NULL
          AND a."isTest"             = FALSE
          AND a."businessName" NOT ILIKE '%test%'
          AND a."businessName" NOT ILIKE '%milko%'
          AND sbr."isActive"         = TRUE
          AND sbr."fulfilmentZone" IS NOT NULL
          AND sbr."fulfilmentZone"::TEXT != '[]'
      )
  )
  SELECT
    cte.seller_id,
    cte.seller_name,
    cte."businessName",
    cte.phone,
    cte.seller_state,
    cte.seller_district,
    cte.seller_city,
    cte.pincode,
    cte.brand_name,
    cte.sku_id,
    cte.product_name,
    cte.size,
    pos."unitPrice"::text                     AS "unitPrice",
    pos."margin"::text                        AS margin,
    cte.mrp::text                             AS mrp
  FROM cte
  JOIN "purchaseOrderTerms"."purchaseOrderTermSlab" pos ON pos."purchaseOrderTermId" = cte."purchaseOrderTermId"
  ORDER BY pos."unitPrice" ASC NULLS LAST;
`;

async function _GET(_req: NextRequest) {
  try {
    const rows = await query<Row>(SQL);

    const data = rows.map((r) => ({
      sellerId: r.seller_id,
      sellerName: r.seller_name,
      businessName: r.businessName,
      phone: r.phone,
      sellerState: r.seller_state,
      sellerDistrict: r.seller_district,
      sellerCity: r.seller_city,
      pincode: r.pincode,
      brandName: r.brand_name,
      skuId: r.sku_id,
      productName: r.product_name,
      size: r.size,
      unitPrice: r.unitPrice != null ? parseFloat(r.unitPrice) : null,
      margin:    r.margin    != null ? parseFloat(r.margin)    : null,
      mrp:       r.mrp       != null ? parseFloat(r.mrp)       : null,
    }));

    // Distinct buckets for filter UI
    const distinct = (key: keyof (typeof data)[number]) =>
      Array.from(new Set(data.map((d) => d[key]).filter((v) => v != null && v !== ''))).sort() as string[];

    const brands  = distinct('brandName');
    const states  = distinct('sellerState');
    const sellers = Array.from(new Set(data.map((d) => d.businessName).filter(Boolean))).sort() as string[];

    const priced = data.filter((d) => d.unitPrice != null);
    const summary = {
      rows: data.length,
      withPrice: priced.length,
      withoutPrice: data.length - priced.length,
      sellers: new Set(data.map((d) => d.sellerId)).size,
      brands: brands.length,
      products: new Set(data.map((d) => d.skuId).filter(Boolean)).size,
      states: states.length,
      minUnitPrice: priced.length ? Math.min(...priced.map((d) => d.unitPrice!)) : null,
      maxUnitPrice: priced.length ? Math.max(...priced.map((d) => d.unitPrice!)) : null,
      avgMargin: data.filter((d) => d.margin != null).reduce((s, d, _i, arr) => s + d.margin! / arr.length, 0) || null,
    };

    return NextResponse.json({
      data,
      brands,
      states,
      sellers,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
