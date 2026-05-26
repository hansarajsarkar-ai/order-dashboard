import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Typeahead for the create-PO dialog — only surfaces sellers that pass
// the same live-D2R-brand filter the existing live_brands CTE uses, so
// the picker can't offer a seller whose products the rest of Badho
// would later reject.

interface SellerRow {
  id: string;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  brandLabel: string | null;
}

const MAX_ROWS = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  // Empty query returns a small "popular" page — keeps the dialog useful
  // even before the user starts typing.
  const ilike = q
    ? `%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    : null;

  try {
    const rows = await query<SellerRow>(
      `
      WITH live AS (
        SELECT DISTINCT a."id"
        FROM "users"."seller" a
        JOIN "users"."seller_brand" b ON b."sellerId" = a."id"
        WHERE a."isD2RBrandSeller"  = TRUE
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
      )
      SELECT
        a."id"::text                                            AS id,
        a."businessName"                                        AS "businessName",
        a."phone"                                               AS phone,
        a."city"                                                AS city,
        a."state"                                               AS state,
        (
          SELECT br."label"
          FROM "users"."seller_brand" sb
          JOIN "brands"."brand" br ON br."id" = sb."brandId"
          WHERE sb."sellerId" = a."id"
            AND sb."isActive" = TRUE
            AND br."isActive" = TRUE
          ORDER BY br."label"
          LIMIT 1
        )                                                       AS "brandLabel"
      FROM "users"."seller" a
      WHERE a."id" IN (SELECT id FROM live)
        AND ($1::text IS NULL OR a."businessName" ILIKE $1 ESCAPE '\\')
      ORDER BY a."businessName" NULLS LAST
      LIMIT ${MAX_ROWS};
      `,
      [ilike],
    );
    return NextResponse.json({ rows, count: rows.length, maxRows: MAX_ROWS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
