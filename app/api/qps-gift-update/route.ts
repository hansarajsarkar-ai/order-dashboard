import { NextRequest, NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Gift Update tab — surfaces the DB-backed QPS gift-scheme report
// (promotions."qpsBuyerReport", an auto-refreshing VIEW) so the gift workflow
// runs off the database instead of Excel. One row = one buyer within one scheme:
// qualification (placed/delivered breakdown), the unlocked gift + next level,
// calling tracker, and gift-dispatch tracking. Schemes/levels come from the
// config tables so Draft/Active schemes with no qualifying buyers still appear.

interface SchemeRow {
  id: string;
  name: string;
  period_type: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  buyers: string;
  qualified: string;
  resolved: string;
  finalized: string;
}

interface LevelRow {
  scheme_id: string;
  level_number: string;
  qualifying_amount: string;
  gift_name: string;
  gift_amount: string;
}

interface ReportRow {
  scheme_id: string;
  scheme_name: string;
  period_type: string;
  period_start: string | null;
  period_end: string | null;
  buyer_id: string;
  business_name: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  placed: string;
  delivered: string;
  rto: string;
  other_terminal: string;
  in_transit: string;
  resolved: string; // 't' / 'f'
  current_level: string;
  current_gift: string | null;
  gift_amount: string;
  next_level: string | null;
  next_gift: string | null;
  amount_to_next: string | null;
  calling_status: string | null;
  remarks: string | null;
  amazon_order_id: string | null;
  delivery_eta: string | null;
  delivery_status: string | null;
  finalized: string; // 't' / 'f'
  last_edited_by: string | null;
  last_edited_at: string | null;
}

async function _GET(req: NextRequest) {
  const schemeId = req.nextUrl.searchParams.get('schemeId') || '';
  try {
    // Scheme list with per-scheme report aggregates (LEFT JOIN so Draft/Active
    // schemes with no qualifying buyers still show up).
    const schemes = await query<SchemeRow>(`
      SELECT
        s."id",
        s."name",
        s."periodType"      AS period_type,
        s."periodStartDate" AS period_start,
        s."periodEndDate"   AS period_end,
        s."status",
        COALESCE(r.buyers, 0)    AS buyers,
        COALESCE(r.qualified, 0) AS qualified,
        COALESCE(r.resolved, 0)  AS resolved,
        COALESCE(r.finalized, 0) AS finalized
      FROM promotions."qpsScheme" s
      LEFT JOIN (
        SELECT
          "schemeId",
          count(*)                          AS buyers,
          sum(("currentLevel" > 0)::int)    AS qualified,
          sum(("isFullyResolved")::int)     AS resolved,
          sum(("isFinalized")::int)         AS finalized
        FROM promotions."qpsBuyerReport"
        GROUP BY "schemeId"
      ) r ON r."schemeId" = s."id"
      ORDER BY s."periodStartDate" DESC NULLS LAST, s."created_at" DESC
    `);

    const levels = await query<LevelRow>(`
      SELECT
        "schemeId"         AS scheme_id,
        "levelNumber"      AS level_number,
        "qualifyingAmount" AS qualifying_amount,
        "giftName"         AS gift_name,
        "giftAmount"       AS gift_amount
      FROM promotions."qpsSchemeLevel"
      ORDER BY "schemeId", "levelNumber"
    `);

    // Resolve the scheme to show: the requested one, else the most recent.
    const selectedId = schemeId || schemes[0]?.id || '';

    let rows: ReportRow[] = [];
    if (selectedId) {
      rows = await query<ReportRow>(`
        SELECT
          "schemeId"            AS scheme_id,
          "schemeName"          AS scheme_name,
          "periodType"          AS period_type,
          "periodStartDate"     AS period_start,
          "periodEndDate"       AS period_end,
          "buyerId"             AS buyer_id,
          "businessName"        AS business_name,
          "buyerName"           AS buyer_name,
          "buyerAddress"        AS buyer_address,
          "ordersPlacedAmount"  AS placed,
          "deliveredAmount"     AS delivered,
          "rtoAmount"           AS rto,
          "otherTerminalAmount" AS other_terminal,
          "inTransitAmount"     AS in_transit,
          "isFullyResolved"     AS resolved,
          "currentLevel"        AS current_level,
          "currentGift"         AS current_gift,
          "giftAmount"          AS gift_amount,
          "nextLevel"           AS next_level,
          "nextGift"            AS next_gift,
          "amountToNextLevel"   AS amount_to_next,
          "callingStatus"       AS calling_status,
          "remarks",
          "amazonOrderId"       AS amazon_order_id,
          "deliveryETA"         AS delivery_eta,
          "deliveryStatus"      AS delivery_status,
          "isFinalized"         AS finalized,
          le."editedBy"         AS last_edited_by,
          le."editedAt"         AS last_edited_at
        FROM promotions."qpsBuyerReport" rep
        LEFT JOIN LATERAL (
          SELECT g."editedBy", g."editedAt"
          FROM promotions."qpsGiftEditLog" g
          WHERE g."schemeId" = rep."schemeId" AND g."buyerId" = rep."buyerId"
          ORDER BY g."editedAt" DESC
          LIMIT 1
        ) le ON true
        WHERE rep."schemeId" = $1
        ORDER BY rep."deliveredAmount" DESC NULLS LAST
      `, [selectedId]);
    }

    return NextResponse.json({ schemes, levels, rows, schemeId: selectedId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
