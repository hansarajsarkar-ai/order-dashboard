import { Pool } from 'pg';

let pool: Pool | null = null;

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
