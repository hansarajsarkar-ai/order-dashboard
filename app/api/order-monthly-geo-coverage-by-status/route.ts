import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string | null;
  month: number | null;
  orders: string;
  amount: string;
  pincode_covered: string;
  city_covered: string;
  district_covered: string;
  state_covered: string;
}

type Covered = { pincode: number; city: number; district: number; state: number };
type Cell = { covered: Covered; orders: number; amount: number };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));

  try {
    // GROUPING SETS gives correct COUNT(DISTINCT) at every rollup level in one pass:
    //   (status, month) → cells, (status) → row totals, (month) → column totals, () → grand total.
    const sql = `
      WITH base AS (
        SELECT
          po."status"                                     AS status,
          EXTRACT(MONTH FROM po."markedPendingTime")::int AS month,
          po."amount"::numeric                            AS amount,
          b."pincode"                                     AS pincode,
          b."city"                                        AS city,
          b."district"                                    AS district,
          b."state"                                       AS state
        FROM "purchaseOrder"."purchaseOrder" po
        JOIN "users"."buyer"  b ON b."id" = po."buyerId"
        JOIN "users"."seller" s ON s."id" = po."sellerId"
        WHERE po."isTest"          = FALSE
          AND po."isFalseOrder"    = FALSE
          AND b."isTest"           = FALSE
          AND b."businessName" NOT ILIKE '%test%'
          AND s."isTest"           = FALSE
          AND s."businessName" NOT ILIKE '%test%'
          AND s."isD2RBrandSeller" = TRUE
          AND po."deliveryNetwork" = 'THIRD_PARTY'
          AND po."deliveryType"    = 'INTERCITY'
          AND po."status"         != 'DRAFT'
          AND po."markedPendingTime" IS NOT NULL
          AND EXTRACT(YEAR FROM po."markedPendingTime") = $1
      )
      SELECT
        status,
        month,
        COUNT(*)::text                                                                                   AS orders,
        COALESCE(SUM(amount), 0)::text                                                                   AS amount,
        COUNT(DISTINCT pincode)            FILTER (WHERE pincode  IS NOT NULL AND pincode  <> '')::text   AS pincode_covered,
        COUNT(DISTINCT (state, city))      FILTER (WHERE city     IS NOT NULL AND city     <> '')::text   AS city_covered,
        COUNT(DISTINCT (state, district))  FILTER (WHERE district IS NOT NULL AND district <> '')::text   AS district_covered,
        COUNT(DISTINCT state)              FILTER (WHERE state    IS NOT NULL AND state    <> '')::text   AS state_covered
      FROM base
      GROUP BY GROUPING SETS ((status, month), (status), (month), ())
      ORDER BY status NULLS LAST, month NULLS LAST;
    `;

    const rows = await query<Row>(sql, [year]);

    const toCovered = (r: Row): Covered => ({
      pincode: parseInt(r.pincode_covered),
      city: parseInt(r.city_covered),
      district: parseInt(r.district_covered),
      state: parseInt(r.state_covered),
    });
    const toCell = (r: Row): Cell => ({ covered: toCovered(r), orders: parseInt(r.orders), amount: parseFloat(r.amount) });

    const statusMap: Record<string, { months: Record<number, Cell>; total: Cell }> = {};
    const byMonth: Record<number, Cell> = {};
    let grand: Cell = { covered: { pincode: 0, city: 0, district: 0, state: 0 }, orders: 0, amount: 0 };

    for (const r of rows) {
      const hasStatus = r.status !== null && r.status !== undefined;
      const hasMonth = r.month !== null && r.month !== undefined;

      if (hasStatus && hasMonth) {
        const s = r.status as string;
        if (!statusMap[s]) statusMap[s] = { months: {}, total: { covered: { pincode: 0, city: 0, district: 0, state: 0 }, orders: 0, amount: 0 } };
        statusMap[s].months[Number(r.month)] = toCell(r);
      } else if (hasStatus && !hasMonth) {
        const s = r.status as string;
        if (!statusMap[s]) statusMap[s] = { months: {}, total: { covered: { pincode: 0, city: 0, district: 0, state: 0 }, orders: 0, amount: 0 } };
        statusMap[s].total = toCell(r);
      } else if (!hasStatus && hasMonth) {
        byMonth[Number(r.month)] = toCell(r);
      } else {
        grand = toCell(r);
      }
    }

    const statuses = Object.keys(statusMap).sort((a, b) => statusMap[b].total.orders - statusMap[a].total.orders);
    const data = statuses.map((status) => ({ status, months: statusMap[status].months, total: statusMap[status].total }));

    return NextResponse.json({
      data,
      totals: { byMonth, grand },
      year,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
