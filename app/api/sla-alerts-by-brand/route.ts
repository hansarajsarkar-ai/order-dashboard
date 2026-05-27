import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  brand: string;
  sellerBusinessName: string;
  sellerPhone: string | null;
  category: string;
  poCount: string;
  totalPoAmount: string;
}

interface BrandRow {
  brand: string;
  sellerBusinessName: string;
  sellerPhone: string | null;
  cells: Record<string, { count: number; amount: number }>;
  total: { count: number; amount: number };
}

const CATEGORIES = ['Fully_Paid', 'Partially_Paid', 'COD'] as const;

export async function GET() {
  try {
    const sql = `
      WITH base AS (
        SELECT DISTINCT
          po."poNumber" AS "poNumber",
          po."markedPendingTime" AS "MarkedpendingTime",
          pop."event"            AS "paymentEvent",
          s."businessName"       AS "sellerBusinessName",
          s."phone"              AS "sellerPhone",
          po."amount"            AS "poAmount",
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
          "paymentEvent",
          "PaymentOption",
          "poAmount",
          "codAmountToBeCollected",
          "sellerBusinessName",
          "sellerPhone"
        FROM base
        WHERE "MarkedpendingTime" IS NOT NULL
        ORDER BY "poNumber",
                 CASE "paymentEvent" WHEN 'FULL_ADVANCE' THEN 1 WHEN 'PARTIAL_ADVANCE' THEN 2 ELSE 3 END,
                 "MarkedpendingTime" DESC
      ),
      sla_step1 AS (
        SELECT
          *,
          "MarkedpendingTime"
            + INTERVAL '1 day'
            + CASE WHEN EXTRACT(DOW FROM "MarkedpendingTime" + INTERVAL '1 day') = 0
                   THEN INTERVAL '1 day' ELSE INTERVAL '0' END
            AS "sla_after_1wd"
        FROM dedup
      ),
      sla_deadline AS (
        SELECT
          *,
          "sla_after_1wd"
            + INTERVAL '1 day'
            + CASE WHEN EXTRACT(DOW FROM "sla_after_1wd" + INTERVAL '1 day') = 0
                   THEN INTERVAL '1 day' ELSE INTERVAL '0' END
            AS "sla_breach_at"
        FROM sla_step1
      ),
      breached AS (
        SELECT *
        FROM sla_deadline
        WHERE NOW() >= "sla_breach_at"
      ),
      categorized AS (
        SELECT
          "poNumber",
          "poAmount",
          "sellerBusinessName",
          "sellerPhone",
          TRIM(SPLIT_PART("sellerBusinessName", '-', 1)) AS "brand",
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
        "sellerBusinessName",
        "sellerPhone",
        "category",
        COUNT(*)::text                                  AS "poCount",
        SUM(COALESCE("poAmount", 0))::text              AS "totalPoAmount"
      FROM categorized
      GROUP BY "brand", "sellerBusinessName", "sellerPhone", "category"
      ORDER BY "sellerBusinessName" ASC;
    `;

    const rows = await query<Row>(sql, []);

    // Pivot into brand rows × category columns (excluding 'Other')
    const allowed = new Set<string>(CATEGORIES);
    const byBrand = new Map<string, BrandRow>();
    for (const r of rows) {
      if (!allowed.has(r.category)) continue; // skip 'Other'
      const key = r.sellerBusinessName;
      if (!byBrand.has(key)) {
        byBrand.set(key, {
          brand: r.brand,
          sellerBusinessName: r.sellerBusinessName,
          sellerPhone: r.sellerPhone,
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
