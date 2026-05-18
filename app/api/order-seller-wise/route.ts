import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  seller_id: string;
  seller_phone: string | null;
  seller_business_name: string | null;
  status: string;
  count: string;
  amount: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const year = parseInt(searchParams.get('year') || String(currentYear));
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // Date filter overrides the year filter when provided.
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

    const sql = `
      SELECT
        s."id"::text          AS seller_id,
        s."phone"             AS seller_phone,
        s."businessName"      AS seller_business_name,
        po."status"           AS status,
        COUNT(*)              AS count,
        COALESCE(SUM(po."amount"::numeric), 0)::text AS amount
      FROM "purchaseOrder"."purchaseOrder" po
      JOIN "users"."buyer" b ON b."id" = po."buyerId"
      JOIN "users"."seller" s ON s."id" = po."sellerId"
      WHERE po."isTest" = FALSE
        AND po."isFalseOrder" = FALSE
        AND b."isTest" = FALSE
        AND b."businessName" NOT ILIKE '%test%'
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND s."isD2RBrandSeller" = TRUE
        AND po."deliveryNetwork" = 'THIRD_PARTY'
        AND po."deliveryType"    = 'INTERCITY'
        AND po."status" != 'DRAFT'
        AND po."markedPendingTime" IS NOT NULL
        ${whereDate}
      GROUP BY s."id", s."phone", s."businessName", po."status"
      ORDER BY s."businessName" ASC, po."status" ASC;
    `;

    const rows = await query<Row>(sql, params);

    type Cell = { count: number; amount: number };
    type Seller = {
      sellerId: string;
      sellerPhone: string | null;
      sellerBusinessName: string | null;
      statuses: Record<string, Cell>;
      total: Cell;
    };

    const sellerMap = new Map<string, Seller>();
    const statusTotals: Record<string, Cell> = {};
    const grand: Cell = { count: 0, amount: 0 };

    for (const r of rows) {
      const count = parseInt(r.count);
      const amount = parseFloat(r.amount);
      const status = r.status;

      let seller = sellerMap.get(r.seller_id);
      if (!seller) {
        seller = {
          sellerId: r.seller_id,
          sellerPhone: r.seller_phone,
          sellerBusinessName: r.seller_business_name,
          statuses: {},
          total: { count: 0, amount: 0 },
        };
        sellerMap.set(r.seller_id, seller);
      }
      seller.statuses[status] = { count, amount };
      seller.total.count += count;
      seller.total.amount += amount;

      if (!statusTotals[status]) statusTotals[status] = { count: 0, amount: 0 };
      statusTotals[status].count += count;
      statusTotals[status].amount += amount;

      grand.count += count;
      grand.amount += amount;
    }

    const statuses = Object.keys(statusTotals).sort(
      (a, b) => statusTotals[b].count - statusTotals[a].count
    );

    const data = Array.from(sellerMap.values()).sort(
      (a, b) => b.total.count - a.total.count
    );

    return NextResponse.json({
      data,
      statuses,
      totals: { byStatus: statusTotals, grand },
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
