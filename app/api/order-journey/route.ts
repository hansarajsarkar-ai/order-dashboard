import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Order Journey (D2R) — full lifecycle of a single PO by its poNumber.
 *
 * Returns the order header, the chronological journey (each milestone with the
 * timestamp it was reached), and the line items. Restricted to D2R orders:
 * the seller must be a D2R brand seller and the PO must be INTERCITY. If the PO
 * exists but is not D2R, `isD2R` is false (the UI shows a notice).
 *
 * Journey is reconstructed from the marked*Time columns on
 * "purchaseOrder"."purchaseOrder" — there is no separate event log, so a NULL
 * timestamp means that milestone was never reached.
 */

interface PoRow {
  id: string;
  poNumber: number;
  status: string | null;
  deliveryStatus: string | null;
  deliveryType: string | null;
  deliveryNetwork: string | null;
  isD2R: boolean | null;
  sellerName: string | null;
  buyerName: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  buyerCity: string | null;
  buyerState: string | null;
  amount: string | null;
  itemTotal: string | null;
  discount: string | null;
  totalDiscount: string | null;
  distance: string | null;
  awb: string | null;
  lastMileInvoiceNumber: string | null;
  firstMileDeliveryId: string | null;
  lastMileDeliveryId: string | null;
  poRatingFromBuyer: string | null;
  poRatingFromSeller: string | null;
  isFalseOrder: boolean | null;
  isAutoRejected: boolean | null;
  isRTOReceived: boolean | null;
  cancelReason: string | null;
  rejectReason: string | null;
  // journey timestamps
  createdAt: string | null;
  markedPendingTime: string | null;
  markedInProgressTime: string | null;
  markedVerifiedTime: string | null;
  plannedDispatchTime: string | null;
  markedDispatchedTime: string | null;
  markedInTransitTime: string | null;
  markedDeliveredTime: string | null;
  markedCompletedTime: string | null;
  markedPartialTime: string | null;
  markedRejectedTime: string | null;
  markedCancelledTime: string | null;
  markedFalseOrderTime: string | null;
}

interface ItemRow {
  skuLabel: string | null;
  brandLabel: string | null;
  status: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  total: string | null;
  isRejected: boolean | null;
  rejectedComment: string | null;
}

// Canonical happy-path milestones, in order. `kind: 'step'` are the normal
// forward flow; `kind: 'exception'` are terminal-negative states that only
// render when they actually have a timestamp.
const STAGE_DEFS: { key: keyof PoRow; label: string; kind: 'step' | 'exception' }[] = [
  { key: 'markedPendingTime', label: 'Order Placed', kind: 'step' },
  { key: 'markedInProgressTime', label: 'Accepted (In Progress)', kind: 'step' },
  { key: 'markedVerifiedTime', label: 'Verified', kind: 'step' },
  { key: 'markedDispatchedTime', label: 'Dispatched', kind: 'step' },
  { key: 'markedInTransitTime', label: 'In Transit', kind: 'step' },
  { key: 'markedDeliveredTime', label: 'Delivered', kind: 'step' },
  { key: 'markedCompletedTime', label: 'Completed', kind: 'step' },
  { key: 'markedPartialTime', label: 'Marked Partial', kind: 'exception' },
  { key: 'markedRejectedTime', label: 'Rejected', kind: 'exception' },
  { key: 'markedCancelledTime', label: 'Cancelled', kind: 'exception' },
  { key: 'markedFalseOrderTime', label: 'Marked False Order', kind: 'exception' },
];
// NOTE: autoRejectionTime is intentionally excluded — it is a *scheduled*
// auto-rejection deadline stamped on most orders (incl. completed ones), not an
// actual event. Real auto-rejections land on markedRejectedTime (status REJECTED).

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  try {
    const poSql = `
      SELECT
        po."id"                       AS "id",
        po."poNumber"                 AS "poNumber",
        po."status"                   AS "status",
        po."deliveryStatus"           AS "deliveryStatus",
        po."deliveryType"             AS "deliveryType",
        po."deliveryNetwork"          AS "deliveryNetwork",
        COALESCE(s."isD2RBrandSeller", FALSE)
          AND po."deliveryType" = 'INTERCITY'            AS "isD2R",
        s."businessName"              AS "sellerName",
        b."businessName"              AS "buyerName",
        po."sellerCity"               AS "sellerCity",
        po."sellerState"              AS "sellerState",
        po."buyerCity"                AS "buyerCity",
        po."buyerState"               AS "buyerState",
        po."amount"::text             AS "amount",
        po."itemTotal"::text          AS "itemTotal",
        po."discount"::text           AS "discount",
        po."totalDiscount"::text      AS "totalDiscount",
        po."distance"::text           AS "distance",
        po."trackingInfo"->>'awb'     AS "awb",
        po."lastMileInvoiceNumber"    AS "lastMileInvoiceNumber",
        po."firstMileDeliveryId"      AS "firstMileDeliveryId",
        po."lastMileDeliveryId"       AS "lastMileDeliveryId",
        po."poRatingFromBuyer"::text  AS "poRatingFromBuyer",
        po."poRatingFromSeller"::text AS "poRatingFromSeller",
        po."isFalseOrder"             AS "isFalseOrder",
        po."isAutoRejected"           AS "isAutoRejected",
        po."isRTOReceived"            AS "isRTOReceived",
        po."cancelReason"             AS "cancelReason",
        po."rejectReason"             AS "rejectReason",
        po."created_at_actual"        AS "createdAt",
        po."markedPendingTime"        AS "markedPendingTime",
        po."markedInProgressTime"     AS "markedInProgressTime",
        po."markedVerifiedTime"       AS "markedVerifiedTime",
        po."plannedDispatchTime"      AS "plannedDispatchTime",
        po."markedDispatchedTime"     AS "markedDispatchedTime",
        po."markedInTransitTime"      AS "markedInTransitTime",
        po."markedDeliveredTime"      AS "markedDeliveredTime",
        po."markedCompletedTime"      AS "markedCompletedTime",
        po."markedPartialTime"        AS "markedPartialTime",
        po."markedRejectedTime"       AS "markedRejectedTime",
        po."markedCancelledTime"      AS "markedCancelledTime",
        po."markedFalseOrderTime"     AS "markedFalseOrderTime"
      FROM "purchaseOrder"."purchaseOrder" po
      LEFT JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      WHERE po."poNumber" = $1::int
      LIMIT 1;
    `;

    const poRows = await query<PoRow>(poSql, [poNumber]);
    if (poRows.length === 0) {
      return NextResponse.json({ found: false, poNumber });
    }
    const po = poRows[0];

    const itemsSql = `
      SELECT
        bsku."label"                                       AS "skuLabel",
        COALESCE(NULLIF(bsku."brandLabel", ''), b."label") AS "brandLabel",
        poi."status"                                       AS "status",
        poi."quantity"                                     AS "quantity",
        poi."quantityUnit"                                 AS "quantityUnit",
        poi."total"::text                                  AS "total",
        poi."isRejected"                                   AS "isRejected",
        poi."rejectedComment"                              AS "rejectedComment"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      LEFT JOIN "brands"."brandSKU" bsku ON bsku."id" = poi."brandSKUId"
      LEFT JOIN "brands"."brand"    b    ON b."id" = bsku."brandId"
      WHERE poi."purchaseOrderId" = $1
        AND COALESCE(poi."isArchived", FALSE) = FALSE
      ORDER BY poi."created_at" ASC;
    `;
    const itemRows = await query<ItemRow>(itemsSql, [po.id]);

    const stages = STAGE_DEFS.map((d) => {
      const time = (po[d.key] as string | null) ?? null;
      return { key: d.key as string, label: d.label, kind: d.kind, time };
    }).filter((s) => s.kind === 'step' || s.time != null);

    // run_sql returns every column as text, so booleans arrive as 't'/'f'.
    const bool = (v: unknown): boolean =>
      v === true || v === 't' || v === 'true' || v === 'TRUE';
    const num = (v: string | null) => (v != null ? parseFloat(v) : null);

    const items = itemRows.map((r) => ({
      skuLabel: r.skuLabel,
      brandLabel: r.brandLabel,
      status: r.status,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      quantityUnit: r.quantityUnit,
      total: r.total != null ? parseFloat(r.total) : null,
      isRejected: bool(r.isRejected),
      rejectedComment: r.rejectedComment,
    }));

    return NextResponse.json({
      found: true,
      isD2R: bool(po.isD2R),
      poNumber: po.poNumber,
      po: {
        status: po.status,
        deliveryStatus: po.deliveryStatus,
        deliveryType: po.deliveryType,
        deliveryNetwork: po.deliveryNetwork,
        sellerName: po.sellerName,
        buyerName: po.buyerName,
        sellerCity: po.sellerCity,
        sellerState: po.sellerState,
        buyerCity: po.buyerCity,
        buyerState: po.buyerState,
        amount: num(po.amount),
        itemTotal: num(po.itemTotal),
        discount: num(po.discount),
        totalDiscount: num(po.totalDiscount),
        distance: num(po.distance),
        awb: po.awb,
        lastMileInvoiceNumber: po.lastMileInvoiceNumber,
        firstMileDeliveryId: po.firstMileDeliveryId,
        lastMileDeliveryId: po.lastMileDeliveryId,
        poRatingFromBuyer: num(po.poRatingFromBuyer),
        poRatingFromSeller: num(po.poRatingFromSeller),
        isFalseOrder: bool(po.isFalseOrder),
        isAutoRejected: bool(po.isAutoRejected),
        isRTOReceived: bool(po.isRTOReceived),
        cancelReason: po.cancelReason,
        rejectReason: po.rejectReason,
        createdAt: po.createdAt,
        plannedDispatchTime: po.plannedDispatchTime,
      },
      stages,
      items,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
