import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  channel: string;
  installs: string;
}

// Classify each install (first session) by acquisition channel, derived from the
// installReferrer column:
//   - object        → Meta paid ad (has campaign / publisher_platform keys)
//   - utm_source=whatsapp           → WhatsApp messaging deeplink
//   - utm_medium=organic / google-play → organic Play Store
//   - null / "unknown"              → Unknown
//   - anything else                 → Other (misc deeplinks / utm)
const CHANNEL_CASE = `CASE
  WHEN jsonb_typeof("installReferrer") = 'object' THEN 'Paid (Meta)'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_source=whatsapp%' THEN 'WhatsApp'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_medium=organic%'
    OR "installReferrer" #>> '{}' ILIKE '%google-play%' THEN 'Organic (Play Store)'
  WHEN "installReferrer" IS NULL OR "installReferrer" #>> '{}' IN ('unknown', '') THEN 'Unknown'
  ELSE 'Other'
END`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const sql = `
      SELECT ${CHANNEL_CASE} AS channel,
             COUNT(*)::text  AS installs
      FROM history.session
      WHERE "isFirstSession" = TRUE
        AND "isTest" = FALSE
        AND created_at >= current_date - $1::int
      GROUP BY 1
      ORDER BY COUNT(*) DESC;
    `;
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({ channel: r.channel, installs: parseInt(r.installs, 10) }));
    const total = data.reduce((a, b) => a + b.installs, 0);

    return NextResponse.json({
      data,
      total,
      windowDays: days,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
