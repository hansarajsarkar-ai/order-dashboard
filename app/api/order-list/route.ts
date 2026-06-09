import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  poNumber: string;
  MarkedpendingTime: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  poAmount: number | null;
  ItemTotal: number | null;
  GrossAmount: number | null;
  OrderMarginDiscount: number | null;
  CoupanAmount: number | null;
  orderStatus: string;
  PaymentOption: string | null;
  awbNumber: string | null;
  courierName: string | null;
  deliveryStatus: string | null;
  RefundIntiatedTime: string | null;
  RefundCompletedTime: string | null;
  RefundAmount: string | null;
  codAmountToBeCollected: number | null;
  pushedStatus: string;
  rejectReason: string | null;
  rejectedBy: string | null;
  reasonAddedByBadhoTeam: string | null;
  buyer_address_line1: string | null;
  buyer_landmark: string | null;
  buyer_pincode: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_state: string | null;
  seller_address_line1: string | null;
  seller_city: string | null;
  seller_state: string | null;
  created_at: string;
  statusMarkedTime: string | null;
  statusDurationSec: number | null;
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const monthParam = searchParams.get('month');
  const weekParam = searchParams.get('week');                  // optional Postgres EXTRACT(WEEK) number — matches the weekly status pivot
  const zone = searchParams.get('zone');                       // optional Delhivery zone (A/B/C1/…); filters via intercityDelivery, windowed by startDate/endDate on icd.created_at
  const zoneAny = searchParams.get('zoneAny');                  // optional "1" — any Delhivery zone (non-NULL); used by the zone-table seller/grand totals
  const zoneStatus = searchParams.get('zoneStatus');           // optional intercityDelivery.status (delivery status column in the zone pivot); '(unknown)' → icd.status IS NULL
  const sellerName = searchParams.get('sellerName');           // optional exact seller businessName (zone-table rows are keyed by full businessName, not the brand prefix)
  const status = searchParams.get('status');                  // optional now — when omitted, all non-DRAFT statuses are included
  const excludeStatus = searchParams.get('excludeStatus');    // optional comma-separated — po.status NOT IN (...); used by the State-wise "In-flight" bucket
  const stateParam = searchParams.get('state');               // optional buyer state filter (b."state") — used by the State-wise pivot drill
  const deliveryStatusParam = searchParams.get('deliveryStatus'); // value | "__NULL__" | null
  const startDate = searchParams.get('startDate');            // optional YYYY-MM-DD — when set, replaces year-based filter
  const endDate   = searchParams.get('endDate');              // optional YYYY-MM-DD
  const brand     = searchParams.get('brand');                // optional comma-separated seller businessName prefixes (matches brand-performance MBS pivot)
  const brandLabel = searchParams.get('brandLabel');          // optional comma-separated brand labels (matches brand-performance Brand × Product table, sourced from brands.brand.label)
  const sku       = searchParams.get('sku');                  // optional comma-separated brandSKUIds — return only POs that contain at least one matching item

  try {
    // status can be a single value ('REJECTED'), comma-separated
    // ('DELIVERED,COMPLETED') for multi-status filters like the GMV
    // Achieved tile, or absent (drill on row/column/grand totals).
    const params: (string | number)[] = [];
    let statusFilter = ` AND po."status" != 'DRAFT'`;
    if (status) {
      const statusValues = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statusValues.length > 0) {
        params.push(...statusValues);
        const placeholders = statusValues.map((_, i) => `$${i + 1}`).join(', ');
        statusFilter = ` AND po."status" IN (${placeholders})`;
      }
    }

    // excludeStatus: po.status NOT IN (...) — mirrors the State-wise pivot's
    // "In-flight" bucket (everything that isn't delivered/rejected/cancelled).
    let excludeStatusFilter = '';
    if (excludeStatus) {
      const vals = excludeStatus.split(',').map((s) => s.trim()).filter(Boolean);
      if (vals.length > 0) {
        const ph = vals.map((v) => { params.push(v); return `$${params.length}`; }).join(', ');
        excludeStatusFilter = ` AND po."status" NOT IN (${ph})`;
      }
    }

    // state: buyer state exact match (b."state").
    let stateFilter = '';
    if (stateParam) {
      params.push(stateParam);
      stateFilter = ` AND b."state" = $${params.length}`;
    }

    // Date window: explicit startDate/endDate take precedence over year.
    // For a zone drill the window applies to intercityDelivery.created_at inside the
    // zone EXISTS (see zoneFilter), so the markedPendingTime date filter is skipped.
    let dateFilter = '';
    if (zone || zoneAny) {
      // no markedPendingTime constraint — handled in zoneFilter
    } else if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        dateFilter += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        dateFilter += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      dateFilter = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }

    let monthFilter = '';
    if (monthParam) {
      const month = parseInt(monthParam);
      if (!Number.isNaN(month) && month >= 1 && month <= 12) {
        params.push(month);
        monthFilter = ` AND EXTRACT(MONTH FROM po."markedPendingTime") = $${params.length}`;
      }
    }

    let weekFilter = '';
    if (weekParam) {
      const week = parseInt(weekParam);
      if (!Number.isNaN(week) && week >= 1 && week <= 53) {
        params.push(week);
        weekFilter = ` AND EXTRACT(WEEK FROM po."markedPendingTime") = $${params.length}`;
      }
    }

    // Zone filter: PO has a Delhivery intercityDelivery matching the requested
    // zone (or any zone, for the zone-table seller/grand totals), within the
    // window. Mirrors the zone-pivot definition (deliveryPartnerId='DELHIVERY',
    // zone + delivery status from deliveryCostReportJSON / icd.status).
    let zoneFilter = '';
    if (zone || zoneAny) {
      let zoneClause = ` AND icd."deliveryPartnerId" = 'DELHIVERY'`;
      if (zone) {
        params.push(zone);
        zoneClause += ` AND icd."deliveryCostReportJSON" -> 0 ->> 'zone' = $${params.length}`;
      } else {
        zoneClause += ` AND icd."deliveryCostReportJSON" -> 0 ->> 'zone' IS NOT NULL`;
      }
      // Optional delivery-status column from the zone pivot (icd.status).
      if (zoneStatus) {
        if (zoneStatus === '(unknown)') {
          zoneClause += ` AND icd."status" IS NULL`;
        } else {
          params.push(zoneStatus);
          zoneClause += ` AND icd."status" = $${params.length}`;
        }
      }
      if (startDate) {
        params.push(startDate);
        zoneClause += ` AND icd."created_at"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        zoneClause += ` AND icd."created_at"::date <= $${params.length}`;
      }
      zoneFilter = ` AND EXISTS (
        SELECT 1 FROM "deliveries"."intercityDelivery" icd
        WHERE icd."purchaseOrderId" = po."id"${zoneClause}
      )`;
    }

    // Exact seller businessName — zone-table rows are keyed by the full
    // businessName, not the brand prefix the `brand` param matches.
    let sellerNameFilter = '';
    if (sellerName) {
      params.push(sellerName);
      sellerNameFilter = ` AND s."businessName" = $${params.length}`;
    }

    let deliveryFilter = '';
    if (deliveryStatusParam !== null) {
      if (deliveryStatusParam === '__NULL__') {
        deliveryFilter = ` AND po."deliveryStatus" IS NULL`;
      } else {
        params.push(deliveryStatusParam);
        deliveryFilter = ` AND po."deliveryStatus" = $${params.length}`;
      }
    }

    let brandFilter = '';
    if (brand) {
      params.push(brand);
      brandFilter = ` AND TRIM(SPLIT_PART(COALESCE(s."businessName", ''), '-', 1)) = ANY(string_to_array($${params.length}, ','))`;
    }

    // SKU filter: only POs containing at least one matching non-DRAFT,
    // non-combo-child purchaseOrderItem. Matches the aggregation rules used
    // across brand-performance (see project_purchase_order_item_draft_filter
    // and project_purchase_order_item_combo_explosion memories).
    let skuFilter = '';
    if (sku) {
      params.push(sku);
      skuFilter = ` AND EXISTS (
        SELECT 1 FROM "purchaseOrder"."purchaseOrderItem" poi_f
        WHERE poi_f."purchaseOrderId" = po."id"
          AND poi_f."brandSKUId" = ANY(string_to_array($${params.length}, ','))
          AND poi_f."status" != 'DRAFT'
          AND poi_f."comboBrandSKUPOItemId" IS NULL
      )`;
    }

    // Brand-label filter: scope POs to those containing at least one item
    // whose brandSKU resolves to one of the given brand labels. Used by the
    // Brand × Product drill where brand names come from brands.brand.label
    // (e.g. "HOPPIN CANDY") rather than the seller businessName prefix.
    let brandLabelFilter = '';
    if (brandLabel) {
      params.push(brandLabel);
      brandLabelFilter = ` AND EXISTS (
        SELECT 1 FROM "purchaseOrder"."purchaseOrderItem" poi_bl
        JOIN "brands"."brandSKU" bs_bl ON bs_bl."id" = poi_bl."brandSKUId"
        LEFT JOIN "brands"."brand" bra_bl ON bra_bl."id" = bs_bl."brandId"
        WHERE poi_bl."purchaseOrderId" = po."id"
          AND poi_bl."status" != 'DRAFT'
          AND poi_bl."comboBrandSKUPOItemId" IS NULL
          AND COALESCE(bra_bl."label", '(unbranded)') = ANY(string_to_array($${params.length}, ','))
      )`;
    }

    const sql = `
      SELECT DISTINCT
        po."poNumber"::text AS "poNumber",
        po."markedPendingTime" AS "MarkedpendingTime",
        s."phone" AS "sellerPhone",
        s."businessName" AS "sellerBusinessName",
        b."phone" AS "buyerPhone",
        b."businessName" AS "buyerBusinessName",
        (po."amount" + COALESCE(po."platformMarginDiscount", 0) + COALESCE(po."totalDiscount", 0)) AS "poAmount",
        po."amount" AS "ItemTotal",
        (COALESCE(po."amount"::numeric, 0) + COALESCE(po."platformMarginDiscount"::numeric, 0) + COALESCE(po."totalDiscount"::numeric, 0)) AS "GrossAmount",
        COALESCE(po."platformMarginDiscount"::numeric, 0) AS "OrderMarginDiscount",
        po."appliedOfferDiscount" AS "CoupanAmount",
        po."status" AS "orderStatus",
        po."paymentInfo"->>'option' AS "PaymentOption",
        dv."trackingInfo"->>'awbNumber' AS "awbNumber",
        dv."trackingInfo"->>'courierName' AS "courierName",
        dv."status" AS "deliveryStatus",
        pf."markedStatusInitiatedTime" AS "RefundIntiatedTime",
        pf."markedStatusCompletedTime" AS "RefundCompletedTime",
        pf."refundAmount"::text        AS "RefundAmount",
        dv."codAmountToBeCollected" AS "codAmountToBeCollected",
        CASE WHEN dv."deliveryId" IS NOT NULL THEN 'Pushed' ELSE 'Not Pushed' END AS "pushedStatus",
        po."rejectReason",
        po."rejectedBy" AS "rejectedBy",
        po."reasonAddedByBadhoTeam" AS "reasonAddedByBadhoTeam",
        b."addressLine1" AS buyer_address_line1,
        b."landmark" AS buyer_landmark,
        b."pincode" AS buyer_pincode,
        b."city" AS buyer_city,
        b."district" AS buyer_district,
        b."state" AS buyer_state,
        s."addressLine1" AS seller_address_line1,
        s."city" AS seller_city,
        s."state" AS seller_state,
        po."created_at" AS created_at,
        CASE po."status"
          WHEN 'REJECTED'    THEN po."markedRejectedTime"
          WHEN 'CANCELLED'   THEN po."markedCancelledTime"
          WHEN 'DELIVERED'   THEN po."markedDeliveredTime"
          WHEN 'COMPLETED'   THEN po."markedCompletedTime"
          WHEN 'DISPATCHED'  THEN po."markedDispatchedTime"
          WHEN 'IN_TRANSIT'  THEN po."markedInTransitTime"
          WHEN 'IN_PROGRESS' THEN po."markedInProgressTime"
          WHEN 'INPROGRESS'  THEN po."markedInProgressTime"
          WHEN 'PARTIAL'     THEN po."markedPartialTime"
          ELSE NULL
        END AS "statusMarkedTime",
        EXTRACT(EPOCH FROM (
          CASE po."status"
            WHEN 'REJECTED'    THEN po."markedRejectedTime"
            WHEN 'CANCELLED'   THEN po."markedCancelledTime"
            WHEN 'DELIVERED'   THEN po."markedDeliveredTime"
            WHEN 'COMPLETED'   THEN po."markedCompletedTime"
            WHEN 'DISPATCHED'  THEN po."markedDispatchedTime"
            WHEN 'IN_TRANSIT'  THEN po."markedInTransitTime"
            WHEN 'IN_PROGRESS' THEN po."markedInProgressTime"
            WHEN 'INPROGRESS'  THEN po."markedInProgressTime"
            WHEN 'PARTIAL'     THEN po."markedPartialTime"
            WHEN 'PENDING'     THEN NOW()
            ELSE NOW()
          END
          - po."markedPendingTime"
        ))::float AS "statusDurationSec"
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      LEFT JOIN LATERAL (
        SELECT di."id" AS "deliveryId",
               di."trackingInfo",
               di."status",
               di."codAmountToBeCollected"
        FROM "deliveries"."intercityDelivery" di
        WHERE di."purchaseOrderId" = po."id"
        ORDER BY di."created_at" DESC
        LIMIT 1
      ) dv ON TRUE
      LEFT JOIN "payments"."paymentRefundRecord" pf
             ON pf."purchaseOrderId" = po."id"
            AND pf."status" = 'COMPLETED'
      WHERE s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND b."isTest"           = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND po."isTest"          = FALSE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."isFalseOrder"    = FALSE
        ${statusFilter}
        ${excludeStatusFilter}
        ${stateFilter}
        ${dateFilter}
        ${monthFilter}
        ${weekFilter}
        ${zoneFilter}
        ${sellerNameFilter}
        ${deliveryFilter}
        ${brandFilter}
        ${brandLabelFilter}
        ${skuFilter}
      ORDER BY "MarkedpendingTime" DESC NULLS LAST
      LIMIT 5000;
    `;

    const rows = await query<Row>(sql, params);

    const data = rows.map((r) => ({
      poNumber: r.poNumber,
      MarkedpendingTime: r.MarkedpendingTime,
      sellerPhone: r.sellerPhone,
      sellerBusinessName: r.sellerBusinessName,
      buyerPhone: r.buyerPhone,
      buyerBusinessName: r.buyerBusinessName,
      poAmount: r.poAmount,
      itemTotal: r.ItemTotal != null ? Number(r.ItemTotal) : null,
      grossAmount: r.GrossAmount != null ? Number(r.GrossAmount) : null,
      orderMarginDiscount: r.OrderMarginDiscount != null ? Number(r.OrderMarginDiscount) : null,
      CoupanAmount: r.CoupanAmount,
      orderStatus: r.orderStatus,
      status: r.orderStatus,
      PaymentOption: r.PaymentOption,
      awbNumber: r.awbNumber,
      courierName: r.courierName,
      deliveryStatus: r.deliveryStatus,
      RefundIntiatedTime: r.RefundIntiatedTime,
      RefundCompletedTime: r.RefundCompletedTime,
      RefundAmount: r.RefundAmount != null ? parseFloat(String(r.RefundAmount)) : null,
      codAmountToBeCollected: r.codAmountToBeCollected,
      pushedStatus: r.pushedStatus,
      rejectReason: r.rejectReason,
      rejectedBy: r.rejectedBy,
      reasonAddedByBadhoTeam: r.reasonAddedByBadhoTeam,
      amount: r.GrossAmount != null ? Number(r.GrossAmount) : 0,
      buyerAddress: [r.buyer_address_line1, r.buyer_city, r.buyer_state].filter(Boolean).join(', '),
      buyerFullAddress: [
        r.buyer_address_line1,
        r.buyer_landmark,
        r.buyer_pincode,
        r.buyer_city,
        r.buyer_district,
        r.buyer_state,
      ].filter((v) => v != null && String(v).trim() !== '').join(', '),
      buyerAddressLine1: r.buyer_address_line1,
      buyerLandmark: r.buyer_landmark,
      buyerPincode: r.buyer_pincode,
      buyerCity: r.buyer_city,
      buyerDistrict: r.buyer_district,
      buyerState: r.buyer_state,
      sellerAddress: [r.seller_address_line1, r.seller_city, r.seller_state].filter(Boolean).join(', '),
      markedPendingTime: r.MarkedpendingTime,
      createdAt: r.created_at,
      statusMarkedTime: r.statusMarkedTime,
      statusDurationSec: r.statusDurationSec != null ? Number(r.statusDurationSec) : null,
    }));

    return NextResponse.json({
      data,
      count: data.length,
      year,
      month: monthParam ? parseInt(monthParam) : null,
      status,
      deliveryStatus: deliveryStatusParam,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
