import { NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  category: string;
  poCount: string;
  totalPoAmount: string;
}

async function _GET() {
  try {
    const sql = `
      WITH base AS (
        SELECT DISTINCT
          po."poNumber" AS "poNumber",
          po."markedPendingTime" AS "MarkedpendingTime",
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
        "category",
        COUNT(*)::text                                                          AS "poCount",
        SUM(COALESCE("poAmount", 0))::text                                      AS "totalPoAmount"
      FROM categorized
      GROUP BY "category"
      ORDER BY
        CASE "category"
          WHEN 'Fully_Paid'     THEN 1
          WHEN 'Partially_Paid' THEN 2
          WHEN 'COD'            THEN 3
          ELSE 4
        END;
    `;

    const rows = await query<Row>(sql, []);

    const data = rows.map((r) => ({
      category: r.category,
      poCount: parseInt(r.poCount, 10),
      totalPoAmount: parseFloat(r.totalPoAmount),
    }));

    const totals = data.reduce(
      (acc, r) => ({ count: acc.count + r.poCount, amount: acc.amount + r.totalPoAmount }),
      { count: 0, amount: 0 }
    );

    return NextResponse.json({
      data,
      totals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
