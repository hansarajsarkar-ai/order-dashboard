// Shared filter helpers for /api/calling-team/* routes.
// Date filtering is on start_date (text, ISO 'YYYY-MM-DD') so plain string compare works.

import type { NextRequest } from 'next/server';

export interface CallFilters {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  agent?: string | null;
  campaign?: string | null;
  direction?: string | null;
  status?: string | null;
  customer?: string | null; // last 10 digits
  minDuration?: number | null;
  maxDuration?: number | null;
  hour?: number | null;     // 0-23
  weekday?: number | null;  // 0-6 (Sun-Sat, Postgres DOW)
}

export function parseFilters(req: NextRequest): CallFilters {
  const { searchParams } = new URL(req.url);
  // Defaults: last 30 days ending today.
  const today = new Date();
  const def_end = today.toISOString().slice(0, 10);
  const def_start = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return {
    startDate: searchParams.get('startDate') || def_start,
    endDate: searchParams.get('endDate') || def_end,
    agent: searchParams.get('agent'),
    campaign: searchParams.get('campaign'),
    direction: searchParams.get('direction'),
    status: searchParams.get('status'),
    customer: searchParams.get('customer'),
    minDuration: numOrNull(searchParams.get('minDuration')),
    maxDuration: numOrNull(searchParams.get('maxDuration')),
    hour: numOrNull(searchParams.get('hour')),
    weekday: numOrNull(searchParams.get('weekday')),
  };
}

function numOrNull(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = parseInt(v);
  return Number.isFinite(n) ? n : null;
}

// Builds a WHERE clause + params from filters.
// Use `start` as a fresh paramIndex (1-based).
export function buildWhere(f: CallFilters): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  params.push(f.startDate);
  clauses.push(`start_date >= $${params.length}`);
  params.push(f.endDate);
  clauses.push(`start_date <= $${params.length}`);

  if (f.agent) {
    const agents = f.agent.split(',').map((s) => s.trim()).filter(Boolean);
    if (agents.length) {
      const placeholders = agents.map(() => {
        params.push(null);
        return `$${params.length}`;
      });
      agents.forEach((a, i) => {
        params[params.length - agents.length + i] = a;
      });
      clauses.push(`agent_name IN (${placeholders.join(',')})`);
    }
  }

  if (f.campaign) {
    const cs = f.campaign.split(',').map((s) => s.trim()).filter(Boolean);
    if (cs.length) {
      const placeholders = cs.map(() => {
        params.push(null);
        return `$${params.length}`;
      });
      cs.forEach((c, i) => {
        params[params.length - cs.length + i] = c;
      });
      clauses.push(`campaign_name IN (${placeholders.join(',')})`);
    }
  }

  if (f.direction) {
    const dirs = f.direction.split(',').map((s) => s.trim()).filter(Boolean);
    if (dirs.length) {
      // Each value may be a bucket ('outbound', 'inbound') or a literal direction value.
      const exprs: string[] = [];
      for (const d of dirs) {
        const ld = d.toLowerCase();
        if (ld === 'outbound') {
          exprs.push(`(LOWER(direction) = 'outbound' OR direction = 'Manual')`);
        } else if (ld === 'inbound') {
          exprs.push(`(LOWER(direction) = 'inbound' OR direction = 'C')`);
        } else {
          params.push(d);
          exprs.push(`direction = $${params.length}`);
        }
      }
      clauses.push(`(${exprs.join(' OR ')})`);
    }
  }

  if (f.status) {
    const statuses = f.status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      // Each value may be a bucket ('connected', 'no_answer', 'missed') or a literal call_status.
      const exprs: string[] = [];
      for (const s of statuses) {
        const ls = s.toLowerCase();
        if (ls === 'connected') {
          exprs.push(`UPPER(call_status) IN ('ANSWERED','ANSWER')`);
        } else if (ls === 'no_answer') {
          exprs.push(`call_status = 'No Answer'`);
        } else if (ls === 'missed') {
          exprs.push(`call_status = 'Missed'`);
        } else {
          params.push(s);
          exprs.push(`call_status = $${params.length}`);
        }
      }
      clauses.push(`(${exprs.join(' OR ')})`);
    }
  }

  if (f.customer) {
    const cust = f.customer.replace(/\D/g, '').slice(-10);
    if (cust.length >= 4) {
      params.push(cust);
      clauses.push(`RIGHT(call_to_number, 10) = $${params.length}`);
    }
  }

  if (f.minDuration !== null && f.minDuration !== undefined) {
    params.push(f.minDuration);
    clauses.push(`COALESCE(NULLIF(duration,'')::int, 0) >= $${params.length}`);
  }
  if (f.maxDuration !== null && f.maxDuration !== undefined) {
    params.push(f.maxDuration);
    clauses.push(`COALESCE(NULLIF(duration,'')::int, 0) <= $${params.length}`);
  }

  if (f.hour !== null && f.hour !== undefined) {
    params.push(f.hour);
    clauses.push(`EXTRACT(HOUR FROM start_stamp::timestamp) = $${params.length}`);
  }
  if (f.weekday !== null && f.weekday !== undefined) {
    params.push(f.weekday);
    clauses.push(`EXTRACT(DOW FROM start_date::date) = $${params.length}`);
  }

  return { sql: clauses.join(' AND '), params };
}

// Common SQL expressions reused across endpoints.
export const CONNECTED_EXPR = `(UPPER(call_status) IN ('ANSWERED','ANSWER'))`;
export const MISSED_EXPR = `(call_status = 'Missed')`;
export const NO_ANSWER_EXPR = `(call_status = 'No Answer')`;
export const DURATION_EXPR = `COALESCE(NULLIF(duration,'')::int, 0)`;
export const MEANINGFUL_EXPR = `(UPPER(call_status) IN ('ANSWERED','ANSWER') AND COALESCE(NULLIF(duration,'')::int, 0) >= 30)`;
