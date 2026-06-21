// FK-safe teardown helper for dynamic integration tests.
//
// Tests describe their cleanup as an ordered list of DELETEs (leaf tables
// first). `fkSafeTeardown` collects them, then executes them with retry passes
// so a foreign-key violation (a child row deleted out of order) does not abort
// the whole teardown — the failing DELETE is retried after its dependants are
// gone. Non-FK errors propagate immediately so a genuinely broken teardown is
// still visible. This keeps per-test cleanup robust without forcing every test
// to hand-tune a perfect deletion order.
import { rawExecute } from "../../../src/lib/rawdb.js";

type DeleteFn = (sql: string, params?: unknown[]) => Promise<void>;

// Postgres foreign_key_violation — safe to retry once dependants are removed.
function isForeignKeyViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23503";
}

// Postgres undefined_table — a teardown that targets a table which no longer
// exists is a harmless no-op (there is nothing to clean), so it is skipped
// rather than failing the whole suite.
function isUndefinedTable(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "42P01";
}

export async function fkSafeTeardown(
  fn: (del: DeleteFn) => Promise<void>,
): Promise<void> {
  const ops: Array<[string, unknown[]]> = [];
  // The collector resolves immediately; the test's `await del(...)` still works.
  const del: DeleteFn = async (sql, params = []) => {
    ops.push([sql, params]);
  };
  await fn(del);

  // Execute in declared order; retry FK-violation failures in later passes
  // (≤ ops.length passes is always enough to drain a finite dependency chain).
  let pending = ops;
  for (let pass = 0; pass < ops.length && pending.length > 0; pass++) {
    const failed: Array<[string, unknown[]]> = [];
    for (const [sql, params] of pending) {
      try {
        await rawExecute(sql, params);
      } catch (err) {
        if (isUndefinedTable(err)) continue; // nothing to clean — skip
        if (isForeignKeyViolation(err)) failed.push([sql, params]);
        else throw err;
      }
    }
    if (failed.length === pending.length) {
      // No progress this pass — a real, non-resolvable FK error. Surface it.
      await rawExecute(failed[0][0], failed[0][1]);
    }
    pending = failed;
  }
}
