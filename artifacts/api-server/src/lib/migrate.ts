import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "./rawdb.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

/**
 * Phase 2 — Schema baseline detection.
 *
 * The canonical schema lives in `db/schema.sql` at the repo root (a
 * `pg_dump --schema-only` of the live Replit DB). Fresh local instances
 * load that file via `db/bootstrap.sh` BEFORE the API server boots; the
 * bootstrap script then pre-marks every existing migration filename as
 * applied in `schema_migrations`, so this runner is a no-op on first
 * boot of a freshly-bootstrapped local DB.
 *
 * For existing instances (Replit, staging, production) the
 * `schema_migrations` table already has rows from prior boots, so the
 * baseline-load is skipped and the runner only applies any NEW migration
 * files committed after the dump was generated.
 *
 * The detector below decides whether we're on a fresh DB that needs the
 * baseline applied automatically. It is conservative: it only auto-loads
 * the dump if `schema_migrations` is empty AND `companies` table does
 * NOT exist — i.e. we're certain this is a clean DB the bootstrap script
 * was never run against.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectAndApplyBaselineIfNeeded(client: any): Promise<void> {
  // Repo-root db/schema.sql relative to this file:
  //   src/lib/migrate.ts → ../../../../db/schema.sql
  const baselinePath = resolve(__dirname, "../../../../db/schema.sql");
  if (!existsSync(baselinePath)) {
    // No schema dump committed yet (Phase 2 not finished). Fall back to
    // the legacy behaviour where `runMigrations` runs every file.
    return;
  }

  const migsResult = await client.query(
    `SELECT COUNT(*)::text AS count FROM schema_migrations`
  );
  const migs = migsResult.rows as Array<{ count: string }>;
  const migCount = Number(migs[0]?.count ?? 0);
  if (migCount > 0) {
    // Already initialised (existing instance). Skip the baseline load
    // — the runner below will apply any newer migrations on top.
    return;
  }

  // Are we on a truly empty DB? Use `companies` as the canonical
  // sentinel — every Ghayth instance has at least one row in companies.
  const hasTableResult = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'companies'
     ) AS exists`
  );
  const hasTable = hasTableResult.rows as Array<{ exists: boolean }>;
  if (hasTable[0]?.exists) {
    // Tables exist but schema_migrations is empty — this is a legacy
    // pre-Phase-2 instance that never ran the migration runner. Don't
    // touch it; let the runner record migrations as it walks them.
    return;
  }

  logger.info("Empty DB detected — loading db/schema.sql baseline");
  const sql = readFileSync(baselinePath, "utf-8");
  await client.query(sql);
  logger.info("Baseline schema loaded");
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id        SERIAL PRIMARY KEY,
        filename  VARCHAR(200) NOT NULL UNIQUE,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Phase 2: load the dump if this is a fresh DB. Safe no-op otherwise.
    await detectAndApplyBaselineIfNeeded(client);

    const migrationsDir = resolve(__dirname, "./migrations");

    let files: string[] = [];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      logger.info("No migrations directory found, skipping migrations");
      return;
    }

    const { rows: applied } = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations ORDER BY filename`
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let firstError: unknown = null;

    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.debug({ file }, "Migration already applied");
        continue;
      }

      const filePath = resolve(migrationsDir, file);
      const sql = readFileSync(filePath, "utf-8");

      logger.info({ file }, "Applying migration");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [file]
        );
        await client.query("COMMIT");
        logger.info({ file }, "Migration applied");
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error(err as Error, `Migration failed: ${file}`);
        if (isDev) {
          if (!firstError) firstError = err;
          logger.warn(`Skipping failed migration in dev mode, continuing with remaining migrations`);
        } else {
          throw err;
        }
      }
    }

    // After processing all migrations, re-throw the first error in dev mode
    // so index.ts can log the warning — but all subsequent migrations have run
    if (firstError) throw firstError;
  } finally {
    client.release();
  }
}
