import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { appendMonthsFilter } from '@/lib/monthsFilter';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  month: string;
  slab_0_500: string;
  slab_500_1000: string;
  slab_1000_2000: string;
  slab_2000_plus: string;
  total: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // Date filter parity with the rest of the Seller wise tab.
    const params: (string | number)[] = [];
    let whereDate = '';
    if (startDate || endDate) {
      if (startDate) {
        params.push(startDate);
        whereDate += ` AND po."markedPendingTime"::date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        whereDate += ` AND po."markedPendingTime"::date <= $${params.length}`;
      }
    } else {
      params.push(year);
      whereDate = ` AND EXTRACT(YEAR FROM po."markedPendingTime") = $${params.length}`;
    }
    whereDate += appendMonthsFilter(searchParams.get('months'), 'po."markedPendingTime"', params);

    const sql = `
      SELECT
        s."id"::text                                         AS seller_id,
        s."phone"                                            AS seller_phone,
        s."businessName"                                     AS seller_business_name,
        EXTRACT(MONTH FROM po."markedPendingTime")::int      AS month,
        COUNT(*) FILTER (WHERE po."amount"::numeric < 500)                                                          AS slab_0_500,
        COUNT(*) FILTER (WHERE po."amount"::numeric >= 500   AND po."amount"::numeric < 1000)                       AS slab_500_1000,
        COUNT(*) FILTER (WHERE po."amount"::numeric >= 1000  AND po."amount"::numeric <= 2000)                      AS slab_1000_2000,
        COUNT(*) FILTER (WHERE po."amount"::numeric > 2000)                                                         AS slab_2000_plus,
        COUNT(*)                                             AS total
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
        AND po."status" IN ('DELIVERED', 'COMPLETED')
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
      GROUP BY s."id", s."phone", s."businessName", EXTRACT(MONTH FROM po."markedPendingTime");
    `;

    const rows = await query<Row>(sql, params);

    interface Slabs {
      s0_500: number;
      s500_1000: number;
      s1000_2000: number;
      s2000_plus: number;
      total: number;
    }
    const empty = (): Slabs => ({ s0_500: 0, s500_1000: 0, s1000_2000: 0, s2000_plus: 0, total: 0 });

    interface Seller {
      sellerId: string;
      sellerPhone: string | null;
      sellerBusinessName: string | null;
      months: Record<number, Slabs>;
      total: Slabs;
    }

    const sellerMap = new Map<string, Seller>();
    const activeMonths = new Set<number>();
    const byMonth: Record<number, Slabs> = {};
    const grand: Slabs = empty();

    for (const r of rows) {
      const month = parseInt(String(r.month));
      activeMonths.add(month);
      const cell: Slabs = {
        s0_500: parseInt(r.slab_0_500),
        s500_1000: parseInt(r.slab_500_1000),
        s1000_2000: parseInt(r.slab_1000_2000),
        s2000_plus: parseInt(r.slab_2000_plus),
        total: parseInt(r.total),
      };

      let seller = sellerMap.get(r.seller_id);
      if (!seller) {
        seller = {
          sellerId: r.seller_id,
          sellerPhone: r.seller_phone,
          sellerBusinessName: r.seller_business_name,
          months: {},
          total: empty(),
        };
        sellerMap.set(r.seller_id, seller);
      }
      seller.months[month] = cell;
      seller.total.s0_500     += cell.s0_500;
      seller.total.s500_1000  += cell.s500_1000;
      seller.total.s1000_2000 += cell.s1000_2000;
      seller.total.s2000_plus += cell.s2000_plus;
      seller.total.total      += cell.total;

      if (!byMonth[month]) byMonth[month] = empty();
      byMonth[month].s0_500     += cell.s0_500;
      byMonth[month].s500_1000  += cell.s500_1000;
      byMonth[month].s1000_2000 += cell.s1000_2000;
      byMonth[month].s2000_plus += cell.s2000_plus;
      byMonth[month].total      += cell.total;

      grand.s0_500     += cell.s0_500;
      grand.s500_1000  += cell.s500_1000;
      grand.s1000_2000 += cell.s1000_2000;
      grand.s2000_plus += cell.s2000_plus;
      grand.total      += cell.total;
    }

    const data = Array.from(sellerMap.values()).sort((a, b) => b.total.total - a.total.total);
    const months = Array.from(activeMonths).sort((a, b) => a - b);

    return NextResponse.json({
      data,
      months,
      totals: { byMonth, grand },
      year,
      startDate: startDate || null,
      endDate: endDate || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
