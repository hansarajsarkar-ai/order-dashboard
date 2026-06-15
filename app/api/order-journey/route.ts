import { NextResponse, NextRequest } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Order Journey (D2R) — the WHOLE lifecycle of a single PO, stitched from five
 * sources into one chronological story:
 *
 *   1. purchaseOrder.purchaseOrder         → order milestones, settlement, brand SLA
 *   2. deliveries.intercityDelivery        → courier (Delhivery) leg + scan trail
 *   3. deliveries.intercityDeliveryCallLogs→ PO-linked calls (driver/buyer/seller)
 *   4. deliveries.intercityDeliveryDropQRScanLog → driver scanned buyer-location QR
 *   5. smartFlo.call_logs                  → phone+time-matched calls (duration, recording)
 *
 * The route returns the structured pieces; the page merges them into a single
 * time-sorted timeline. D2R = seller.isD2RBrandSeller AND deliveryType=INTERCITY.
 *
 * run_sql returns every column as text, so booleans arrive as 't'/'f' and must
 * be coerced; numbers are parsed explicitly.
 */

const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true' || v === 'TRUE';
const num = (v: string | null | undefined): number | null =>
  v != null && v !== '' ? parseFloat(v) : null;

// QPS qualifying spend excludes this seller (matches the QPS dashboard).
const QPS_EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

// Canonical order milestones, in forward order. Exceptions only render if set.
const STAGE_DEFS: { key: string; label: string; kind: 'step' | 'exception' }[] = [
  { key: 'markedPendingTime', label: 'Order Placed', kind: 'step' },
  { key: 'markedInProgressTime', label: 'Accepted (In Progress)', kind: 'step' },
  { key: 'markedVerifiedTime', label: 'Verified', kind: 'step' },
  { key: 'markedDispatchedTime', label: 'Dispatched by Brand', kind: 'step' },
  { key: 'markedInTransitTime', label: 'In Transit', kind: 'step' },
  { key: 'markedDeliveredTime', label: 'Delivered', kind: 'step' },
  { key: 'markedCompletedTime', label: 'Completed', kind: 'step' },
  { key: 'markedPartialTime', label: 'Marked Partial', kind: 'exception' },
  { key: 'markedRejectedTime', label: 'Rejected', kind: 'exception' },
  { key: 'markedCancelledTime', label: 'Cancelled', kind: 'exception' },
  { key: 'markedFalseOrderTime', label: 'Marked False Order', kind: 'exception' },
];

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poNumber = (searchParams.get('poNumber') || '').trim();
  if (!/^\d+$/.test(poNumber)) {
    return NextResponse.json({ error: 'A numeric poNumber is required' }, { status: 400 });
  }

  try {
    // ── 1. PO header + lifecycle + settlement + SLA ──────────────────────────
    const poSql = `
      SELECT
        po."id"                       AS "id",
        po."poNumber"                 AS "poNumber",
        po."status"                   AS "status",
        po."deliveryStatus"           AS "deliveryStatus",
        COALESCE(s."isD2RBrandSeller", FALSE) AND po."deliveryType" = 'INTERCITY' AS "isD2R",
        s."businessName"              AS "sellerName",
        b."businessName"              AS "buyerName",
        b."phone"                     AS "buyerPhone",
        s."phone"                     AS "sellerPhone",
        po."sellerCity"               AS "sellerCity",
        po."sellerState"              AS "sellerState",
        po."buyerCity"                AS "buyerCity",
        po."buyerState"               AS "buyerState",
        po."amount"::text             AS "amount",
        po."itemTotal"::text          AS "itemTotal",
        po."totalDiscount"::text      AS "totalDiscount",
        po."distance"::text           AS "distance",
        po."poRatingFromBuyer"::text  AS "poRatingFromBuyer",
        po."poRatingFromSeller"::text AS "poRatingFromSeller",
        po."isFalseOrder"             AS "isFalseOrder",
        po."isRTOReceived"            AS "isRTOReceived",
        po."cancelReason"             AS "cancelReason",
        po."rejectReason"             AS "rejectReason",
        po."settledAmountToSeller"::text AS "settledAmountToSeller",
        po."isSettledToSeller"        AS "isSettledToSeller",
        po."isReadyForSettlement"     AS "isReadyForSettlement",
        po."remainingDueAmount"::text AS "remainingDueAmount",
        po."refundableAmount"::text   AS "refundableAmount",
        po."originalPOAmount"::text   AS "originalPOAmount",
        po."poModifiedBuyerInformed"  AS "poModifiedBuyerInformed",
        po."plannedDispatchTime"      AS "plannedDispatchTime",
        po."created_at_actual"        AS "createdAt",
        po."markedPendingTime"        AS "markedPendingTime",
        po."markedInProgressTime"     AS "markedInProgressTime",
        po."markedVerifiedTime"       AS "markedVerifiedTime",
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
    const poRows = await query<Record<string, string | null>>(poSql, [poNumber]);
    if (poRows.length === 0) return NextResponse.json({ found: false, poNumber });
    const p = poRows[0];
    const poId = p.id as string;

    // ── 2. Items ─────────────────────────────────────────────────────────────
    const itemsSql = `
      SELECT
        bsku."label"                                       AS "skuLabel",
        COALESCE(NULLIF(bsku."brandLabel", ''), br."label") AS "brandLabel",
        poi."status"                                       AS "status",
        poi."quantity"                                     AS "quantity",
        poi."quantityUnit"                                 AS "quantityUnit",
        poi."total"::text                                  AS "total",
        poi."isRejected"                                   AS "isRejected"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      LEFT JOIN "brands"."brandSKU" bsku ON bsku."id" = poi."brandSKUId"
      LEFT JOIN "brands"."brand"    br   ON br."id" = bsku."brandId"
      WHERE poi."purchaseOrderId" = $1
        AND COALESCE(poi."isArchived", FALSE) = FALSE
      ORDER BY poi."created_at" ASC;
    `;
    const itemRowsP = query<Record<string, string | null>>(itemsSql, [poId]);

    // ── 3. Courier (latest intercityDelivery) ────────────────────────────────
    const courierSql = `
      SELECT
        di."status"                          AS "status",
        di."deliveryPartnerId"               AS "partner",
        COALESCE(di."trackingInfo"->>'awbNumber', di."latestLogDetails"->>'awb', di."networkReferenceId") AS "awb",
        di."networkReferenceId"              AS "networkRef",
        di."trackingInfo"->>'trackingUrl'    AS "trackingUrl",
        di."trackingInfo"->>'courierName'    AS "courierName",
        di."trackingInfo"->>'provider'       AS "provider",
        di."trackingInfo"->>'labelUrl'       AS "labelUrl",
        di."codAmountToBeCollected"::text    AS "codAmount",
        di."pickupScheduledForDate"          AS "pickupScheduledForDate",
        di."rtoClaimStatus"                  AS "rtoClaimStatus",
        di."created_at"                      AS "deliveryCreatedAt",
        di."pickupJSON"->>'pickupAddressName' AS "pickupAddressName",
        di."pickupJSON"->>'pickupPincode'    AS "pickupPincode",
        di."dropJSON"->'contact'->>'name'    AS "dropName",
        di."dropJSON"->'contact'->>'phone'   AS "dropPhone",
        di."dropJSON"->'location'->>'city'   AS "dropCity",
        di."dropJSON"->'location'->>'state'  AS "dropState",
        di."dropJSON"->'location'->>'pincode' AS "dropPincode",
        di."dropJSON"->'location'->>'latitude'  AS "dropLat",
        di."dropJSON"->'location'->>'longitude' AS "dropLng"
      FROM "deliveries"."intercityDelivery" di
      WHERE di."purchaseOrderId" = $1 AND di."isTest" = FALSE
      ORDER BY di."created_at" DESC
      LIMIT 1;
    `;
    const courierRowsP = query<Record<string, string | null>>(courierSql, [poId]);

    // ── 3b. Courier scan trail (all scans, ascending) ────────────────────────
    const scansSql = `
      WITH latest_delivery AS (
        SELECT di."latestLogDetails" AS l
        FROM "deliveries"."intercityDelivery" di
        WHERE di."purchaseOrderId" = $1 AND di."isTest" = FALSE
        ORDER BY di."created_at" DESC LIMIT 1
      )
      SELECT scan->>'location' AS "location",
             scan->>'date'     AS "date",
             scan->>'status'   AS "status",
             scan->>'activity' AS "activity"
      FROM latest_delivery ld
      CROSS JOIN LATERAL jsonb_array_elements(ld.l->'scans') AS scan
      WHERE jsonb_typeof(ld.l) = 'object'
        AND jsonb_typeof(ld.l->'scans') = 'array'
        AND scan->>'date' IS NOT NULL
      ORDER BY (scan->>'date')::timestamptz ASC;
    `;
    const scanRowsP = query<Record<string, string | null>>(scansSql, [poId]);

    // ── 4. PO-linked calls (driver / buyer / seller) ─────────────────────────
    const callsSql = `
      SELECT "callType","entity","agentName","riderPhone","callPlacedAt",
             "callRemarks","callCount","whatsappStatus","whatsappSentAt"
      FROM "deliveries"."intercityDeliveryCallLogs"
      WHERE "poNumber" = $1::int
      ORDER BY "callPlacedAt" ASC;
    `;
    const callRowsP = query<Record<string, string | null>>(callsSql, [poNumber]);

    // ── 5. Driver QR scan of buyer location ──────────────────────────────────
    const qrSql = `
      SELECT "created_at" AS "createdAt",
             "logDetails"->>'outcome'                       AS "outcome",
             "logDetails"->'dropCoordinates'->>'latitude'   AS "dropLat",
             "logDetails"->'dropCoordinates'->>'longitude'  AS "dropLng",
             "logDetails"->'riderLocation'->>'latitude'     AS "riderLat",
             "logDetails"->'riderLocation'->>'longitude'    AS "riderLng",
             "logDetails"->>'matchedByPoNumber'             AS "matchedByPoNumber"
      FROM "deliveries"."intercityDeliveryDropQRScanLog"
      WHERE "poNumber" = $1
      ORDER BY "created_at" ASC;
    `;
    const qrRowsP = query<Record<string, string | null>>(qrSql, [poNumber]);

    // ── 6. smartFlo enrichment — buyer/seller calls by phone within window ───
    // Match RIGHT(call_to_number,10) directly (NOT wrapped in regexp_replace) so
    // the idx_call_logs_phone_last10 index is used — wrapping it forced a 698K-row
    // seq scan (up to ~37s on wide windows). start_stamp is text IST and
    // lexicographically sortable. Window = [placed, completed/delivered + 3d].
    const smartFloSql = `
      WITH po AS (
        SELECT
          to_char(p."markedPendingTime" AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS t0,
          to_char((COALESCE(p."markedCompletedTime", p."markedDeliveredTime", NOW()) + INTERVAL '3 days')
                  AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS t1,
          RIGHT(regexp_replace(b."phone",'[^0-9]','','g'),10) AS bp,
          RIGHT(regexp_replace(s."phone",'[^0-9]','','g'),10) AS sp
        FROM "purchaseOrder"."purchaseOrder" p
        JOIN "users"."buyer"  b ON b."id" = p."buyerId"
        JOIN "users"."seller" s ON s."id" = p."sellerId"
        WHERE p."poNumber" = $1::int
      )
      SELECT cl."direction", cl."call_status" AS "callStatus", cl."duration",
             cl."start_stamp" AS "startStamp", cl."recording_url" AS "recordingUrl",
             cl."agent_name" AS "agentName",
             CASE
               WHEN RIGHT(cl."call_to_number",10) = po.bp
                 OR RIGHT(cl."caller_id_number",10) = po.bp THEN 'BUYER'
               WHEN RIGHT(cl."call_to_number",10) = po.sp
                 OR RIGHT(cl."caller_id_number",10) = po.sp THEN 'SELLER'
             END AS "party"
      FROM "smartFlo".call_logs cl, po
      WHERE po.t0 IS NOT NULL
        AND cl."start_stamp" >= po.t0 AND cl."start_stamp" <= po.t1
        AND ( RIGHT(cl."call_to_number",10) IN (po.bp, po.sp)
           OR RIGHT(cl."caller_id_number",10) IN (po.bp, po.sp) )
      ORDER BY cl."start_stamp" ASC
      LIMIT 60;
    `;
    // enrichment is best-effort; never fail the whole request
    const smartFloRowsP = query<Record<string, string | null>>(smartFloSql, [poNumber])
      .catch(() => [] as Record<string, string | null>[]);

    // ── 7. PO edit (seller removed an item / decreased a qty) ────────────────
    const modsSql = `
      SELECT
        bsku."label" AS "skuLabel",
        CASE
          WHEN poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL     THEN 'Item Removed'
          WHEN poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL THEN 'Quantity Decreased'
        END AS "changeType"
      FROM "purchaseOrder"."purchaseOrderItem" poi
      LEFT JOIN "brands"."brandSKU" bsku ON bsku."id" = poi."brandSKUId"
      WHERE poi."purchaseOrderId" = $1
        AND poi."status" <> 'DRAFT'
        AND poi."modifiedByRole" ILIKE 'seller'
        AND ( (poi."isArchived" = TRUE  AND poi."originalSnapshot" IS NULL)
           OR (poi."isArchived" = FALSE AND poi."originalSnapshot" IS NOT NULL) );
    `;
    const modRowsP = query<Record<string, string | null>>(modsSql, [poId]);

    // ── 8. QPS buyer stage — qualifying spend in this PO's month ──────────────
    const qpsSql = `
      WITH target AS (
        SELECT p."buyerId" AS bid,
               date_trunc('month', COALESCE(p."markedPendingTime", p."created_at_actual", p."created_at"))::date AS mstart
        FROM "purchaseOrder"."purchaseOrder" p WHERE p."poNumber" = $1::int
      )
      SELECT
        (SELECT mstart::text FROM target) AS "monthStart",
        COALESCE((
          SELECT ROUND(SUM(po."amount")::numeric, 2)
          FROM "purchaseOrder"."purchaseOrder" po
          JOIN "users"."seller" s ON s."id" = po."sellerId"
          JOIN target t ON TRUE
          WHERE po."buyerId" = t.bid
            AND po."status" IN ('DELIVERED','COMPLETED')
            AND po."isTest" = FALSE
            AND po."deliveryType" = 'INTERCITY'
            AND po."deliveryNetwork" = 'THIRD_PARTY'
            AND po."markedPendingTime" >= t.mstart
            AND po."markedPendingTime" <  (t.mstart + INTERVAL '1 month')
            AND s."isD2RBrandSeller" = TRUE
            AND s."isTest" = FALSE
            AND s."businessName" NOT ILIKE '%test%'
            AND s."id" <> $2
        ), 0)::text AS "qualifiedAmount";
    `;
    const qpsRowsP = query<Record<string, string | null>>(qpsSql, [poNumber, QPS_EXCLUDED_SELLER]);

    // Run every per-PO query concurrently (poId & poNumber are both known) —
    // collapses ~8 serial Hasura round-trips into a single wave (~3s → ~1.5s).
    const [itemRows, courierRows, scanRows, callRows, qrRows, smartFloRows, modRows, qpsRows] =
      await Promise.all([itemRowsP, courierRowsP, scanRowsP, callRowsP, qrRowsP, smartFloRowsP, modRowsP, qpsRowsP]);
    const c = courierRows[0] || null;

    // ── Assemble ─────────────────────────────────────────────────────────────
    const stages = STAGE_DEFS.map((d) => ({
      key: d.key,
      label: d.label,
      kind: d.kind,
      time: (p[d.key] as string | null) ?? null,
    })).filter((s) => s.kind === 'step' || s.time != null);

    const items = itemRows.map((r) => ({
      skuLabel: r.skuLabel,
      brandLabel: r.brandLabel,
      status: r.status,
      quantity: num(r.quantity),
      quantityUnit: r.quantityUnit,
      total: num(r.total),
      isRejected: bool(r.isRejected),
    }));

    const courier = c
      ? {
          status: c.status,
          partner: c.partner,
          awb: c.awb,
          trackingUrl: c.trackingUrl,
          courierName: c.courierName || c.provider || c.partner,
          labelUrl: c.labelUrl,
          codAmount: num(c.codAmount),
          pickupScheduledForDate: c.pickupScheduledForDate,
          rtoClaimStatus: c.rtoClaimStatus,
          pickupAddressName: c.pickupAddressName,
          pickupPincode: c.pickupPincode,
          dropName: c.dropName,
          dropPhone: c.dropPhone,
          dropCity: c.dropCity,
          dropState: c.dropState,
          dropPincode: c.dropPincode,
          dropLat: num(c.dropLat),
          dropLng: num(c.dropLng),
        }
      : null;

    const scans = scanRows.map((r) => ({
      location: r.location,
      date: r.date,
      status: r.status,
      activity: r.activity,
    }));

    const calls = callRows.map((r) => ({
      callType: r.callType, // INBOUND | OUTBOUND
      entity: r.entity, // RIDER | BUYER | SELLER
      agentName: r.agentName,
      riderPhone: r.riderPhone,
      callPlacedAt: r.callPlacedAt,
      callRemarks: r.callRemarks,
      callCount: num(r.callCount),
      whatsappStatus: r.whatsappStatus,
      whatsappSentAt: r.whatsappSentAt,
    }));

    const qrScans = qrRows.map((r) => ({
      createdAt: r.createdAt,
      outcome: r.outcome,
      dropLat: num(r.dropLat),
      dropLng: num(r.dropLng),
      riderLat: num(r.riderLat),
      riderLng: num(r.riderLng),
      matchedByPoNumber: bool(r.matchedByPoNumber),
    }));

    const modifications = modRows
      .filter((r) => r.changeType)
      .map((r) => ({ skuLabel: r.skuLabel, changeType: r.changeType }));

    const qpsRow = qpsRows[0] || null;
    const qps = qpsRow
      ? { monthStart: qpsRow.monthStart, qualifiedAmount: num(qpsRow.qualifiedAmount) ?? 0 }
      : null;

    const phoneCalls = smartFloRows.map((r) => ({
      direction: r.direction, // Outbound | Inbound | Manual
      callStatus: r.callStatus, // Answer | No Answer | ...
      duration: num(r.duration),
      startStamp: r.startStamp, // IST 'YYYY-MM-DD HH:MM:SS'
      recordingUrl: r.recordingUrl,
      agentName: r.agentName,
      party: r.party, // BUYER | SELLER
    }));

    return NextResponse.json({
      found: true,
      isD2R: bool(p.isD2R),
      poNumber: p.poNumber,
      po: {
        status: p.status,
        deliveryStatus: p.deliveryStatus,
        sellerName: p.sellerName,
        buyerName: p.buyerName,
        buyerPhone: p.buyerPhone,
        sellerPhone: p.sellerPhone,
        sellerCity: p.sellerCity,
        sellerState: p.sellerState,
        buyerCity: p.buyerCity,
        buyerState: p.buyerState,
        amount: num(p.amount),
        itemTotal: num(p.itemTotal),
        totalDiscount: num(p.totalDiscount),
        distance: num(p.distance),
        poRatingFromBuyer: num(p.poRatingFromBuyer),
        poRatingFromSeller: num(p.poRatingFromSeller),
        isFalseOrder: bool(p.isFalseOrder),
        isRTOReceived: bool(p.isRTOReceived),
        cancelReason: p.cancelReason,
        rejectReason: p.rejectReason,
        settledAmountToSeller: num(p.settledAmountToSeller),
        isSettledToSeller: bool(p.isSettledToSeller),
        isReadyForSettlement: bool(p.isReadyForSettlement),
        remainingDueAmount: num(p.remainingDueAmount),
        refundableAmount: num(p.refundableAmount),
        originalPOAmount: num(p.originalPOAmount),
        poModifiedBuyerInformed: p.poModifiedBuyerInformed,
        plannedDispatchTime: p.plannedDispatchTime,
        markedDispatchedTime: p.markedDispatchedTime,
        createdAt: p.createdAt,
      },
      courier,
      stages,
      scans,
      calls,
      qrScans,
      phoneCalls,
      modifications,
      qps,
      items,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
