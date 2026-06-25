import { NextResponse, NextRequest } from 'next/server';
import { query, displaySql } from '@/lib/db';
import { cached } from '@/lib/memoCache';
import { parseDateParams, dateClause, dateKey } from '@/lib/marketingCohort';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// OTP verification funnel (buyer app) from platform.otp_transaction.
// The honest funnel is per UNIQUE PHONE — of people who requested an OTP, how many
// verified (~94%). The per-transaction rate (~31%) is much lower only because users
// request multiple OTPs (resend/retry) before verifying, so it measures OTP friction,
// not user drop-off. We surface both: the phone funnel as the headline, transactions
// + attempts/phone as the friction signal.
const BUYER_APP_ID = '2391550b-7f93-4b02-8043-60a8646ec4f4';

interface Row { requested: string; verified: string; phones_requested: string; phones_verified: string }
interface TrendRow { day: string; phones_requested: string; phones_verified: string }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dp = parseDateParams(searchParams);

  try {
    const payload = await cached(`mkt:otp-funnel:${dateKey(dp)}`, 30 * 60_000, async () => {
      const params: (string | number)[] = [BUYER_APP_ID];
      const { clause } = dateClause('created_at', dp, params);
      const totalsSql = `
        SELECT COUNT(*)::text                                                AS requested,
               COUNT(*) FILTER (WHERE "wasOTPVerified")::text                AS verified,
               COUNT(DISTINCT "phoneNumber")::text                           AS phones_requested,
               COUNT(DISTINCT "phoneNumber") FILTER (WHERE "wasOTPVerified")::text AS phones_verified
        FROM platform.otp_transaction
        WHERE "appId" = $1 ${clause};
      `;
      const trendSql = `
        SELECT created_at::date::text                                        AS day,
               COUNT(DISTINCT "phoneNumber")::text                           AS phones_requested,
               COUNT(DISTINCT "phoneNumber") FILTER (WHERE "wasOTPVerified")::text AS phones_verified
        FROM platform.otp_transaction
        WHERE "appId" = $1 ${clause}
        GROUP BY 1 ORDER BY 1;
      `;
      const [tot, trend] = await Promise.all([query<Row>(totalsSql, params), query<TrendRow>(trendSql, params)]);
      const r = tot[0];
      const requested = parseInt(r?.requested || '0', 10);
      const verified = parseInt(r?.verified || '0', 10);
      const phonesRequested = parseInt(r?.phones_requested || '0', 10);
      const phonesVerified = parseInt(r?.phones_verified || '0', 10);
      return {
        requested,
        verified,
        phonesRequested,
        phonesVerified,
        phoneVerifyPct: phonesRequested ? (phonesVerified / phonesRequested) * 100 : 0,
        txnVerifyPct: requested ? (verified / requested) * 100 : 0,
        attemptsPerPhone: phonesRequested ? requested / phonesRequested : 0,
        trend: trend.map((t) => ({ day: t.day, requested: parseInt(t.phones_requested, 10), verified: parseInt(t.phones_verified, 10) })),
        sql: displaySql(totalsSql, params) + ';\n\n-- daily trend:\n' + displaySql(trendSql, params),
      };
    });
    return NextResponse.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
