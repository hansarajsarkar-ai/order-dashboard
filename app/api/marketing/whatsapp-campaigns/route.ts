import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  campaign: string | null;
  sessions: string;
}

// WhatsApp messaging campaign reach — sessions driven by WhatsApp deeplinks
// (utm_source=whatsapp), grouped by utm_campaign parsed out of the referrer
// string. These are mostly re-engagement clicks (not installs), so we count ALL
// sessions, not just first sessions. The jsonb_typeof='string' pre-filter keeps
// the scan light (skips the heavy paid-ad JSON objects).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  try {
    const sql = `
      SELECT substring(r FROM 'utm_campaign=([^&]+)') AS campaign,
             COUNT(*)::text                           AS sessions
      FROM (
        SELECT "installReferrer" #>> '{}' AS r
        FROM history.session
        WHERE "isTest" = FALSE
          AND jsonb_typeof("installReferrer") = 'string'
          AND created_at >= current_date - $1::int
      ) s
      WHERE r ILIKE '%utm_source=whatsapp%'
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 300;
    `;
    const rows = await query<Row>(sql, [days]);

    const data = rows.map((r) => ({
      campaign: r.campaign || '(no campaign)',
      sessions: parseInt(r.sessions, 10),
    }));
    const total = data.reduce((a, b) => a + b.sessions, 0);

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
