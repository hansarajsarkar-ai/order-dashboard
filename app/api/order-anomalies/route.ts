import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Row {
  status: string;
  created_at: string;
  count: string;
}

export async function GET(req: NextRequest) {
  try {
    const sql = `
      SELECT
        "status",
        "created_at" :: date as created_at,
        count(distinct "poNumber") as count
      FROM "purchaseOrder"."purchaseOrder"
      WHERE "isTest" = false
        AND "isFalseOrder" = false
        AND "status" NOT IN ('DRAFT','CANCELLED','REJECTED')
        AND "createdBy" IN ('employee','buyer')
        AND "created_at" :: date >= current_date - 30
      GROUP BY "status", "created_at" :: date
      ORDER BY "created_at" DESC, "status"
    `;

    const rows = await query<Row>(sql, []);

    // Transform data for chart
    const dataMap = new Map<string, Record<string, number>>();

    rows.forEach((row) => {
      // Extract just the date part (YYYY-MM-DD)
      let dateStr: string;
      if (typeof row.created_at === 'string') {
        dateStr = row.created_at.split('T')[0];
      } else if (row.created_at instanceof Date) {
        const d = new Date(row.created_at);
        dateStr = d.toISOString().split('T')[0];
      } else {
        dateStr = String(row.created_at).split('T')[0];
      }
      const dateKey = dateStr;
      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, { date: dateKey });
      }
      const record = dataMap.get(dateKey)!;
      record[row.status] = parseInt(row.count);
    });

    // Get all unique statuses to ensure consistent keys
    const statuses = Array.from(new Set(rows.map(r => r.status))).sort();

    // Convert map to array and ensure all status columns exist
    const data = Array.from(dataMap.values()).sort((a, b) => {
      const dateA = new Date(a.date as string);
      const dateB = new Date(b.date as string);
      return dateA.getTime() - dateB.getTime();
    }).map(record => {
      const result: Record<string, any> = { date: record.date };
      statuses.forEach(status => {
        result[status] = record[status] || 0;
      });
      return result;
    });

    const grand = {
      totalOrders: rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      statusBreakdown: statuses.reduce((acc, status) => {
        acc[status] = rows
          .filter(r => r.status === status)
          .reduce((sum, r) => sum + parseInt(r.count), 0);
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
