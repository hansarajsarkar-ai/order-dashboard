import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  sellerBusinessName: string;
  sellerPhone: string | null;
  brand: string;
  sellerAddressLine1: string | null;
  sellerLandmark: string | null;
  sellerPincode: string | null;
  sellerCity: string | null;
  sellerDistrict: string | null;
  sellerState: string | null;
  poCount: string;
  orderAmount: string;
  c12: string;
  c23: string;
  c3plus: string;
}

async function _GET() {
  try {
    const sql = `
      WITH raw AS (
        SELECT
          s."businessName"                              AS "sellerBusinessName",
          s."phone"                                     AS "sellerPhone",
          TRIM(SPLIT_PART(s."businessName", '-', 1))    AS "brand",
          s."addressLine1"                              AS "sellerAddressLine1",
          s."landmark"                                  AS "sellerLandmark",
          s."pincode"                                   AS "sellerPincode",
          s."city"                                      AS "sellerCity",
          s."district"                                  AS "sellerDistrict",
          s."state"                                     AS "sellerState",
          (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0))                                   AS "amount",
          GREATEST(
            EXTRACT(EPOCH FROM (NOW() - po."markedInProgressTime"))
            - COALESCE((
                SELECT SUM(EXTRACT(EPOCH FROM (
                  LEAST(NOW(),                            d::timestamptz + INTERVAL '1 day')
                  - GREATEST(po."markedInProgressTime",   d::timestamptz)
                )))
                FROM generate_series(
                  po."markedInProgressTime"::date,
                  NOW()::date,
                  INTERVAL '1 day'
                ) AS d
                WHERE EXTRACT(DOW FROM d) = 0
              ), 0),
            0
          ) / 86400.0 AS "daysInProgress"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN LATERAL (
          SELECT d."id"
          FROM "deliveries"."intercityDelivery" d
          WHERE d."purchaseOrderId" = po."id"
            AND d."isTest" = FALSE
          ORDER BY d."created_at" DESC
          LIMIT 1
        ) di_latest ON TRUE
        JOIN "deliveries"."intercityDelivery" di
          ON di."id" = di_latest."id"
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        WHERE
              po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND di."isTest"          = FALSE
          AND po."status"               = 'INPROGRESS'
          AND po."markedInProgressTime" IS NOT NULL
      ),
      bucketed AS (
        SELECT
          "sellerBusinessName",
          "sellerPhone",
          "brand",
          "sellerAddressLine1",
          "sellerLandmark",
          "sellerPincode",
          "sellerCity",
          "sellerDistrict",
          "sellerState",
          "amount",
          CASE
            WHEN "daysInProgress" < 1 THEN '<1'
            WHEN "daysInProgress" < 2 THEN '12'
            WHEN "daysInProgress" < 3 THEN '23'
            ELSE '3plus'
          END AS "bucket"
        FROM raw
      )
      SELECT
        "sellerBusinessName",
        MAX("sellerPhone")                                                   AS "sellerPhone",
        MAX("brand")                                                         AS "brand",
        MAX("sellerAddressLine1")                                            AS "sellerAddressLine1",
        MAX("sellerLandmark")                                                AS "sellerLandmark",
        MAX("sellerPincode")                                                 AS "sellerPincode",
        MAX("sellerCity")                                                    AS "sellerCity",
        MAX("sellerDistrict")                                                AS "sellerDistrict",
        MAX("sellerState")                                                   AS "sellerState",
        COUNT(*)::text                                                       AS "poCount",
        SUM(COALESCE("amount", 0))::text                                     AS "orderAmount",
        COUNT(*) FILTER (WHERE "bucket" = '12')::text                        AS "c12",
        COUNT(*) FILTER (WHERE "bucket" = '23')::text                        AS "c23",
        COUNT(*) FILTER (WHERE "bucket" = '3plus')::text                     AS "c3plus"
      FROM bucketed
      WHERE "bucket" <> '<1'
      GROUP BY "sellerBusinessName"
      ORDER BY "sellerBusinessName" ASC;
    `;

    const rows = await query<Row>(sql, []);

    const data = rows.map((r) => ({
      sellerBusinessName: r.sellerBusinessName || '(unknown)',
      sellerPhone: r.sellerPhone,
      brand: r.brand || '(unknown)',
      sellerState: r.sellerState || null,
      sellerDistrict: r.sellerDistrict || null,
      sellerCity: r.sellerCity || null,
      sellerPincode: r.sellerPincode || null,
      sellerFullAddress: [
        r.sellerAddressLine1,
        r.sellerLandmark,
        r.sellerPincode,
        r.sellerCity,
        r.sellerDistrict,
        r.sellerState,
      ].filter((v) => v != null && String(v).trim() !== '').join(', ') || null,
      poCount: parseInt(r.poCount, 10) || 0,
      orderAmount: parseFloat(r.orderAmount) || 0,
      buckets: {
        '1-2 days': parseInt(r.c12, 10) || 0,
        '2-3 days': parseInt(r.c23, 10) || 0,
        '3+ days':  parseInt(r.c3plus, 10) || 0,
      },
    }));

    const grand = data.reduce(
      (acc, r) => {
        acc.poCount += r.poCount;
        acc.orderAmount += r.orderAmount;
        acc.buckets['1-2 days'] += r.buckets['1-2 days'];
        acc.buckets['2-3 days'] += r.buckets['2-3 days'];
        acc.buckets['3+ days']  += r.buckets['3+ days'];
        return acc;
      },
      {
        poCount: 0,
        orderAmount: 0,
        buckets: { '1-2 days': 0, '2-3 days': 0, '3+ days': 0 } as Record<string, number>,
      }
    );

    return NextResponse.json({
      data,
      grand,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
