import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Daily Delhivery PO count broken down by zone. Same WHERE clause as
// /api/order-zone-pivot so the two views agree. Returns one row per date with
// a column per zone.

interface Row {
  date: string;
  zone: string;
  cnt: string;
}

const ZONE_ORDER = ['A', 'B', 'C1', 'C2', 'D1', 'D2', 'E', 'F'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = searchParams.get('startDate') || fmt(firstOfMonth);
  const endDate = searchParams.get('endDate') || fmt(today);

  try {
    const sql = `
      SELECT
        to_char(a."created_at"::date, 'YYYY-MM-DD')        AS date,
        a."deliveryCostReportJSON" -> 0 ->> 'zone'         AS zone,
        COUNT(*)::text                                     AS cnt
      FROM "deliveries"."intercityDelivery" a
      JOIN "purchaseOrder"."purchaseOrder" b ON b."id" = a."purchaseOrderId"
      JOIN "users"."seller"                s ON s."id" = b."sellerId"
      JOIN "users"."buyer"                 c ON c."id" = b."buyerId"
      WHERE a."created_at"::date >= $1
        AND a."created_at"::date <= $2
        AND s."isTest" = FALSE
        AND s."businessName" NOT ILIKE '%test%'
        AND c."isTest" = FALSE
        AND c."businessName" NOT ILIKE '%test%'
        AND a."deliveryPartnerId" = 'DELHIVERY'
        AND a."deliveryCostReportJSON" -> 0 ->> 'zone' IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2;
    `;

    const rows = await query<Row>(sql, [startDate, endDate]);

    const dateMap = new Map<string, Record<string, number>>();
    const zoneSet = new Set<string>();
    for (const r of rows) {
      const z = r.zone || '(none)';
      zoneSet.add(z);
      if (!dateMap.has(r.date)) dateMap.set(r.date, {});
      dateMap.get(r.date)![z] = (dateMap.get(r.date)![z] || 0) + parseInt(r.cnt);
    }

    const zoneIndex = (z: string) => {
      const i = ZONE_ORDER.indexOf(z);
      return i === -1 ? ZONE_ORDER.length : i;
    };
    const zones = Array.from(zoneSet).sort((a, b) => {
      const ai = zoneIndex(a);
      const bi = zoneIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    const data = Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, byZone]) => {
        const row: Record<string, number | string> = { date };
        let total = 0;
        for (const z of zones) {
          const v = byZone[z] || 0;
          row[z] = v;
          total += v;
        }
        row.total = total;
        return row;
      });

    return NextResponse.json({
      startDate,
      endDate,
      zones,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
