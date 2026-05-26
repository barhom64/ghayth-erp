// Postgres helper for e2e specs that need to make assertions against the
// live DB (e.g. "double-click writes exactly one row"). Imported by
// double-click-idempotency.spec.ts (Task #244 / PR #1165) — the original
// PR shipped the spec without this file, which broke the entire e2e run
// at module-resolution time:
//
//   Error: Cannot find module './_helpers/db' imported from
//     /home/runner/work/.../e2e/tests/double-click-idempotency.spec.ts
//
// Even specs that don't import this one fail because Playwright resolves
// every test file before running any test.
//
// Connection is lazy + idempotent: the pool is created on first use, and
// `closeDb()` is safe to call multiple times (subsequent calls are no-ops).

import pg from "pg";

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (_pool === null) {
    _pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return _pool;
}

// Proxy that lazily forwards `.query()` (and any other Pool method the
// specs touch) to the real pool, so `import { pool } from "./_helpers/db"`
// at the top of a spec doesn't open a connection just by being imported.
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
});

// Run a COUNT-style query and return the first column of the first row as
// a number. The specs use `SELECT COUNT(*)::text AS c FROM ...` so the
// value comes back as a string; coerce here to keep the call site clean.
export async function countRows(sql: string, params: unknown[] = []): Promise<number> {
  const res = await getPool().query<Record<string, string | number>>(sql, params);
  if (res.rowCount === 0) return 0;
  const firstCol = Object.values(res.rows[0])[0];
  const n = Number(firstCol);
  if (Number.isNaN(n)) {
    throw new Error(`countRows: first column "${firstCol}" is not numeric`);
  }
  return n;
}

export async function closeDb(): Promise<void> {
  if (_pool !== null) {
    const p = _pool;
    _pool = null;
    await p.end();
  }
}
