import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function rawQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export function emptyToNull(v: any): any {
  if (v === "" || v === undefined) return null;
  return v;
}

export function cleanParams(params: any[]): any[] {
  return params.map(emptyToNull);
}

export async function rawExecute(
  sql: string,
  params: any[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  const cleanSQL = sql.trimEnd().replace(/;$/, "");
  const hasReturning = /RETURNING/i.test(cleanSQL);
  const finalSQL = hasReturning ? cleanSQL : `${cleanSQL} RETURNING id`;

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
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
