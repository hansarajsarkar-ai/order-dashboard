import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Full edit history for one buyer within a scheme — reads the audit log written
// by /api/qps-gift-update/save. Most recent first.

interface LogRow {
  edited_by: string | null;
  edited_by_id: string | null;
  edited_at: string;
  changes: unknown;
}

export async function GET(req: NextRequest) {
  const schemeId = req.nextUrl.searchParams.get('schemeId') || '';
  const buyerId = req.nextUrl.searchParams.get('buyerId') || '';
  if (!schemeId || !buyerId) {
    return NextResponse.json({ error: 'schemeId and buyerId are required' }, { status: 400 });
  }
  try {
    const rows = await query<LogRow>(
      `
      SELECT "editedBy" AS edited_by, "editedById" AS edited_by_id,
             "editedAt" AS edited_at, changes
      FROM promotions."qpsGiftEditLog"
      WHERE "schemeId" = $1 AND "buyerId" = $2
      ORDER BY "editedAt" DESC
      LIMIT 50
      `,
      [schemeId, buyerId]
    );
    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
