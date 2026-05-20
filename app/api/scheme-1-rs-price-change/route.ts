import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  slab_id: string;
  seller_id: string;
  seller_name: string | null;
  businessName: string | null;
  phone: string | null;
  seller_state: string | null;
  seller_district: string | null;
  seller_city: string | null;
  brand_id: string | null;
  brand_name: string | null;
  product_name: string | null;
  margin: string | null;
  mrp: string | null;
  brandLive: 'LIVE' | 'INACTIVE';
  originalMargin: string | null;
}

const SELECT_SQL = `
  SELECT
      pos."id"                     AS slab_id,
      us."id"                      AS seller_id,
      us."name"                    AS seller_name,
      us."businessName",
      us."phone",
      us."state"                   AS seller_state,
      us."district"                AS seller_district,
      us."city"                    AS seller_city,
      b."id"                       AS brand_id,
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

export async function GET() {
  try {
    const rows = await query<Row>(SELECT_SQL);
    return NextResponse.json({ rows, total: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface UpdateRow {
  id: string;
  margin: string;
  originalMargin: string | null;
}

// Emails authorised to write margins. Anyone else hitting PATCH gets a 403.
// NOTE: this is a deterrent, not a security boundary — there's no signed
// token in this app, so the employeeEmail value in the body is spoofable
// by anyone who knows the URL. Fine for an internal trusted team; if this
// dashboard ever opens up beyond Badho staff, replace with real auth.
const ALLOWED_EDITOR_EMAILS = new Set([
  'chandan@badho.in',
  'rishi@badho.in',
  'sahil@badho.in',
  'sahil.rohera@badho.in',
]);

// PATCH body shapes:
//   single / multi-row     :  { slabIds: string[],  margin: number, employeeEmail: string }
//   bulk by 1+ brands      :  { brandIds: string[], margin: number, employeeEmail: string }
//
// For both, "originalMargin" is set to whatever the row's current "margin"
// is before applying the new value, so the previous value is preserved.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    const employeeEmail = String(body?.employeeEmail ?? '').trim().toLowerCase();
    if (!ALLOWED_EDITOR_EMAILS.has(employeeEmail)) {
      return NextResponse.json(
        { error: 'You are not authorised to edit margins. Contact chandan/rishi/sahil if you need access.' },
        { status: 403 }
      );
    }

    const margin = Number(body?.margin);
    if (!Number.isFinite(margin)) {
      return NextResponse.json({ error: 'margin must be a finite number' }, { status: 400 });
    }

    let updated: UpdateRow[];

    if (Array.isArray(body?.slabIds) && body.slabIds.length > 0) {
      const slabIds = body.slabIds.map((s: unknown) => String(s));
      // Cast both sides to text so this works whether pos."id" is uuid or text.
      const updateSql = `
        UPDATE "purchaseOrderTerms"."purchaseOrderTermSlab" pos
        SET "originalMargin" = pos."margin",
            "margin"         = $1
        WHERE pos."id"::text = ANY($2::text[])
        RETURNING pos."id" AS id, pos."margin" AS margin, pos."originalMargin" AS "originalMargin";
      `;
      updated = await query<UpdateRow>(updateSql, [margin, slabIds]);
    } else if (Array.isArray(body?.brandIds) && body.brandIds.length > 0) {
      const brandIds = body.brandIds.map((s: unknown) => String(s));
      // Update every slab that belongs to any active seller_brandSKU mapping of these brands.
      const updateSql = `
        UPDATE "purchaseOrderTerms"."purchaseOrderTermSlab" pos
        SET "originalMargin" = pos."margin",
            "margin"         = $1
        WHERE pos."purchaseOrderTermId" IN (
          SELECT DISTINCT sb."purchaseOrderTermId"
          FROM "users"."seller_brandSKU" sb
          WHERE sb."brandId"::text = ANY($2::text[])
            AND sb."isActive" = TRUE
        )
        RETURNING pos."id" AS id, pos."margin" AS margin, pos."originalMargin" AS "originalMargin";
      `;
      updated = await query<UpdateRow>(updateSql, [margin, brandIds]);
    } else {
      return NextResponse.json(
        { error: 'Provide either { slabIds: string[] } or { brandIds: string[] }' },
        { status: 400 }
      );
    }

    return NextResponse.json({ updated, count: updated.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
