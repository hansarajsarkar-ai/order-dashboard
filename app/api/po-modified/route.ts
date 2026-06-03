import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

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
  brandName: string | null;
  buyerBusiness: string | null;
  buyerPhone: string | null;
  paymentMode: string | null;
  remarks: string | null;
}

export async function GET(req: NextRequest) {
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
        po."poNumber"          AS po_number,
        po."markedPendingTime" AS order_ts,
        po."originalPOAmount"  AS prev_amount,
        po."amount"            AS new_amount,
        po."status"            AS po_status,
        TRIM(SPLIT_PART(s."businessName", '-', 1)) AS brand_name,
        b."businessName"       AS buyer_business,
        b."phone"              AS buyer_phone,
        po."paymentInfo"->>'option' AS payment_mode,
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
    )
    SELECT
      po_number::text                                       AS "poNumber",
      MAX(order_ts)                                         AS "orderTs",
      TO_CHAR(MAX(order_ts), 'DD Mon YYYY HH12:MI AM')      AS "orderDateTime",
      MAX(prev_amount)                                      AS "prevAmount",
      MAX(new_amount)                                       AS "newAmount",
      MAX(po_status)                                        AS "poStatus",
      MAX(brand_name)                                       AS "brandName",
      MAX(buyer_business)                                   AS "buyerBusiness",
      MAX(buyer_phone)                                      AS "buyerPhone",
      MAX(payment_mode)                                     AS "paymentMode",
      STRING_AGG(DISTINCT change_type, ', ')                AS "remarks"
    FROM seller_mods
    GROUP BY po_number
    ORDER BY MAX(order_ts) DESC;
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
        brandName: r.brandName,
        buyerBusiness: r.buyerBusiness,
        buyerPhone: r.buyerPhone,
        paymentMode: r.paymentMode,
        remarks: r.remarks,
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
        return acc;
      },
      { modifiedPos: 0, itemRemovedPos: 0, qtyDecreasedPos: 0, prevAmountSum: 0, newAmountSum: 0, valueLost: 0 }
    );

    return NextResponse.json({ data, kpis, timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
