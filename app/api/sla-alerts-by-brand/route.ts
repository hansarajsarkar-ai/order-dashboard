import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand: string;
  category: string;
  poCount: string;
  totalPoAmount: string;
}

interface BrandRow {
  brand: string;
  cells: Record<string, { count: number; amount: number }>;
  total: { count: number; amount: number };
}

const CATEGORIES = ['Fully_Paid', 'Partially_Paid', 'COD'] as const;

export async function GET() {
  try {
    // SLA breach = more than 2 elapsed days since markedPendingTime, with Sunday
    // time excluded, measured on the IST (Asia/Kolkata) calendar. Brands collapse
    // ChukDe / CHUKDE / Chuk De spelling variants into a single "ChukDe" brand.
    const sql = `
      WITH base AS (
        SELECT DISTINCT
          po."poNumber" AS "poNumber",
          po."markedPendingTime" AS "MarkedpendingTime",
          ROUND(
            GREATEST(
              EXTRACT(EPOCH FROM (
                (NOW() AT TIME ZONE 'Asia/Kolkata')
                - (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')
              ))
              - COALESCE((
                  SELECT SUM(EXTRACT(EPOCH FROM (
                    LEAST(NOW() AT TIME ZONE 'Asia/Kolkata',           d + INTERVAL '1 day')
                    - GREATEST(po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata', d)
                  )))
                  FROM generate_series(
                    (po."markedPendingTime" AT TIME ZONE 'Asia/Kolkata')::date,
                    (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
                    INTERVAL '1 day'
                  ) AS d
                  WHERE EXTRACT(DOW FROM d) = 0
                ), 0),
              0
            )::numeric / 86400.0,
            2
          )                                  AS "daysPassedExclSundays",
          pop."event"            AS "paymentEvent",
          s."businessName"       AS "sellerBusinessName",
          (po."amount" + COALESCE(po."platformMarginDiscount", 0))            AS "poAmount",
          po."paymentInfo"->>'option' AS "PaymentOption",
          dv."codAmountToBeCollected" AS "codAmountToBeCollected"
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        LEFT JOIN LATERAL (
          SELECT di."id" AS "deliveryId", di."trackingInfo", di."status", di."codAmountToBeCollected"
          FROM "deliveries"."intercityDelivery" di
          WHERE di."purchaseOrderId" = po."id"
          ORDER BY di."created_at" DESC
          LIMIT 1
        ) dv ON TRUE
        LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
               ON pop."purchaseOrderId" = po."id"
              AND pop."status" = 'COMPLETED'
              AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
        WHERE s."isD2RBrandSeller" = TRUE
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND po."isTest"          = FALSE
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."isFalseOrder"    = FALSE
          AND po."status"          = 'PENDING'
      ),
      dedup AS (
        SELECT DISTINCT ON ("poNumber")
          "poNumber",
          "MarkedpendingTime",
          "daysPassedExclSundays",
          "paymentEvent",
          "PaymentOption",
          "poAmount",
          "codAmountToBeCollected",
          "sellerBusinessName"
        FROM base
        WHERE "MarkedpendingTime" IS NOT NULL
        ORDER BY "poNumber",
                 CASE "paymentEvent" WHEN 'FULL_ADVANCE' THEN 1 WHEN 'PARTIAL_ADVANCE' THEN 2 ELSE 3 END,
                 "MarkedpendingTime" DESC
      ),
      breached AS (
        SELECT *
        FROM dedup
        WHERE "daysPassedExclSundays" > 2
      ),
      categorized AS (
        SELECT
          "poNumber",
          "poAmount",
          CASE
            WHEN LOWER(REPLACE(TRIM(SPLIT_PART("sellerBusinessName", '-', 1)), ' ', '')) = 'chukde'
              THEN 'ChukDe'
            ELSE TRIM(SPLIT_PART("sellerBusinessName", '-', 1))
          END                                          AS "brand",
          CASE
            WHEN "paymentEvent" = 'FULL_ADVANCE'                                THEN 'Fully_Paid'
            WHEN "paymentEvent" = 'PARTIAL_ADVANCE'                             THEN 'Partially_Paid'
            WHEN "PaymentOption" ILIKE '%cod%'
              OR COALESCE("codAmountToBeCollected", 0) > 0                      THEN 'COD'
            ELSE 'Other'
          END AS "category"
        FROM breached
      )
      SELECT
        "brand",
        "category",
        COUNT(*)::text                                  AS "poCount",
        SUM(COALESCE("poAmount", 0))::text              AS "totalPoAmount"
      FROM categorized
      GROUP BY "brand", "category"
      ORDER BY "brand" ASC;
    `;

    const rows = await query<Row>(sql, []);

    // Pivot into brand rows × category columns (excluding 'Other')
    const allowed = new Set<string>(CATEGORIES);
    const byBrand = new Map<string, BrandRow>();
    for (const r of rows) {
      if (!allowed.has(r.category)) continue; // skip 'Other'
      const key = r.brand;
      if (!byBrand.has(key)) {
        byBrand.set(key, {
          brand: r.brand,
          cells: Object.fromEntries(CATEGORIES.map((c) => [c, { count: 0, amount: 0 }])),
          total: { count: 0, amount: 0 },
        });
      }
      const row = byBrand.get(key)!;
      const count = parseInt(r.poCount, 10);
      const amount = parseFloat(r.totalPoAmount);
      row.cells[r.category] = { count, amount };
      row.total.count += count;
      row.total.amount += amount;
    }

    const data = Array.from(byBrand.values()).sort((a, b) => b.total.count - a.total.count);

    const totalsByCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c, { count: 0, amount: 0 }])
    ) as Record<string, { count: number; amount: number }>;
    let grandCount = 0;
    let grandAmount = 0;
    for (const row of data) {
      for (const c of CATEGORIES) {
        totalsByCategory[c].count += row.cells[c].count;
        totalsByCategory[c].amount += row.cells[c].amount;
      }
      grandCount += row.total.count;
      grandAmount += row.total.amount;
    }

    return NextResponse.json({
      data,
      categories: CATEGORIES,
      totalsByCategory,
      grandTotal: { count: grandCount, amount: grandAmount },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
