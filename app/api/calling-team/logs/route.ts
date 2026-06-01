import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { parseFilters, buildWhere, CONNECTED_EXPR, DURATION_EXPR } from '../_filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const f = parseFilters(req);
  const { sql: where, params } = buildWhere(f);

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') || '50')));
  const offset = (page - 1) * pageSize;

  try {
    // Summary across the filter set.
    const summary = await query<{
      total: string;
      connected: string;
      missed: string;
      no_answer: string;
      unique_customers: string;
      unique_agents: string;
      total_talk_time: string;
      avg_duration: string;
    }>(
      `
      SELECT
        COUNT(*)::text AS total,
        SUM(${CONNECTED_EXPR}::int)::text AS connected,
        SUM((call_status = 'Missed')::int)::text AS missed,
        SUM((call_status = 'No Answer')::int)::text AS no_answer,
        COUNT(DISTINCT call_to_number) FILTER (WHERE call_to_number IS NOT NULL AND call_to_number <> '')::text AS unique_customers,
        COUNT(DISTINCT agent_name) FILTER (WHERE agent_name IS NOT NULL AND agent_name <> '')::text AS unique_agents,
        SUM(${DURATION_EXPR})::text AS total_talk_time,
        AVG(${DURATION_EXPR}) FILTER (WHERE ${CONNECTED_EXPR} AND ${DURATION_EXPR} > 0)::text AS avg_duration
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      `,
      params,
    );

    // Paged rows.
    const pageParams = [...params, pageSize, offset];
    const rows = await query<{
      id: string;
      call_id: string;
      start_stamp: string;
      start_date: string;
      start_time: string;
      end_stamp: string;
      direction: string;
      duration: string;
      call_status: string;
      agent_name: string;
      agent_number: string;
      call_to_number: string;
      caller_id_number: string;
      campaign_name: string;
      campaign_id: string;
      disposition_code: string;
      disposition_name: string;
      sub_disposition: string;
      recording_url: string;
      lead_id: string;
    }>(
      `
      SELECT
        id, call_id, start_stamp, start_date, start_time, end_stamp,
        direction,
        COALESCE(NULLIF(duration,''), '0') AS duration,
        call_status, agent_name, agent_number,
        call_to_number, caller_id_number,
        campaign_name, campaign_id,
        disposition->>'code' AS disposition_code,
        disposition->>'name' AS disposition_name,
        sub_disposition,
        recording_url,
        lead_id
      FROM "smartFlo"."call_logs"
      WHERE ${where}
      ORDER BY start_stamp DESC NULLS LAST
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}
      `,
      pageParams,
    );

    const s = summary[0];
    const total = Number(s.total || 0);
    const connected = Number(s.connected || 0);
    return NextResponse.json({
      summary: {
        total,
        connected,
        missed: Number(s.missed || 0),
        noAnswer: Number(s.no_answer || 0),
        connectionRate: total ? connected / total : 0,
        uniqueCustomers: Number(s.unique_customers || 0),
        uniqueAgents: Number(s.unique_agents || 0),
        totalTalkTime: Number(s.total_talk_time || 0),
        avgDuration: Math.round(Number(s.avg_duration || 0)),
      },
      rows: rows.map((r) => ({
        id: r.id,
        callId: r.call_id,
        startStamp: r.start_stamp,
        startDate: r.start_date,
        startTime: r.start_time,
        endStamp: r.end_stamp,
        direction: r.direction,
        duration: Number(r.duration || 0),
        callStatus: r.call_status,
        agentName: r.agent_name,
        agentNumber: r.agent_number,
        callToNumber: r.call_to_number,
        callerIdNumber: r.caller_id_number,
        campaignName: r.campaign_name,
        campaignId: r.campaign_id,
        dispositionCode: r.disposition_code,
        dispositionName: r.disposition_name,
        subDisposition: r.sub_disposition,
        recordingUrl: r.recording_url,
        leadId: r.lead_id,
      })),
      page,
      pageSize,
    });
  } catch (err) {
    console.error('logs error', err);
    return NextResponse.json({ error: 'Failed to load call logs' }, { status: 500 });
  }
}
