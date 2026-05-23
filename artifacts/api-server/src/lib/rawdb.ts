import pg from "pg";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { recordQuery } from "./observability.js";
import { AsyncLocalStorage } from "node:async_hooks";

const { Pool } = pg;

let _pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!_pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL must be set");
    }
    _pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.pgPoolMax,
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

// Transaction context — while code runs inside a withTransaction callback
// the active PoolClient is bound here, so rawQuery / rawExecute issue their
// statements on the SAME connection (and therefore the SAME transaction)
// instead of grabbing an independent pool connection. Before this, a
// rawQuery / rawExecute inside a withTransaction block silently ran as its
// own autocommitted statement on a separate connection — the BEGIN/COMMIT
// wrapped an idle connection and the "transaction" had no atomicity.
const txStore = new AsyncLocalStorage<pg.PoolClient>();

function currentExecutor(): pg.Pool | pg.PoolClient {
  return txStore.getStore() ?? pool;
}

export async function rawQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const start = Date.now();
  const result = await currentExecutor()
    .query(sql, params)
    .finally(() => recordQuery(sql, Date.now() - start));
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

  const start = Date.now();
  const result = await currentExecutor()
    .query(finalSQL, cleanParams(params))
    .finally(() => recordQuery(finalSQL, Date.now() - start));
  const insertId = result.rows[0]?.id ?? 0;
  return { insertId, affectedRows: result.rowCount ?? 0 };
}

// Guard for the ON CONFLICT DO NOTHING + read-back pattern: rawExecute
// returns insertId=0 when no row was actually inserted (or the INSERT
// didn't surface an id), and a follow-up SELECT id=0 silently returns
// nothing. Wrap the destructured value to fail loudly at the source
// instead of cascading into a confusing NotFound from the next query.
//
//   const { insertId } = await rawExecute(`INSERT INTO clients ...`);
//   assertInsert(insertId, "clients");        // throws on 0
//   const [row] = await rawQuery(`SELECT * FROM clients WHERE id = $1`, [insertId]);
export function assertInsert(insertId: number, entity: string): number {
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error(`assertInsert: ${entity} INSERT returned no id (likely ON CONFLICT DO NOTHING with no RETURNING)`);
  }
  return insertId;
}

let savepointSeq = 0;

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  // Reentrant: when already inside a transaction, join it via a SAVEPOINT
  // instead of opening a second connection. Nested withTransaction calls
  // (e.g. createJournalEntry invoked inside a route's own transaction) are
  // then part of ONE atomic unit — the whole thing commits or rolls back
  // together — while a caught nested failure still rolls back only its own
  // savepoint, leaving the outer transaction usable.
  const ambient = txStore.getStore();
  if (ambient) {
    const sp = `sp_${++savepointSeq}`;
    await ambient.query(`SAVEPOINT ${sp}`);
    try {
      const result = await fn(ambient);
      await ambient.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      try {
        await ambient.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      } catch (rbErr) {
        logger.error(rbErr, "[withTransaction] ROLLBACK TO SAVEPOINT failed");
      }
      throw err;
    }
  }

  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    // Bind this client as the active executor so any rawQuery / rawExecute
    // run by `fn` (directly or via helpers it calls) joins this transaction.
    const result = await txStore.run(client, () => fn(client));
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
