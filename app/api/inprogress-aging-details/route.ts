import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  orderDateTime: string | null;
  inProgressDateTime: string | null;
  itlDateTime: string | null;
  poNumber: string;
  poStatus: string;
  daysInProgress: string;
  orderAmount: string | null;
  couponValue: string | null;
  paymentMode: string | null;
  brandName: string | null;
  shipmentStatus: string | null;
  awbNumber: string | null;
  logisticName: string | null;
  codCollect: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
  buyerPhone: string | null;
  buyerFullAddress: string | null;
  buyerLongitude: string | null;
  buyerLatitude: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  bucket: string;
}

const BUCKET_FILTERS: Record<string, string> = {
  '1-2 days': `"bucket" = '1-2 days'`,
  '2-3 days': `"bucket" = '2-3 days'`,
  '3+ days':  `"bucket" = '3+ days'`,
  'all':      `"bucket" <> '<1 day'`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  const bucket = searchParams.get('bucket') || 'all';

  const bucketClause = BUCKET_FILTERS[bucket] || BUCKET_FILTERS['all'];

  try {
    const params: (string | number)[] = [];
    let brandClause = '';
    if (brand) {
      params.push(brand);
      brandClause = `AND TRIM(SPLIT_PART(s."businessName", '-', 1)) = $${params.length}`;
    }

    const sql = `
      WITH raw AS (
        SELECT
          TO_CHAR(po."markedPendingTime",    'DD Mon YYYY HH12:MI AM') AS "orderDateTime",
          TO_CHAR(po."markedInProgressTime", 'DD Mon YYYY HH12:MI AM') AS "inProgressDateTime",
          TO_CHAR(di."created_at",           'DD Mon YYYY HH12:MI AM') AS "itlDateTime",
          po."poNumber"::text AS "poNumber",
          po."status"         AS "poStatus",
          GREATEST(
            EXTRACT(EPOCH FROM (NOW() - po."markedInProgressTime"))
            - COALESCE((
                SELECT SUM(EXTRACT(EPOCH FROM (
                  LEAST(NOW(),                          d::timestamptz + INTERVAL '1 day')
                  - GREATEST(po."markedInProgressTime", d::timestamptz)
                )))
                FROM generate_series(
                  po."markedInProgressTime"::date,
                  NOW()::date,
                  INTERVAL '1 day'
                ) AS d
                WHERE EXTRACT(DOW FROM d) = 0
              ), 0),
            0
          )::numeric / 86400.0 AS "daysInProgress",
          po."amount"::text                              AS "orderAmount",
          COALESCE(po."appliedOfferDiscount", 0)::text   AS "couponValue",
          po."paymentInfo"->>'option'                    AS "paymentMode",
          TRIM(SPLIT_PART(s."businessName", '-', 1))     AS "brandName",
          di."status"                                    AS "shipmentStatus",
          di."trackingInfo"->>'awbNumber'                AS "awbNumber",
          di."trackingInfo"->>'courierName'              AS "logisticName",
          COALESCE(di."codAmountToBeCollected", 0)::text AS "codCollect",
          b."name"                                       AS "buyerName",
          b."businessName"                               AS "buyerBusinessName",
          b."phone"                                      AS "buyerPhone",
          CONCAT_WS(', ', b."addressLine1", b."addressLine2", UPPER(b."landmark"), b."city", b."district", b."state", b."pincode") AS "buyerFullAddress",
          b."longitude"::text                            AS "buyerLongitude",
          b."lattitude"::text                            AS "buyerLatitude",
          s."name"                                       AS "sellerName",
          s."phone"                                      AS "sellerPhone",
          po."markedInProgressTime"                      AS "_sort"
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
          ${brandClause}
      ),
      labeled AS (
        SELECT
          *,
          CASE
            WHEN "daysInProgress" < 1 THEN '<1 day'
            WHEN "daysInProgress" < 2 THEN '1-2 days'
            WHEN "daysInProgress" < 3 THEN '2-3 days'
            ELSE '3+ days'
          END AS "bucket"
        FROM raw
      )
      SELECT
        "orderDateTime",
        "inProgressDateTime",
        "itlDateTime",
        "poNumber",
        "poStatus",
        ROUND("daysInProgress"::numeric, 2) AS "daysInProgress",
        "orderAmount",
        "couponValue",
        "paymentMode",
        "brandName",
        "shipmentStatus",
        "awbNumber",
        "logisticName",
        "codCollect",
        "buyerName",
        "buyerBusinessName",
        "buyerPhone",
        "buyerFullAddress",
        "buyerLongitude",
        "buyerLatitude",
        "sellerName",
        "sellerPhone",
        "bucket"
      FROM labeled
      WHERE ${bucketClause}
      ORDER BY "_sort" DESC
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      orderDateTime: r.orderDateTime,
      inProgressDateTime: r.inProgressDateTime,
      itlDateTime: r.itlDateTime,
      poNumber: r.poNumber,
      poStatus: r.poStatus,
      daysInProgress: r.daysInProgress != null ? parseFloat(r.daysInProgress) : null,
      orderAmount: r.orderAmount != null ? parseFloat(r.orderAmount) : null,
      couponValue: r.couponValue != null ? parseFloat(r.couponValue) : 0,
      paymentMode: r.paymentMode,
      brandName: r.brandName,
      shipmentStatus: r.shipmentStatus,
      awbNumber: r.awbNumber,
      logisticName: r.logisticName,
      codCollect: r.codCollect != null ? parseFloat(r.codCollect) : 0,
      buyerName: r.buyerName,
      buyerBusinessName: r.buyerBusinessName,
      buyerPhone: r.buyerPhone,
      buyerFullAddress: r.buyerFullAddress,
      buyerLongitude: r.buyerLongitude,
      buyerLatitude: r.buyerLatitude,
      sellerName: r.sellerName,
      sellerPhone: r.sellerPhone,
      bucket: r.bucket,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      brand: brand || null,
      bucket,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
