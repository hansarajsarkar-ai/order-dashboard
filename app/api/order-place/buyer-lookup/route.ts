import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Resolve a buyer by phone (10-digit Indian mobile, no country code) so the
// create-PO dialog can show the business name as a confirmation step before
// the user picks a seller. Returns null when nothing matches — the UI will
// surface that as "no buyer found" without erroring out.

interface BuyerRow {
  id: string;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = (searchParams.get('phone') || '').trim();
  if (!/^\d{10}$/.test(phone)) {
    return NextResponse.json({ error: 'phone must be a 10-digit number' }, { status: 400 });
  }
  try {
    const rows = await query<BuyerRow>(
      `
      SELECT
        b."id"::text                 AS id,
        b."businessName"             AS "businessName",
        b."phone"                    AS phone,
        b."city"                     AS city,
        b."district"                 AS district,
        b."state"                    AS state,
        b."pincode"                  AS pincode
      FROM "users"."buyer" b
      WHERE b."phone" = $1
        AND COALESCE(b."isTest", FALSE) = FALSE
      ORDER BY b."businessName" NULLS LAST
      LIMIT 1;
      `,
      [phone],
    );
    return NextResponse.json({ buyer: rows[0] ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
