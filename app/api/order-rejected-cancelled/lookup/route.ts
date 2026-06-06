import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Look up a SINGLE purchase order by its exact poNumber for the
 * Order Rejected/Cancelled dashboard. The dashboard only renders once the
 * operator searches a PO (acts like an index lookup), so this route requires
 * an exact numeric poNumber and never lists.
 *
 * Returns everything the result cards need:
 *   • parties      — seller (+phone), buyer (+phone +address)
 *   • delivery     — AWB, delivery id, courier, status, tracking + latest ticket
 *   • amount       — item total, gross, discounts, coupon, wallet, margin
 *   • payment      — option, event, paid amount, date
 *   • state        — status + cancel/reject reason for the action buttons
 * Item breakup is fetched separately by the page from /api/po-items.
 */

interface Row {
  poNumber: string;
  markedPendingTime: string | null;
  markedInProgressTime: string | null;
  markedDispatchedTime: string | null;
  markedDeliveredTime: string | null;
  markedCompletedTime: string | null;
  status: string;
  pushedStatus: string;

  sellerPhone: string | null;
  sellerBusinessName: string | null;
  sellerCity: string | null;
  sellerState: string | null;

  buyerPhone: string | null;
  buyerBusinessName: string | null;
  buyerAddressLine1: string | null;
  buyerLandmark: string | null;
  buyerPincode: string | null;
  buyerCity: string | null;
  buyerDistrict: string | null;
  buyerState: string | null;

  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  deliveryId: string | null;
  deliveryStatus: string | null;
  deliveryPartnerId: string | null;

  ticketReference: string | null;
  ticketStatus: string | null;
  ticketType: string | null;
  ticketCategory: string | null;
  ticketSubcategory: string | null;
  ticketCreatedAt: string | null;

  itemTotal: string | null;
  grossAmount: string | null;
  itemDiscount: string | null;
  couponAmount: string | null;
  appliedWalletAmount: string | null;
  sellerDiscount: number | null;
  paymentOptionBadhoDiscount: number | null;
  orderMarginDiscount: string | null;

  paymentOption: string | null;
  paymentEvent: string | null;
  paidAmount: string | null;
  paymentDate: string | null;

  cancelReason: string | null;
  rejectReason: string | null;
  rejectedBy: string | null;
  markedCancelledTime: string | null;
  markedRejectedTime: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();

  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  try {
    const rows = await query<Row>(
      `
      SELECT
        po."poNumber"::text                        AS "poNumber",
        po."markedPendingTime"                     AS "markedPendingTime",
        po."markedInProgressTime"                  AS "markedInProgressTime",
        po."markedDispatchedTime"                  AS "markedDispatchedTime",
        po."markedDeliveredTime"                   AS "markedDeliveredTime",
        po."markedCompletedTime"                   AS "markedCompletedTime",
        po."status"                                AS "status",
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",

        s."phone"                                  AS "sellerPhone",
        s."businessName"                           AS "sellerBusinessName",
        s."city"                                   AS "sellerCity",
        s."state"                                  AS "sellerState",

        b."phone"                                  AS "buyerPhone",
        b."businessName"                           AS "buyerBusinessName",
        b."addressLine1"                           AS "buyerAddressLine1",
        b."landmark"                               AS "buyerLandmark",
        b."pincode"                                AS "buyerPincode",
        b."city"                                   AS "buyerCity",
        b."district"                               AS "buyerDistrict",
        b."state"                                  AS "buyerState",

        dv."trackingInfo"->>'awbNumber'            AS "awbNumber",
        dv."trackingInfo"->>'courierName'          AS "courierName",
        dv."trackingInfo"->>'trackingUrl'          AS "trackingUrl",
        dv."deliveryId"                            AS "deliveryId",
        dv."status"                                AS "deliveryStatus",
        dv."deliveryPartnerId"                     AS "deliveryPartnerId",

        tk."networkTicketReferenceId"              AS "ticketReference",
        tk."status"                                AS "ticketStatus",
        tk."type"                                  AS "ticketType",
        tk."category"                              AS "ticketCategory",
        tk."subcategory"                           AS "ticketSubcategory",
        tk."created_at"                            AS "ticketCreatedAt",

        po."amount"::text                          AS "itemTotal",
        (COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0))::text AS "grossAmount",
        po."totalDiscount"::text                   AS "itemDiscount",
        po."appliedOfferDiscount"::text            AS "couponAmount",
        pop."appliedWalletAmount"::text            AS "appliedWalletAmount",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_for_seller')::float, 0)  AS "sellerDiscount",
        COALESCE((pop."breakup"->>'discount_on_payment_preference_from_badho')::float, 0)  AS "paymentOptionBadhoDiscount",
        COALESCE(po."platformMarginDiscount"::numeric, 0)::text AS "orderMarginDiscount",

        po."paymentInfo"->>'option'                AS "paymentOption",
        pop."event"                                AS "paymentEvent",
        pop."paidAmount"::text                     AS "paidAmount",
        pop."created_at"                           AS "paymentDate",

        po."cancelReason"                          AS "cancelReason",
        po."rejectReason"                          AS "rejectReason",
        po."rejectedBy"                            AS "rejectedBy",
        po."markedCancelledTime"                   AS "markedCancelledTime",
        po."markedRejectedTime"                    AS "markedRejectedTime"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId", di."trackingInfo", di."status", di."deliveryPartnerId"
        FROM "deliveries"."intercityDelivery" di
        WHERE di."purchaseOrderId" = po."id"
        ORDER BY di."created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      LEFT JOIN LATERAL (
        SELECT st."networkTicketReferenceId", st."status", st."type", st."category", st."subcategory", st."created_at"
        FROM "deliveries"."supportTicket" st
        WHERE st."deliveryId" = dv."deliveryId"
        ORDER BY st."created_at" DESC
        LIMIT 1
      ) tk ON TRUE
      LEFT JOIN "purchaseOrder"."purchaseOrderPayment" pop
             ON pop."purchaseOrderId" = po."id"
            AND pop."status" = 'COMPLETED'
            AND pop."event"  IN ('FULL_ADVANCE', 'PARTIAL_ADVANCE')
      WHERE po."poNumber" = $1::int
        AND po."status" <> 'DRAFT'
      ORDER BY pop."created_at" DESC NULLS LAST
      LIMIT 1;
      `,
      [poNumber],
    );

    if (rows.length === 0) {
      return NextResponse.json({ data: null, found: false, poNumber });
    }

    const r = rows[0];
    const num = (v: string | null) => (v != null && v !== '' ? Number(v) : null);
    const buyerAddress = [
      r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState,
    ].filter((v) => v != null && String(v).trim() !== '').join(', ');

    return NextResponse.json({
      found: true,
      poNumber,
      data: {
        poNumber: r.poNumber,
        markedPendingTime: r.markedPendingTime,
        status: r.status,
        pushedStatus: r.pushedStatus,

        timeline: {
          pending: r.markedPendingTime,
          inProgress: r.markedInProgressTime,
          dispatched: r.markedDispatchedTime,
          delivered: r.markedDeliveredTime,
          completed: r.markedCompletedTime,
        },

        seller: {
          businessName: r.sellerBusinessName,
          phone: r.sellerPhone,
          location: [r.sellerCity, r.sellerState].filter(Boolean).join(', ') || null,
        },
        buyer: {
          businessName: r.buyerBusinessName,
          phone: r.buyerPhone,
          address: buyerAddress || null,
        },

        delivery: {
          awbNumber: r.awbNumber,
          deliveryId: r.deliveryId,
          courierName: r.courierName,
          status: r.deliveryStatus,
          partner: r.deliveryPartnerId,
          trackingUrl: r.trackingUrl,
        },
        ticket: r.ticketReference || r.ticketStatus || r.ticketType
          ? {
              reference: r.ticketReference,
              status: r.ticketStatus,
              type: r.ticketType,
              category: r.ticketCategory,
              subcategory: r.ticketSubcategory,
              createdAt: r.ticketCreatedAt,
            }
          : null,

        amount: {
          itemTotal: num(r.itemTotal),
          grossAmount: num(r.grossAmount),
          itemDiscount: num(r.itemDiscount),
          couponAmount: num(r.couponAmount),
          appliedWalletAmount: num(r.appliedWalletAmount),
          sellerDiscount: r.sellerDiscount,
          paymentOptionBadhoDiscount: r.paymentOptionBadhoDiscount,
          orderMarginDiscount: num(r.orderMarginDiscount),
        },

        payment: {
          option: r.paymentOption,
          event: r.paymentEvent,
          paidAmount: num(r.paidAmount),
          paymentDate: r.paymentDate,
        },

        cancelReason: r.cancelReason,
        rejectReason: r.rejectReason,
        rejectedBy: r.rejectedBy,
        markedCancelledTime: r.markedCancelledTime,
        markedRejectedTime: r.markedRejectedTime,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
