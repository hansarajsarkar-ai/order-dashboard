import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Seller × Delhivery zone × delivery status pivot, with order count and
// charged weight (kg). Zone + charged weight come from the first element of
// intercityDelivery.deliveryCostReportJSON. Weight stored in grams, converted
// to kg in SQL.

interface Row {
  seller: string;
  zone: string;
  status: string;
  po_count: string;
  weight_kg: string;
}

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
        COALESCE(s."businessName", '(unknown)')                                                 AS seller,
        a."deliveryCostReportJSON" -> 0 ->> 'zone'                                              AS zone,
        a."status"                                                                              AS status,
        COUNT(*)::text                                                                          AS po_count,
        COALESCE(
          SUM(NULLIF(a."deliveryCostReportJSON" -> 0 ->> 'charged_weight', '')::numeric), 0
        )::numeric / 1000.0                                                                     AS weight_kg
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
      GROUP BY 1, 2, 3
      ORDER BY seller, zone, status;
    `;

    const rows = await query<Row>(sql, [startDate, endDate]);

    interface Cell { count: number; weightKg: number; }
    type SellerData = Record<string, Record<string, Cell>>; // zone -> status -> cell
    const data: Record<string, SellerData> = {};
    const sellerTotals = new Map<string, Cell>();
    const zoneTotals   = new Map<string, Cell>();
    const statusTotals = new Map<string, Cell>();
    const grand: Cell = { count: 0, weightKg: 0 };

    const zoneSet = new Set<string>();
    const statusSet = new Set<string>();

    const bump = (m: Map<string, Cell>, k: string, c: Cell) => {
      const cur = m.get(k) || { count: 0, weightKg: 0 };
      cur.count += c.count;
      cur.weightKg += c.weightKg;
      m.set(k, cur);
    };

    for (const r of rows) {
      const count = parseInt(r.po_count);
      const weightKg = parseFloat(r.weight_kg);
      const cell: Cell = { count, weightKg };
      const seller = r.seller;
      const zone = r.zone || '(none)';
      const status = r.status || '(unknown)';

      zoneSet.add(zone);
      statusSet.add(status);

      if (!data[seller]) data[seller] = {};
      if (!data[seller][zone]) data[seller][zone] = {};
      data[seller][zone][status] = cell;

      bump(sellerTotals, seller, cell);
      bump(zoneTotals,   zone,   cell);
      bump(statusTotals, status, cell);
      grand.count    += count;
      grand.weightKg += weightKg;
    }

    const sellers = Array.from(sellerTotals.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([s]) => s);

    // Canonical Delhivery zone order (matches their published rate card).
    const ZONE_ORDER = ['A', 'B', 'C1', 'C2', 'D1', 'D2', 'E', 'F'];
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

    const statuses = Array.from(statusSet).sort((a, b) => {
      const av = statusTotals.get(a)?.count || 0;
      const bv = statusTotals.get(b)?.count || 0;
      return bv - av;
    });

    return NextResponse.json({
      startDate,
      endDate,
      sellers,
      zones,
      statuses,
      data,
      sellerTotals: Object.fromEntries(sellerTotals),
      zoneTotals:   Object.fromEntries(zoneTotals),
      statusTotals: Object.fromEntries(statusTotals),
      grand,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
