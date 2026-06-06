import { Pool } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { NextResponse } from 'next/server';

let pool: Pool | null = null;

// --- Per-request SQL capture (powers the dashboard's "View Query" panels) ---
// Each API route is wrapped with withQueryCapture(), which opens an async context
// store. Every query()/queryNoNestloop() call run inside that context records its
// SQL + params, and the wrapper injects them into the JSON response as `__queries`.
export type CapturedQuery = { sql: string; params?: unknown[] };
const queryStore = new AsyncLocalStorage<CapturedQuery[]>();

function recordQuery(sql: string, params?: unknown[]): void {
  queryStore.getStore()?.push({ sql: sql.trim(), params });
}

// Wraps a route handler so all SQL it runs is captured and appended to the
// response body as `__queries` (only for JSON object responses that ran ≥1 query).
// Headers (incl. Cache-Control) and status are preserved.
export function withQueryCapture<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    const store: CapturedQuery[] = [];
    const res = await queryStore.run(store, () => handler(...args));
    if (store.length === 0) return res;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return res;
    try {
      const body = await res.clone().json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const merged = NextResponse.json({ ...body, __queries: store }, { status: res.status });
        res.headers.forEach((v, k) => {
          if (k.toLowerCase() === 'content-length' || k.toLowerCase() === 'content-type') return;
          merged.headers.set(k, v);
        });
        return merged;
      }
    } catch {
      /* non-object or unreadable body — return original untouched */
    }
    return res;
  };
}

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL env var not set');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      application_name: 'coupon-dashboard',
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      pool = null;
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  recordQuery(sql, params);
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// Like query(), but disables nested-loop joins for this statement only (via a
// transaction-scoped SET LOCAL). Use for the calling-team order joins, where a
// rows=1 estimate on materialized CTEs otherwise makes Postgres nested-loop two
// large sets over a date range — fine for a single day, catastrophic for 30.
export async function queryNoNestloop<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  recordQuery(sql, params);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL enable_nestloop = off');
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result.rows as T[];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Query error:', err);
    throw err;
  } finally {
    client.release();
  }
}
