import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  name: string | null;
  businessName: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  gstNumber: string | null;
  businessPanNumber: string | null;
  fssaiNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  pincode: string | null;
  city: string | null;
  tehsil: string | null;
  district: string | null;
  state: string | null;
  longitude: string | null;
  lattitude: string | null;
  isD2RBrandSeller: boolean | null;
  isBadhoVerified: boolean | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');
  const businessName = searchParams.get('businessName');

  if (!phone && !businessName) {
    return NextResponse.json({ error: 'phone or businessName required' }, { status: 400 });
  }

  try {
    const params: string[] = [];
    const where: string[] = [];
    if (phone) {
      params.push(phone);
      where.push(`s."phone" = $${params.length}`);
    }
    if (businessName) {
      params.push(businessName);
      where.push(`s."businessName" = $${params.length}`);
    }

    const sql = `
      SELECT
        s."id"::text             AS "id",
        s."name"                 AS "name",
        s."businessName"         AS "businessName",
        s."phone"                AS "phone",
        s."whatsappNumber"       AS "whatsappNumber",
        s."email"                AS "email",
        s."gstNumber"            AS "gstNumber",
        s."businessPanNumber"    AS "businessPanNumber",
        s."fssaiNumber"          AS "fssaiNumber",
        s."addressLine1"         AS "addressLine1",
        s."addressLine2"         AS "addressLine2",
        s."landmark"             AS "landmark",
        s."pincode"              AS "pincode",
        s."city"                 AS "city",
        s."tehsil"               AS "tehsil",
        s."district"             AS "district",
        s."state"                AS "state",
        s."longitude"::text      AS "longitude",
        s."lattitude"::text      AS "lattitude",
        s."isD2RBrandSeller"     AS "isD2RBrandSeller",
        s."isBadhoVerified"      AS "isBadhoVerified"
      FROM "users"."seller" s
      WHERE ${where.join(' AND ')}
      ORDER BY s."created_at" DESC NULLS LAST
      LIMIT 1
    `;

    const rows = await query<Row>(sql, params);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }

    const r = rows[0];
    const fullAddress = [
      r.addressLine1,
      r.addressLine2,
      r.landmark,
      r.city,
      r.tehsil,
      r.district,
      r.state,
      r.pincode,
    ].filter((v) => v != null && String(v).trim() !== '').join(', ');

    return NextResponse.json({
      data: {
        ...r,
        fullAddress,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
