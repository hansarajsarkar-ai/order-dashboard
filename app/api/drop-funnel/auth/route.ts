import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUYER_APP = '2391550b-7f93-4b02-8043-60a8646ec4f4';

// OTP success rate — Not authenticated -> Authenticated.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '90', 10) || 90));
  try {
    const payload = await cached(`df:auth:${days}`, 30 * 60_000, async () => {
      const sql = `
        SELECT count(*)::int                                 AS requested,
               count(*) FILTER (WHERE "wasOTPVerified")::int AS verified
        FROM platform.otp_transaction
        WHERE created_at >= now() - (${days} * interval '1 day')
          AND "appId" = '${BUYER_APP}'`;
      const r = (await query<{ requested: number; verified: number }>(sql))[0] || { requested: 0, verified: 0 };
      return { requested: Number(r.requested), verified: Number(r.verified), successPct: r.requested ? (r.verified / r.requested) * 100 : 0, sql: displaySql(sql) };
    });
    return NextResponse.json({ ...payload, days, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
