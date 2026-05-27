import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  dated: string | Date;
  po: string;
}

type DataRecord = Record<string, string | number>;

export async function GET() {
  try {
    const sql = `
      SELECT
        a."markedPendingTime" :: date AS dated,
        a."status",
        count(distinct a."poNumber") AS po
      FROM "purchaseOrder"."purchaseOrder" a
      JOIN "users"."seller" AS b ON b."id" = a."sellerId"
      JOIN "users"."buyer"  AS c ON c."id" = a."buyerId"
      WHERE a."deliveryType"    = 'INTERCITY'
        AND a."deliveryNetwork" = 'THIRD_PARTY'
        AND a."status" NOT IN ('REJECTED','CANCELLED')
        AND a."markedPendingTime" IS NOT NULL
        AND b."isTest" = FALSE AND b."businessName" NOT ILIKE '%test%'
        AND c."isTest" = FALSE AND c."businessName" NOT ILIKE '%test%'
        AND a."isTest" = FALSE AND a."isFalseOrder" = FALSE
        AND a."markedPendingTime" :: date >= current_date - 30
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2
    `;

    const rows = await query<Row>(sql, []);

    const dataMap = new Map<string, DataRecord>();

    rows.forEach((row) => {
      let dateStr: string;
      if (typeof row.dated === 'string') {
        dateStr = row.dated.split('T')[0];
      } else if (row.dated instanceof Date) {
        dateStr = row.dated.toISOString().split('T')[0];
      } else {
        dateStr = String(row.dated).split('T')[0];
      }
      if (!dataMap.has(dateStr)) {
        dataMap.set(dateStr, { date: dateStr });
      }
      const record = dataMap.get(dateStr)!;
      record[row.status] = parseInt(row.po);
    });

    const statuses = Array.from(new Set(rows.map(r => r.status))).sort();

    const data = Array.from(dataMap.values()).sort((a, b) => {
      const dateA = new Date(a.date as string);
      const dateB = new Date(b.date as string);
      return dateA.getTime() - dateB.getTime();
    }).map(record => {
      const result: DataRecord = { date: record.date };
      statuses.forEach(status => {
        result[status] = (record[status] as number) || 0;
      });
      return result;
    });

    const grand = {
      totalOrders: rows.reduce((sum, r) => sum + parseInt(r.po), 0),
      statusBreakdown: statuses.reduce((acc, status) => {
        acc[status] = rows
          .filter(r => r.status === status)
          .reduce((sum, r) => sum + parseInt(r.po), 0);
        return acc;
      }, {} as Record<string, number>)
    };

    return NextResponse.json({
      data,
      statuses,
      grand,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    console.error('Order Anomalies API Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
