import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  day: string;
  cnt: string;
}

const GRANULARITIES: Record<string, 'day' | 'week' | 'month'> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

// Daily Active Buyers — distinct buyers who started a buyer-app session
// per day. Mirrors the analyst query: history.session ⋈ users.buyer,
// excluding test/master-login sessions and test businesses.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Window: explicit start/end date wins; otherwise trailing N days (default 30).
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  // Bucket granularity: distinct active buyers counted per day / week / month.
  const granParam = (searchParams.get('granularity') || 'day').toLowerCase();
  const gran = GRANULARITIES[granParam] || 'day';

  try {
    const params: (string | number)[] = [gran];
    let whereDate: string;

    if (startDate && endDate) {
      params.push(startDate, endDate);
      whereDate = `AND h."sessionStartTimestamp"::date >= $2::date
                   AND h."sessionStartTimestamp"::date <= $3::date`;
    } else {
      params.push(days);
      whereDate = `AND h."sessionStartTimestamp"::date >= current_date - $2::int`;
    }

    const sql = `
      SELECT
        date_trunc($1, h."sessionStartTimestamp")::date::text AS day,
        COUNT(DISTINCT h."buyerId")::text                     AS cnt
      FROM history.session h
      JOIN "users"."buyer" b ON b."id" = h."buyerId"
      WHERE h."isTest"        = FALSE
        AND h."buyerId" IS NOT NULL
        AND h."userType"      = 'buyer'
        AND h."appUsed"       = 'buyer-app'
        AND h."isMasterLogin" = FALSE
        AND b."isTest"        = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        ${whereDate}
      GROUP BY 1
      ORDER BY 1;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      day: r.day,
      buyers: parseInt(r.cnt, 10),
    }));

    const counts = data.map((r) => r.buyers);
    const peak = data.reduce(
      (best, r) => (r.buyers > best.buyers ? r : best),
      { day: '', buyers: -1 }
    );
    const avg = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
    const latest = data.length ? data[data.length - 1].buyers : 0;
    const first = data.length ? data[0].buyers : 0;
    const changePct = first ? ((latest - first) / first) * 100 : 0;

    return NextResponse.json({
      data,
      summary: {
        avg,
        peak: peak.buyers >= 0 ? peak.buyers : 0,
        peakDay: peak.day || null,
        latest,
        first,
        changePct,
        granularity: gran,
        windowDays: startDate && endDate ? null : days,
      },
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
