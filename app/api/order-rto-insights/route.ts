import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * RTO insights for the Trend tab — three cross-cuts of RTO behaviour on D2R
 * third-party INTERCITY orders, all bucketed by markedPendingTime date window:
 *   1. COD vs Coupon Applied vs RTO        (coupon status × payment mode)
 *   2. Order Amount Bucket wise RTO Count  (order-value bands)
 *   3. RTO by TIER 1/2/3/4 City            (city-tier contribution to RTO)
 *
 * Optional startDate / endDate (YYYY-MM-DD) bound the window; omitted = all-time.
 */

interface CodCouponRow {
  couponStatus: string;
  paymentMode: string;
  totalOrders: string;
  deliveredCount: string;
  rtoCount: string;
  rtoPct: string | null;
}
interface BucketRow {
  bucket: string;
  deliveredCount: string;
  rtoCount: string;
  rtoPct: string | null;
  rtoAmount: string;
  rtoAmountPct: string | null;
}
interface TierRow {
  cityTier: string;
  rtoOrders: string;
  contributionPct: string | null;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  const params: unknown[] = [];
  const conds: string[] = [];
  if (startDate && iso.test(startDate)) {
    params.push(startDate);
    conds.push(`po."markedPendingTime"::date >= $${params.length}`);
  }
  if (endDate && iso.test(endDate)) {
    params.push(endDate);
    conds.push(`po."markedPendingTime"::date <= $${params.length}`);
  }
  const dateFilter = conds.length ? `AND ${conds.join(' AND ')}` : '';

  // Shared scope filters (D2R third-party INTERCITY, non-test).
  const baseWhere = `
    po."isTest" = FALSE
    AND po."isFalseOrder" = FALSE
    AND po."status" <> 'DRAFT'
    AND po."deliveryType" = 'INTERCITY'
    AND po."deliveryNetwork" = 'THIRD_PARTY'
    AND b."isTest" = FALSE
    AND b."businessName" NOT ILIKE '%test%'
    AND s."isTest" = FALSE
    AND s."businessName" NOT ILIKE '%test%'
    ${dateFilter}
  `;

  const codCouponSql = `
    SELECT
      CASE WHEN po."appliedOfferReservationId" IS NOT NULL THEN 'Coupon Applied' ELSE 'No Coupon' END AS "couponStatus",
      CASE WHEN UPPER(po."paymentInfo"->>'option') = 'COD' THEN 'COD' ELSE 'Prepaid' END AS "paymentMode",
      COUNT(DISTINCT po."poNumber") AS "totalOrders",
      COUNT(DISTINCT po."poNumber") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')) AS "deliveredCount",
      COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO') AS "rtoCount",
      ROUND(100.0 * COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO')
        / NULLIF(COUNT(DISTINCT po."poNumber") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))
          + COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO'), 0), 2) AS "rtoPct"
    FROM "purchaseOrder"."purchaseOrder" po
    JOIN "users"."buyer" b ON b."id" = po."buyerId"
    JOIN "users"."seller" s ON s."id" = po."sellerId"
    WHERE ${baseWhere}
    GROUP BY 1, 2
    ORDER BY "rtoCount" DESC NULLS LAST;
  `;

  const bucketSql = `
    SELECT
      CASE
        WHEN (po."amount" + COALESCE(po."platformMarginDiscount", 0)) < 1000 THEN '0-1000'
        WHEN (po."amount" + COALESCE(po."platformMarginDiscount", 0)) < 2000 THEN '1000-2000'
        WHEN (po."amount" + COALESCE(po."platformMarginDiscount", 0)) < 3000 THEN '2000-3000'
        WHEN (po."amount" + COALESCE(po."platformMarginDiscount", 0)) < 5000 THEN '3000-5000'
        ELSE '5000+'
      END AS "bucket",
      COUNT(DISTINCT po."poNumber") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')) AS "deliveredCount",
      COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO') AS "rtoCount",
      ROUND(100.0 * COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO')
        / NULLIF(COUNT(DISTINCT po."poNumber") FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED'))
          + COUNT(DISTINCT po."poNumber") FILTER (WHERE po."deliveryStatus" = 'RTO'), 0), 2) AS "rtoPct",
      COALESCE(ROUND(SUM((po."amount" + COALESCE(po."platformMarginDiscount", 0))) FILTER (WHERE po."deliveryStatus" = 'RTO'), 0), 0) AS "rtoAmount",
      ROUND(100.0 * COALESCE(SUM((po."amount" + COALESCE(po."platformMarginDiscount", 0))) FILTER (WHERE po."deliveryStatus" = 'RTO'), 0)
        / NULLIF(COALESCE(SUM((po."amount" + COALESCE(po."platformMarginDiscount", 0))) FILTER (WHERE po."status" IN ('DELIVERED','COMPLETED')), 0)
          + COALESCE(SUM((po."amount" + COALESCE(po."platformMarginDiscount", 0))) FILTER (WHERE po."deliveryStatus" = 'RTO'), 0), 0), 2) AS "rtoAmountPct"
    FROM "purchaseOrder"."purchaseOrder" po
    JOIN "users"."buyer" b ON b."id" = po."buyerId"
    JOIN "users"."seller" s ON s."id" = po."sellerId"
    WHERE ${baseWhere}
    GROUP BY 1
    ORDER BY CASE
      WHEN MIN((po."amount" + COALESCE(po."platformMarginDiscount", 0))) < 1000 THEN 1
      WHEN MIN((po."amount" + COALESCE(po."platformMarginDiscount", 0))) < 2000 THEN 2
      WHEN MIN((po."amount" + COALESCE(po."platformMarginDiscount", 0))) < 3000 THEN 3
      WHEN MIN((po."amount" + COALESCE(po."platformMarginDiscount", 0))) < 5000 THEN 4
      ELSE 5
    END;
  `;

  const tierSql = `
    WITH base AS (
      SELECT DISTINCT ON (po."poNumber")
        po."poNumber",
        CASE
          WHEN LOWER(TRIM(b."city")) IN (
            'ahmedabad','bangalore','bankura','calcutta','chennai','darbhanga','delhi',
            'ernakulam','hyderabad','jaipur','mumbai','pune','sitapur','siwan','surat','unnao','kolkata'
          ) THEN 'Tier 1'
          WHEN LOWER(TRIM(b."city")) IN (
            'agra','aligarh','allahabad','amritsar','asansol','aurangabad','balaji nagar',
            'bharatpur','bhilai','bhopal','coimbatore','dhanbad','faridabad','gandhidham',
            'gauhati','ghaziabad','goa','gwalior','hassan','hathras','howrah','hubli',
            'indore','jabalpur','jamshedpur','jodhpur','kalyan','kanpur','kota','lucknow',
            'ludhiana','madurai','mandsaur','meerut city','nagaon','nagpur','nasik','palwal',
            'patna','raipur','rajkot','ranchi','rudrapur','srinagar','thane',
            'tiruppurampayam','vadodara','varanasi','vijayawada','virar',
            'visakhapatnam','vizag'
          ) THEN 'Tier 2'
          WHEN LOWER(TRIM(b."city")) IN (
            'bareilly','bhubaneswar','chandigarh','gurgaon','jalandhar','kolhapur',
            'moradabad','mysore','salem','solapur','thiruvananthapuram',
            'tiruchirappalli','tirupur','trivandrum','warangal',
            'agartala','ajmer','akola','amravati','anand','barddhaman','bhavnagar',
            'bhiwandi','bikaner','bilaspur','bokaro steel city','burdwan','calicut',
            'cherthala','cuttack','dehra dun','dhule','durgapur','firozabad',
            'gorakhpur','gulbarga','guntur','jalgaon','jammu','jamnagar','jhansi',
            'junagadh','kayamkulam','kochi','loni','nallasopara','nanded','nellore',
            'noida','panvel','pondicherry','raurkela','rourkela','saharanpur',
            'sangli','siliguri','ujjain','ulhasnagar'
          ) THEN 'Tier 3'
          ELSE 'Tier 4'
        END AS city_tier
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE ${baseWhere}
        AND po."deliveryStatus" = 'RTO'
    )
    SELECT
      city_tier AS "cityTier",
      COUNT(*) AS "rtoOrders",
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS "contributionPct"
    FROM base
    GROUP BY city_tier
    ORDER BY "rtoOrders" DESC;
  `;

  try {
    const [codCoupon, bucket, tier] = await Promise.all([
      query<CodCouponRow>(codCouponSql, params),
      query<BucketRow>(bucketSql, params),
      query<TierRow>(tierSql, params),
    ]);

    return NextResponse.json({
      codCoupon: codCoupon.map((r) => ({
        couponStatus: r.couponStatus,
        paymentMode: r.paymentMode,
        totalOrders: Number(r.totalOrders) || 0,
        deliveredCount: Number(r.deliveredCount) || 0,
        rtoCount: Number(r.rtoCount) || 0,
        rtoPct: r.rtoPct === null ? null : Number(r.rtoPct),
      })),
      bucket: bucket.map((r) => ({
        bucket: r.bucket,
        deliveredCount: Number(r.deliveredCount) || 0,
        rtoCount: Number(r.rtoCount) || 0,
        rtoPct: r.rtoPct === null ? null : Number(r.rtoPct),
        rtoAmount: Number(r.rtoAmount) || 0,
        rtoAmountPct: r.rtoAmountPct === null ? null : Number(r.rtoAmountPct),
      })),
      tier: tier.map((r) => ({
        cityTier: r.cityTier,
        rtoOrders: Number(r.rtoOrders) || 0,
        contributionPct: r.contributionPct === null ? null : Number(r.contributionPct),
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
