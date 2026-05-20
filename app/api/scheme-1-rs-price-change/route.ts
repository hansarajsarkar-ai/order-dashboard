import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_name: string | null;
  businessName: string | null;
  phone: string | null;
  seller_state: string | null;
  seller_district: string | null;
  seller_city: string | null;
  brand_name: string | null;
  product_name: string | null;
  margin: string | null;
  mrp: string | null;
  brandLive: 'LIVE' | 'INACTIVE';
  originalMargin: string | null;
}

export async function GET() {
  try {
    const sql = `
      SELECT
          us."id"                      AS seller_id,
          us."name"                    AS seller_name,
          us."businessName",
          us."phone",
          us."state"                   AS seller_state,
          us."district"                AS seller_district,
          us."city"                    AS seller_city,
          b."label"                    AS brand_name,
          p."label"                    AS product_name,
          pos."margin",
          p."consumerSellingPrice"     AS mrp,
          CASE
              WHEN EXISTS (
                  SELECT 1
                  FROM "users"."seller_brand" sb2
                  WHERE sb2."sellerId"        = us."id"
                    AND sb2."isActive"        = TRUE
                    AND sb2."fulfilmentZone" IS NOT NULL
                    AND sb2."fulfilmentZone"::TEXT != '[]'
              )
              AND us."isD2RBrandSeller"  = TRUE
              AND us."isActive"          = TRUE
              AND us."deliveryType"      = 'INTERCITY'
              AND us."deliveryNetwork"   = 'THIRD_PARTY'
              AND us."pickupAddressName" IS NOT NULL
              AND us."isTest"            = FALSE
              AND us."businessName" NOT ILIKE '%test%'
              AND us."businessName" NOT ILIKE '%milko%'
              THEN 'LIVE'
              ELSE 'INACTIVE'
          END                          AS "brandLive",
          pos."originalMargin"
      FROM "users"."seller" us
      LEFT JOIN "users"."seller_brandSKU"                   sb  ON us."id" = sb."sellerId"
      LEFT JOIN "brands"."brand"                            b   ON b."id"  = sb."brandId"
      LEFT JOIN "brands"."brandSKU"                         p   ON p."id"  = sb."brandSKUId"
      JOIN      "purchaseOrderTerms"."purchaseOrderTermSlab" pos ON pos."purchaseOrderTermId" = sb."purchaseOrderTermId"
      WHERE us."isTest"           IS FALSE
        AND us."isAppInstalled"   IS TRUE
        AND p."isActive"          IS TRUE
        AND b."isActive"          IS TRUE
        AND sb."isActive"         IS TRUE
        AND us."isD2RBrandSeller" = TRUE
        AND us."businessName" NOT ILIKE '%test%'
      ORDER BY pos."unitPrice";
    `;
    const rows = await query<Row>(sql);
    return NextResponse.json({ rows, total: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
