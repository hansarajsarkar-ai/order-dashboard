import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * PO Modified dashboard — purchase orders where a SELLER removed an item or
 * decreased its quantity (unavailability), on D2R third-party INTERCITY orders.
 * One row per PO with the change summary + before/after amounts, bucketed by
 * markedPendingTime. Optional startDate / endDate (YYYY-MM-DD) bound the window.
 */

interface Row {
  poNumber: string | null;
  orderTs: string;
  orderDateTime: string | null;
  prevAmount: string | null;
  newAmount: string | null;
  poStatus: string | null;
  shipmentStatus: string | null;
  brandName: string | null;
  buyerBusiness: string | null;
  buyerPhone: string | null;
  paymentMode: string | null;
  paidAmount: string | null;
  buyerInformed: string | null;
  remarks: string | null;
  refundableAmount: string | null;
  refundStatus: string | null;
  refundAmount: string | null;
  refundTime: string | null;
  refundId: string | null;
  refundType: string | null;
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

  const sql = `
    WITH seller_mods AS (
      SELECT
        po."id"                AS po_id,
        po."poNumber"          AS po_number,
        po."markedPendingTime" AS order_ts,
        po."originalPOAmount"  AS prev_amount,
        po."amount"            AS new_amount,
        po."refundableAmount"  AS refundable_amount,
        po."status"            AS po_status,
        TRIM(SPLIT_PART(s."businessName", '-', 1)) AS brand_name,
        b."businessName"       AS buyer_business,
        b."phone"              AS buyer_phone,
        po."paymentInfo"->>'option' AS payment_mode,
        po."poModifiedBuyerInformed" AS buyer_informed,
        CASE
          WHEN poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL     THEN 'Item Removed'
          WHEN poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL THEN 'Quantity Decreased'
        END AS change_type
      FROM "purchaseOrder"."purchaseOrderItem" poi
      JOIN "purchaseOrder"."purchaseOrder" po ON po."id" = poi."purchaseOrderId"
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE
        po."isTest" = FALSE
        AND po."isFalseOrder" = FALSE
        AND po."status" NOT IN ('DRAFT','CANCELLED')
        AND po."deliveryType" = 'INTERCITY'
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND poi."status" <> 'DRAFT'
        AND poi."modifiedByRole" ILIKE 'seller'
        AND (
             (poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL)
          OR (poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL)
        )
        ${dateFilter}
    ),
    per_po AS (
      SELECT
        po_number,
        MAX(po_id)                              AS po_id,
        MAX(order_ts)                           AS order_ts,
        MAX(prev_amount)                        AS prev_amount,
        MAX(new_amount)                         AS new_amount,
        MAX(refundable_amount)                  AS refundable_amount,
        MAX(po_status)                          AS po_status,
        MAX(brand_name)                         AS brand_name,
        MAX(buyer_business)                     AS buyer_business,
        MAX(buyer_phone)                        AS buyer_phone,
        MAX(payment_mode)                       AS payment_mode,
        MAX(buyer_informed)                     AS buyer_informed,
        STRING_AGG(DISTINCT change_type, ', ')  AS remarks
      FROM seller_mods
      GROUP BY po_number
    )
    SELECT
      p.po_number::text                                     AS "poNumber",
      p.order_ts                                            AS "orderTs",
      TO_CHAR(p.order_ts, 'DD Mon YYYY HH12:MI AM')         AS "orderDateTime",
      p.prev_amount                                         AS "prevAmount",
      p.new_amount                                          AS "newAmount",
      p.po_status                                           AS "poStatus",
      dv."shipmentStatus"                                   AS "shipmentStatus",
      p.brand_name                                          AS "brandName",
      p.buyer_business                                      AS "buyerBusiness",
      p.buyer_phone                                         AS "buyerPhone",
      p.payment_mode                                        AS "paymentMode",
      pay."paidAmount"                                      AS "paidAmount",
      p.buyer_informed                                      AS "buyerInformed",
      p.remarks                                             AS "remarks",
      p.refundable_amount                                   AS "refundableAmount",
      rf."refundStatus"                                     AS "refundStatus",
      rf."refundAmount"                                     AS "refundAmount",
      TO_CHAR(rf."refundInitiationTime", 'DD Mon YYYY HH12:MI AM') AS "refundTime",
      rf."id"                                               AS "refundId",
      rf."refundType"                                       AS "refundType"
    FROM per_po p
    LEFT JOIN LATERAL (
      -- Latest shipment/delivery record for this PO (third-party intercity leg).
      SELECT di."status" AS "shipmentStatus"
      FROM "deliveries"."intercityDelivery" di
      WHERE di."purchaseOrderId" = p.po_id
      ORDER BY di."created_at" DESC
      LIMIT 1
    ) dv ON TRUE
    LEFT JOIN LATERAL (
      -- The refund record for this PO: prefer a COMPLETED refund, else the latest attempt.
      SELECT pop."id", pop."refundStatus", pop."refundAmount", pop."refundInitiationTime", pop."refundType"
      FROM "purchaseOrder"."purchaseOrderPayment" pop
      WHERE pop."purchaseOrderId" = p.po_id
        AND pop."refundStatus" IS NOT NULL
      ORDER BY (pop."refundStatus" = 'COMPLETED') DESC, pop."refundInitiationTime" DESC NULLS LAST
      LIMIT 1
    ) rf ON TRUE
    LEFT JOIN LATERAL (
      -- How much the buyer actually paid up-front (completed advance payment).
      SELECT pop."paidAmount"
      FROM "purchaseOrder"."purchaseOrderPayment" pop
      WHERE pop."purchaseOrderId" = p.po_id
        AND pop."status" = 'COMPLETED'
        AND pop."event" IN ('FULL_ADVANCE','PARTIAL_ADVANCE')
      ORDER BY pop."created_at" DESC
      LIMIT 1
    ) pay ON TRUE
    ORDER BY p.order_ts DESC;
  `;

  try {
    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => {
      const prev = Number(r.prevAmount) || 0;
      const next = Number(r.newAmount) || 0;
      return {
        poNumber: r.poNumber,
        orderTs: r.orderTs,
        orderDateTime: r.orderDateTime,
        prevAmount: prev,
        newAmount: next,
        valueLost: Math.max(prev - next, 0),
        poStatus: r.poStatus,
        shipmentStatus: r.shipmentStatus,
        brandName: r.brandName,
        buyerBusiness: r.buyerBusiness,
        buyerPhone: r.buyerPhone,
        paymentMode: r.paymentMode,
        paidAmount: r.paidAmount == null ? null : Number(r.paidAmount),
        buyerInformed: r.buyerInformed,
        remarks: r.remarks,
        refundableAmount: Number(r.refundableAmount) || 0,
        refundStatus: r.refundStatus,
        refundAmount: r.refundAmount == null ? null : Number(r.refundAmount),
        refundTime: r.refundTime,
        refundId: r.refundId,
        refundType: r.refundType,
      };
    });

    const kpis = data.reduce(
      (acc, d) => {
        acc.modifiedPos += 1;
        if (d.remarks?.includes('Item Removed')) acc.itemRemovedPos += 1;
        if (d.remarks?.includes('Quantity Decreased')) acc.qtyDecreasedPos += 1;
        acc.prevAmountSum += d.prevAmount;
        acc.newAmountSum += d.newAmount;
        acc.valueLost += d.valueLost;
        acc.refundableTotal += d.refundableAmount;
        if (d.refundStatus === 'COMPLETED') {
          acc.refundCompletedPos += 1;
          acc.refundCompletedAmount += d.refundAmount ?? 0;
        } else if (d.refundableAmount > 0) {
          acc.refundPendingPos += 1;
        }
        return acc;
      },
      { modifiedPos: 0, itemRemovedPos: 0, qtyDecreasedPos: 0, prevAmountSum: 0, newAmountSum: 0, valueLost: 0, refundableTotal: 0, refundCompletedPos: 0, refundCompletedAmount: 0, refundPendingPos: 0 }
    );

    return NextResponse.json({ data, kpis, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
