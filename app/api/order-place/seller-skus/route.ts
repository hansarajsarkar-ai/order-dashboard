import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Returns SKUs available for the PO's seller. Each row carries the FIRST
// quantitySlab range so the UI can suggest a valid initial quantity — the
// real unitPrice is computed by the `handlePurchaseOrderTermAndUnitPrice2`
// BEFORE INSERT/UPDATE trigger (consumerSellingPrice * (1 - margin/100)),
// which is why the slab's own `unitPrice` column isn't surfaced as
// authoritative here.

interface SkuRow {
  sellerBrandSKUId: string;
  brandSKUId: string;
  brandId: string | null;
  brandLabel: string | null;
  skuLabel: string | null;
  size: string | null;
  // Distinct non-empty product images from brandSKU.assets in
  // preferred angle order (front/top first). Empty when unset.
  images: string[];
  // Slab metadata: range bounds (lower inclusive, upper exclusive) come from
  // the PostgreSQL int4range column `quantitySlab`. Surfaced as ints so the
  // client can constrain its qty input.
  slabMinQuantity: number | null;
  slabMaxQuantity: number | null;
  slabIncrement:   number | null;
  slabHint:        string | null;
  // Indicative unitPrice from MIN(slab.unitPrice) — informational only;
  // the trigger may override at insert time using margin pricing.
  unitPriceHint: string | null;
  mrp: string | null;
  alreadyInPo: boolean;
}

const MAX_ROWS = 100;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = searchParams.get('poNumber');
  const q        = (searchParams.get('q') || '').trim();
  if (!poNumber || !/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'poNumber (numeric) is required' }, { status: 400 });
  }

  const ilike = q
    ? `%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    : null;

  try {
    const sql = `
      WITH po AS (
        SELECT "id", "sellerId"
        FROM "purchaseOrder"."purchaseOrder"
        WHERE "poNumber"::text = $1
        LIMIT 1
      ),
      live_brands AS (
        -- User's canonical "live brand" gate. Without this, the SKU picker
        -- exposes brands the seller has mapped but isn't actively delivering
        -- (inactive mapping or empty fulfilmentZone), which would let the
        -- caller add items that the rest of Badho would later reject.
        SELECT b."brandId"
        FROM "users"."seller" a
        JOIN "users"."seller_brand" b ON b."sellerId" = a."id"
        WHERE a."id"                = (SELECT "sellerId" FROM po)
          AND a."isD2RBrandSeller"  = TRUE
          AND a."isActive"          = TRUE
          AND a."deliveryType"      = 'INTERCITY'
          AND a."deliveryNetwork"   = 'THIRD_PARTY'
          AND a."pickupAddressName" IS NOT NULL
          AND a."isTest"            = FALSE
          AND a."businessName"      NOT ILIKE '%test%'
          AND a."businessName"      NOT ILIKE '%milko%'
          AND b."isActive"          = TRUE
          AND b."fulfilmentZone"    IS NOT NULL
          AND b."fulfilmentZone"::text != '[]'
      ),
      first_slab AS (
        -- One slab per seller_brandSKU. We deliberately pick the slab with
        -- the LOWEST quantity range so the UI's default qty (= range start)
        -- is always valid for the trigger's @> containment check.
        SELECT DISTINCT ON (sb."id")
          sb."id"                          AS seller_brand_sku_id,
          sb."sellerId",
          sb."brandSKUId",
          sb."brandId",
          sb."purchaseOrderTermId",
          pos."unitPrice"                  AS unit_price,
          pos."quantitySlab"               AS quantity_slab,
          pos."increment"                  AS slab_increment,
          lower(pos."quantitySlab")        AS slab_lower,
          upper(pos."quantitySlab")        AS slab_upper
        FROM "users"."seller_brandSKU" sb
        JOIN "purchaseOrderTerms"."purchaseOrderTermSlab" pos
          ON pos."purchaseOrderTermId" = sb."purchaseOrderTermId"
        WHERE sb."sellerId" = (SELECT "sellerId" FROM po)
          AND sb."brandId" IN (SELECT "brandId" FROM live_brands)
          AND pos."isArchived" IS NOT TRUE
        ORDER BY sb."id", lower(pos."quantitySlab") ASC NULLS LAST
      )
      SELECT
        fs.seller_brand_sku_id::text                       AS "sellerBrandSKUId",
        fs."brandSKUId"::text                              AS "brandSKUId",
        fs."brandId"::text                                 AS "brandId",
        bra."label"                                        AS "brandLabel",
        bs."label"                                         AS "skuLabel",
        (bs."brandSKUDataJSON" ->> 'size')                 AS "size",
        COALESCE((
          SELECT array_agg(url ORDER BY ord)
          FROM (
            SELECT DISTINCT ON (url) url, ord
            FROM unnest(
              ARRAY['front','top','icon','top_left','top_right','left','right','back','bottom']
            ) WITH ORDINALITY AS k(angle, ord)
            CROSS JOIN LATERAL (SELECT NULLIF(bs."assets" ->> k.angle, '') AS url) u
            WHERE url IS NOT NULL
            ORDER BY url, ord
          ) deduped
        ), ARRAY[]::text[])                                AS "images",
        fs.slab_lower                                      AS "slabMinQuantity",
        fs.slab_upper                                      AS "slabMaxQuantity",
        fs.slab_increment                                  AS "slabIncrement",
        fs.quantity_slab::text                             AS "slabHint",
        fs.unit_price::text                                AS "unitPriceHint",
        bs."consumerSellingPrice"::text                    AS "mrp",
        EXISTS (
          SELECT 1
          FROM "purchaseOrder"."purchaseOrderItem" poi
          WHERE poi."purchaseOrderId" = (SELECT "id" FROM po)
            AND poi."brandSKUId"      = fs."brandSKUId"
        )                                                  AS "alreadyInPo"
      FROM first_slab fs
      JOIN "brands"."brandSKU"  bs  ON bs."id"  = fs."brandSKUId"
      LEFT JOIN "brands"."brand" bra ON bra."id" = fs."brandId"
      WHERE bs."isActive" = TRUE
        AND ($2::text IS NULL
             OR bs."label" ILIKE $2 ESCAPE '\\'
             OR bra."label" ILIKE $2 ESCAPE '\\')
      ORDER BY bra."label" NULLS LAST, bs."label" NULLS LAST
      LIMIT ${MAX_ROWS};
    `;

    const rows = await query<SkuRow>(sql, [poNumber, ilike]);
    return NextResponse.json({
      rows,
      count: rows.length,
      maxRows: MAX_ROWS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
