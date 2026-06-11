import { NextRequest, NextResponse } from 'next/server';
import { query, withQueryCapture } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCLUDED_SELLER = 'cb9e18f5-1ed7-4b24-8cdb-17f29efa4366';

interface Row {
  buyer_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_business_name: string;
  buyer_address_line1: string;
  buyer_address_line2: string;
  buyer_landmark: string;
  buyer_city: string;
  buyer_district: string;
  buyer_state: string;
  buyer_pincode: string;
  profile_pic: string | null;
  shop_board_photo: string | null;
  selfie_with_shop_board: string | null;
  inside_shop_products: string | null;
  shop_front: string | null;
  outside_shop: string | null;
  monthly: string;
  qualified_amount: string;
  pct_level1: string;
  pct_level2: string;
  pct_level3: string;
  pct_level4: string;
  pct_level5: string;
  reward_level: string;
  gift_won: string;
  placed_amount: string;
  delivered_amount: string;
  rto_amount: string;
  pct_delivered: string;
  due_amount: string;
  prev_mtd_amount: string;
  is_new: string; // '1' if the buyer joined the platform during the selected month
}

async function _GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month'); // '2026-04-01'
  const date1 = searchParams.get('date1');
  const date2 = searchParams.get('date2');
  const phone = searchParams.get('phone');

  if (!month) {
    return NextResponse.json({ error: 'month parameter required' }, { status: 400 });
  }

  // Use sargable range instead of date_trunc cast
  const monthStart = month; // e.g. '2026-04-01'
  // Next month start computed in SQL via interval

  const isMayOrLater = month >= '2026-05-01';

  const params: unknown[] = [EXCLUDED_SELLER, monthStart];
  let p = 3;

  let extraFilters = '';
  if (date1) { extraFilters += ` AND po."markedPendingTime" >= $${p}::date`; params.push(date1); p++; }
  if (date2) { extraFilters += ` AND po."markedPendingTime" < ($${p}::date + INTERVAL '1 day')`; params.push(date2); p++; }
  if (phone) { extraFilters += ` AND b."phone" ILIKE $${p}`; params.push(`%${phone}%`); p++; }

  // Previous-month "month-till-date" window for the per-buyer comparison.
  // If the selected month is the current calendar month, compare the same
  // day-of-month range (e.g. Jun 1–11 vs May 1–11); otherwise compare the
  // full selected month against the full previous month.
  const nowDate = new Date();
  const selDate = new Date(month + 'T00:00:00');
  const isCurrentMonth =
    nowDate.getFullYear() === selDate.getFullYear() && nowDate.getMonth() === selDate.getMonth();
  const daysInSelMonth = new Date(selDate.getFullYear(), selDate.getMonth() + 1, 0).getDate();
  const cutoffDay = isCurrentMonth ? nowDate.getDate() : daysInSelMonth;
  const prevStartDate = new Date(selDate.getFullYear(), selDate.getMonth() - 1, 1);
  const prevStartStr = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}-01`;
  const prevIdx = p; params.push(prevStartStr); p++;
  const cutIdx = p; params.push(cutoffDay); p++;

  const rewardLevel = isMayOrLater
    ? `CASE
        WHEN SUM(po."amount") >= 30000 THEN 'Level 5'
        WHEN SUM(po."amount") >= 20000 THEN 'Level 4'
        WHEN SUM(po."amount") >= 10000 THEN 'Level 3'
        WHEN SUM(po."amount") >= 5000  THEN 'Level 2'
        WHEN SUM(po."amount") >= 3000  THEN 'Level 1'
        ELSE 'Not Qualified'
      END`
    : `CASE
        WHEN SUM(po."amount") >= 10000 THEN 'Level 3'
        WHEN SUM(po."amount") >= 5000  THEN 'Level 2'
        WHEN SUM(po."amount") >= 3000  THEN 'Level 1'
        ELSE 'Not Qualified'
      END`;

  const giftWon = isMayOrLater
    ? `CASE
        WHEN SUM(po."amount") >= 30000 THEN 'Airfryer/Mixer (Worth 3000)'
        WHEN SUM(po."amount") >= 20000 THEN 'CCTV/Iron (Worth 2000)'
        WHEN SUM(po."amount") >= 10000 THEN 'Speaker (Worth 1000)'
        WHEN SUM(po."amount") >= 5000  THEN 'Mini table fan (Worth 500)'
        WHEN SUM(po."amount") >= 3000  THEN 'Vastu tortoise (Worth 300)'
        ELSE 'No Gift'
      END`
    : `CASE
        WHEN SUM(po."amount") >= 10000 THEN 'Speaker (Worth 1000)'
        WHEN SUM(po."amount") >= 5000  THEN 'Mini table fan (Worth 500)'
        WHEN SUM(po."amount") >= 3000  THEN 'Vastu tortoise (Worth 300)'
        ELSE 'No Gift'
      END`;

  const pctL4 = isMayOrLater
    ? `CASE WHEN SUM(po."amount") >= 20000 THEN '100%' ELSE ROUND((SUM(po."amount") / 20000.0) * 100, 1) || '%' END`
    : `'-'`;
  const pctL5 = isMayOrLater
    ? `CASE WHEN SUM(po."amount") >= 30000 THEN '100%' ELSE ROUND((SUM(po."amount") / 30000.0) * 100, 1) || '%' END`
    : `'-'`;

  const monthLabel = new Date(month + 'T00:00:00').toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  try {
    const rows = await query<Row>(`
      SELECT
        b."id"                                                         AS buyer_id,
        COALESCE(b."name", '')                                         AS buyer_name,
        b."phone"                                                      AS buyer_phone,
        b."businessName"                                               AS buyer_business_name,
        COALESCE(b."addressLine1", '')                                 AS buyer_address_line1,
        COALESCE(b."addressLine2", '')                                 AS buyer_address_line2,
        COALESCE(b."landmark", '')                                     AS buyer_landmark,
        COALESCE(b."city", '')                                         AS buyer_city,
        COALESCE(b."district", '')                                     AS buyer_district,
        COALESCE(b."state", '')                                        AS buyer_state,
        COALESCE(b."pincode", '')                                      AS buyer_pincode,
        b."assets"->'profilePicObj'->>'Location'                       AS profile_pic,
        b."assets"->'shopBoardPhoto'->>'Location'                      AS shop_board_photo,
        b."assets"->'selfieWithShopBoardPhoto'->>'Location'            AS selfie_with_shop_board,
        b."assets"->'insideShopPhotoOfProducts'->>'Location'           AS inside_shop_products,
        b."assets"->'shopFrontPhotoFromDistance'->>'Location'          AS shop_front,
        b."assets"->'outsideShopPhotoFromDistance'->>'Location'        AS outside_shop,
        date_trunc('month', po."markedPendingTime")::date              AS monthly,
        ROUND(SUM(po."amount")::numeric, 2)                            AS qualified_amount,
        COALESCE(pm.prev_mtd_amount, 0)                                AS prev_mtd_amount,
        (b."created_at" >= $2::date
          AND b."created_at" < ($2::date + INTERVAL '1 month'))::int   AS is_new,
        CASE WHEN SUM(po."amount") >= 3000  THEN '100%'
             ELSE ROUND((SUM(po."amount") / 3000.0)  * 100, 1) || '%' END AS pct_level1,
        CASE WHEN SUM(po."amount") >= 5000  THEN '100%'
             ELSE ROUND((SUM(po."amount") / 5000.0)  * 100, 1) || '%' END AS pct_level2,
        CASE WHEN SUM(po."amount") >= 10000 THEN '100%'
             ELSE ROUND((SUM(po."amount") / 10000.0) * 100, 1) || '%' END AS pct_level3,
        ${pctL4}                                                       AS pct_level4,
        ${pctL5}                                                       AS pct_level5,
        ${rewardLevel}                                                 AS reward_level,
        ${giftWon}                                                     AS gift_won,
        COALESCE(md.placed_amount, 0)                                  AS placed_amount,
        COALESCE(md.delivered_amount, 0)                               AS delivered_amount,
        COALESCE(md.rto_amount, 0)                                     AS rto_amount,
        CASE
          WHEN COALESCE(md.placed_amount, 0) = 0 THEN '0%'
          ELSE ROUND(
            (COALESCE(md.delivered_amount, 0)::numeric / md.placed_amount::numeric) * 100, 1
          ) || '%'
        END                                                            AS pct_delivered,
        GREATEST(
          COALESCE(md.placed_amount, 0)
            - COALESCE(md.delivered_amount, 0)
            - COALESCE(md.rto_amount, 0),
          0
        )                                                              AS due_amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer"  b ON b."id"  = po."buyerId"
      JOIN "users"."seller" s ON s."id"  = po."sellerId"
      LEFT JOIN (
        SELECT
          po2."buyerId",
          SUM(CASE WHEN po2."status" NOT IN ('DRAFT','CANCELLED') THEN po2."amount" ELSE 0 END) AS placed_amount,
          SUM(CASE WHEN po2."status" = 'COMPLETED'               THEN po2."amount" ELSE 0 END) AS delivered_amount,
          SUM(CASE WHEN po2."status" = 'REJECTED'                THEN po2."amount" ELSE 0 END) AS rto_amount
        FROM "purchaseOrder"."purchaseOrder" po2
        WHERE po2."isTest"          = FALSE
          AND po2."deliveryType"    = 'INTERCITY'
          AND po2."deliveryNetwork" = 'THIRD_PARTY'
          AND po2."markedPendingTime" >= $2::date
          AND po2."markedPendingTime" <  ($2::date + INTERVAL '1 month')
        GROUP BY po2."buyerId"
      ) md ON md."buyerId" = b."id"
      LEFT JOIN (
        SELECT
          po3."buyerId",
          ROUND(SUM(po3."amount")::numeric, 2) AS prev_mtd_amount
        FROM "purchaseOrder"."purchaseOrder" po3
        JOIN "users"."seller" s3 ON s3."id" = po3."sellerId"
        WHERE po3."status" IN ('DELIVERED', 'COMPLETED')
          AND s3."isD2RBrandSeller" = TRUE
          AND s3."isTest"           = FALSE
          AND s3."businessName"     NOT ILIKE '%test%'
          AND po3."isTest"          = FALSE
          AND po3."deliveryType"    = 'INTERCITY'
          AND po3."deliveryNetwork" = 'THIRD_PARTY'
          AND po3."markedPendingTime" >= $${prevIdx}::date
          AND po3."markedPendingTime" <  ($${prevIdx}::date + ($${cutIdx} || ' days')::interval)
          AND s3."id" != $1
        GROUP BY po3."buyerId"
      ) pm ON pm."buyerId" = b."id"
      WHERE po."status" IN ('DELIVERED', 'COMPLETED')
        AND s."isD2RBrandSeller" = TRUE
        AND s."isTest"           = FALSE
        AND s."businessName"     NOT ILIKE '%test%'
        AND b."isTest"           = FALSE
        AND b."businessName"     NOT ILIKE '%test%'
        AND po."isTest"          = FALSE
        AND po."deliveryType"    = 'INTERCITY'
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."markedPendingTime" >= $2::date
        AND po."markedPendingTime" <  ($2::date + INTERVAL '1 month')
        AND s."id" != $1
        ${extraFilters}
      GROUP BY b."id", b."name", b."phone", b."businessName",
               b."addressLine1", b."addressLine2", b."landmark", b."created_at",
               monthly, md.placed_amount, md.delivered_amount, md.rto_amount,
               pm.prev_mtd_amount
      ORDER BY qualified_amount DESC
    `, params);

    return NextResponse.json({ data: rows, month_label: monthLabel, is_may_plus: isMayOrLater });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withQueryCapture(_GET);
