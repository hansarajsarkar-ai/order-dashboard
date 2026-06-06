import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  name: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
  businessPanNumber: string | null;
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
}

async function _GET(req: NextRequest) {
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
      where.push(`b."phone" = $${params.length}`);
    }
    if (businessName) {
      params.push(businessName);
      where.push(`b."businessName" = $${params.length}`);
    }

    const sql = `
      SELECT
        b."id"::text             AS "id",
        b."name"                 AS "name",
        b."businessName"         AS "businessName",
        b."phone"                AS "phone",
        b."email"                AS "email",
        b."gstNumber"            AS "gstNumber",
        b."businessPanNumber"    AS "businessPanNumber",
        b."addressLine1"         AS "addressLine1",
        b."addressLine2"         AS "addressLine2",
        b."landmark"             AS "landmark",
        b."pincode"              AS "pincode",
        b."city"                 AS "city",
        b."tehsil"               AS "tehsil",
        b."district"             AS "district",
        b."state"                AS "state",
        b."longitude"::text      AS "longitude",
        b."lattitude"::text      AS "lattitude"
      FROM "users"."buyer" b
      WHERE ${where.join(' AND ')}
      ORDER BY b."created_at" DESC NULLS LAST
      LIMIT 1
    `;

    const rows = await query<Row>(sql, params);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
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

export const GET = withQueryCapture(_GET);
