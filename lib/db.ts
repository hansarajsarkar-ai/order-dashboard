import { AsyncLocalStorage } from 'async_hooks';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Data access via HASURA (run_sql), not a direct Postgres connection.
// This copy reaches the same database through Hasura's admin API, so it only
// needs HASURA_GRAPHQL_ENDPOINT + HASURA_ADMIN_SECRET (no DATABASE_URL / pg).
// The query()/queryNoNestloop() signatures are unchanged, so every caller works
// as-is — parameterised SQL is inlined safely before being sent to run_sql.
// ---------------------------------------------------------------------------

// --- Per-request SQL capture (powers the dashboard's "View Query" panels) ---
export type CapturedQuery = { sql: string; params?: unknown[] };
const queryStore = new AsyncLocalStorage<CapturedQuery[]>();

function recordQuery(sql: string, params?: unknown[]): void {
  queryStore.getStore()?.push({ sql: sql.trim(), params });
}

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

// --- Safe parameter inlining (run_sql has no bind params) -------------------
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // string & everything else → standard SQL string literal (double the quotes)
  return `'${String(v).replace(/'/g, "''")}'`;
}

function inlineParams(sql: string, params?: unknown[]): string {
  if (!params || params.length === 0) return sql;
  // Replace $N tokens with escaped literals ($10 before $1 is handled by \d+).
  return sql.replace(/\$(\d+)/g, (_m, n: string) => sqlLiteral(params[Number(n) - 1]));
}

// --- run_sql transport ------------------------------------------------------
function hasuraBase(): string {
  const ep = process.env.HASURA_GRAPHQL_ENDPOINT;
  if (!ep) throw new Error('HASURA_GRAPHQL_ENDPOINT env var not set');
  return ep.replace(/\/v1\/graphql\/?$/, '');
}

async function runSql<T>(sql: string, readOnly: boolean): Promise<T[]> {
  const secret = process.env.HASURA_ADMIN_SECRET;
  if (!secret) throw new Error('HASURA_ADMIN_SECRET env var not set');
  const res = await fetch(`${hasuraBase()}/v2/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': secret },
    body: JSON.stringify({
      type: 'run_sql',
      args: { source: 'default', sql, read_only: readOnly, cascade: false },
    }),
    cache: 'no-store',
  });
  let json: { result?: unknown[][]; error?: string; internal?: { error?: { message?: string } } };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Hasura run_sql returned non-JSON (${res.status})`);
  }
  if (!res.ok || json.error || !json.result) {
    throw new Error(json.error || json.internal?.error?.message || `Hasura run_sql failed (${res.status})`);
  }
  const [header, ...rows] = json.result as string[][];
  if (!header) return [];
  // run_sql returns every cell as text and encodes a SQL NULL as the literal
  // string "NULL" (indistinguishable from a real 'NULL' string, which is
  // vanishingly rare in this data). Map it back to a real null so callers and
  // the UI (e.g. <img src>, .filter(Boolean)) see absent values correctly.
  return rows.map((r) =>
    Object.fromEntries(header.map((c, i) => [c, r[i] === 'NULL' ? null : r[i]]))
  ) as T[];
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  recordQuery(sql, params);
  try {
    return await runSql<T>(inlineParams(sql, params), true);
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// Like query(), but disables nested-loop joins for this statement (heavy
// multi-day calling-team joins). Sent as a session SET in the same run_sql
// batch so the following SELECT is planned with nestloops off.
export async function queryNoNestloop<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  recordQuery(sql, params);
  try {
    const batched = `SET enable_nestloop = off;\n${inlineParams(sql, params)}`;
    return await runSql<T>(batched, false);
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// getPool() compatibility shim for the transactional WRITE routes
// (order-place / cancel / reject / approve). The original code used a real
// pg Pool + client with BEGIN/COMMIT/ROLLBACK. Hasura run_sql is stateless per
// HTTP call, so a server-side transaction can't span multiple client.query()
// calls. This shim proxies each statement to run_sql and treats the
// transaction-control keywords as no-ops. Statements still execute, but they
// are NOT atomic — a mid-sequence failure leaves earlier writes committed.
// The read-only analytics dashboards (QPS/badho) don't use this path.
// ---------------------------------------------------------------------------
type PgResult<T> = { rows: T[]; rowCount: number };

// Structural type for the shim client, used by callers that previously
// imported pg's PoolClient for their helper signatures.
export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<PgResult<T>>;
  release?: () => void;
};

const TX_CONTROL = /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;?\s*$/i;

async function clientQuery<T>(sql: string, params?: unknown[]): Promise<PgResult<T>> {
  if (TX_CONTROL.test(sql)) {
    // No persistent session over run_sql — transaction control is a no-op.
    return { rows: [], rowCount: 0 };
  }
  recordQuery(sql, params);
  const rows = await runSql<T>(inlineParams(sql, params), false);
  return { rows, rowCount: rows.length };
}

export function getPool() {
  return {
    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      clientQuery<T>(sql, params),
    connect: async () => ({
      query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
        clientQuery<T>(sql, params),
      release: () => {},
    }),
  };
}
