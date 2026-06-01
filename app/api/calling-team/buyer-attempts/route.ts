import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ATC Buyer Attempt-Rate analysis: did the calling team reach buyers who placed
// D2R intercity orders on the same day they ordered, or by the next day?
// Window is fixed at 3 months ending today; bucketed by day / week / month.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grainParam = (searchParams.get('granularity') || 'day').toLowerCase();
  const grain = (['day', 'week', 'month'] as const).includes(grainParam as 'day' | 'week' | 'month')
    ? (grainParam as 'day' | 'week' | 'month')
    : 'day';

  try {
    const rows = await query<{
      bucket: string;
      total_atc_buyer: string;
      attempted_same_day: string;
      attempt_rate_same_day: string | null;
      attempted_next_day_only: string;
      total_attempted_by_next_day: string;
      cumulative_attempt_rate: string | null;
    }>(
      `
      WITH call_log_phones AS (
        SELECT DISTINCT
          "start_date"::date AS call_date,
          CASE
            WHEN "call_to_number" LIKE '%-%'
              THEN RIGHT(REGEXP_REPLACE(SPLIT_PART("call_to_number", '-', 1), '[^0-9]', '', 'g'), 10)
            ELSE RIGHT(REGEXP_REPLACE("call_to_number", '[^0-9]', '', 'g'), 10)
          END AS phone
        FROM "smartFlo"."call_logs"
        WHERE "campaign_name" IN ('Cold Lead Campaign', 'Warm_Lead')
          AND LENGTH(REGEXP_REPLACE("call_to_number", '[^0-9]', '', 'g')) >= 10
          AND "start_date"::date >= CURRENT_DATE - INTERVAL '95 days'
      ),
      eligible_sellers AS (
        SELECT s."id" AS seller_id
        FROM "users"."seller" s
        WHERE s."isD2RBrandSeller" = TRUE
          AND s."isActive" = TRUE
          AND s."deliveryType" = 'INTERCITY'
          AND s."deliveryNetwork" = 'THIRD_PARTY'
          AND s."pickupAddressName" IS NOT NULL
          AND s."isTest" = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."businessName" NOT ILIKE '%milko%'
      ),
      eligible_seller_brands AS (
        SELECT sb."sellerId", sb."brandId"
        FROM "users"."seller_brand" sb
        WHERE sb."isActive" = TRUE
          AND sb."fulfilmentZone" IS NOT NULL
          AND sb."fulfilmentZone"::TEXT != '[]'
      ),
      order_base AS (
        SELECT
          po."created_at"::date AS order_date,
          b."id" AS buyer_id,
          RIGHT(REGEXP_REPLACE(b."phone", '[^0-9]', '', 'g'), 10) AS phone
        FROM "purchaseOrder"."purchaseOrderItem" poi
        JOIN "purchaseOrder"."purchaseOrder" po ON poi."purchaseOrderId" = po."id"
        JOIN eligible_sellers es ON po."sellerId" = es.seller_id
        JOIN eligible_seller_brands esb ON esb."brandId" = poi."brandId" AND esb."sellerId" = es.seller_id
        JOIN "users"."buyer" b ON b."id" = po."buyerId"
        WHERE po."isTest" = FALSE
          AND po."created_at"::date >= CURRENT_DATE - INTERVAL '3 months'
          AND b."isTest" = FALSE
          AND b."businessName" NOT ILIKE '%test%'
      ),
      joined AS (
        SELECT
          ob.order_date,
          ob.buyer_id,
          MAX(CASE WHEN cl.call_date = ob.order_date THEN 1 ELSE 0 END) AS called_same_day,
          MAX(CASE WHEN cl.call_date = ob.order_date + INTERVAL '1 day' THEN 1 ELSE 0 END) AS called_next_day
        FROM order_base ob
        LEFT JOIN call_log_phones cl
          ON cl.phone = ob.phone
          AND cl.call_date BETWEEN ob.order_date AND ob.order_date + INTERVAL '1 day'
        GROUP BY ob.order_date, ob.buyer_id
      )
      SELECT
        DATE_TRUNC('${grain}', order_date)::date::text                                        AS bucket,
        COUNT(DISTINCT buyer_id)::text                                                        AS total_atc_buyer,
        COUNT(DISTINCT CASE WHEN called_same_day = 1 THEN buyer_id END)::text                 AS attempted_same_day,
        ROUND(
          COUNT(DISTINCT CASE WHEN called_same_day = 1 THEN buyer_id END) * 100.0
          / NULLIF(COUNT(DISTINCT buyer_id), 0), 2
        )::text                                                                               AS attempt_rate_same_day,
        COUNT(DISTINCT CASE WHEN called_next_day = 1 AND called_same_day = 0 THEN buyer_id END)::text AS attempted_next_day_only,
        COUNT(DISTINCT CASE WHEN called_same_day = 1 OR called_next_day = 1 THEN buyer_id END)::text  AS total_attempted_by_next_day,
        ROUND(
          COUNT(DISTINCT CASE WHEN called_same_day = 1 OR called_next_day = 1 THEN buyer_id END) * 100.0
          / NULLIF(COUNT(DISTINCT buyer_id), 0), 2
        )::text                                                                               AS cumulative_attempt_rate
      FROM joined
      GROUP BY bucket
      ORDER BY bucket DESC
      `,
    );

    const result = rows.map((r) => ({
      bucket: r.bucket,
      totalAtcBuyer: Number(r.total_atc_buyer || 0),
      attemptedSameDay: Number(r.attempted_same_day || 0),
      attemptRateSameDay: Number(r.attempt_rate_same_day || 0),
      attemptedNextDayOnly: Number(r.attempted_next_day_only || 0),
      totalAttemptedByNextDay: Number(r.total_attempted_by_next_day || 0),
      cumulativeAttemptRate: Number(r.cumulative_attempt_rate || 0),
    }));

    return NextResponse.json({ granularity: grain, rows: result });
  } catch (err) {
    console.error('buyer-attempts error', err);
    return NextResponse.json({ error: 'Failed to load buyer attempt data' }, { status: 500 });
  }
}
