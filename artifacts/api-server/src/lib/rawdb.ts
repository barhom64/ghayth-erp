import pg from "pg";
import { logger } from "./logger.js";

const { Pool } = pg;

let _pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be set");
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    const real = getPool();
    const val = Reflect.get(real, prop, receiver);
    return typeof val === "function" ? val.bind(real) : val;
  },
});

export async function rawQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export function emptyToNull(v: any): any {
  if (v === "" || v === undefined) return null;
  return v;
}

export function cleanParams(params: unknown[]): any[] {
  return params.map(emptyToNull);
}

export async function rawExecute(
  sql: string,
  params: unknown[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  const cleanSQL = sql.trimEnd().replace(/;$/, "");
  const hasReturning = /RETURNING/i.test(cleanSQL);
  const isDDL = /^\s*(CREATE|ALTER|DROP|TRUNCATE|COMMENT|GRANT|REVOKE|SET|DO|VACUUM|ANALYZE|REINDEX)\b/i.test(cleanSQL);
  const finalSQL = hasReturning || isDDL ? cleanSQL : `${cleanSQL} RETURNING id`;

  const result = await pool.query(finalSQL, cleanParams(params));
  const insertId = result.rows[0]?.id ?? 0;
  return { insertId, affectedRows: result.rowCount ?? 0 };
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logger.error(rollbackErr, "[withTransaction] ROLLBACK failed — original error follows");
    }
    throw err;
  } finally {
    client.release();
  }
}
