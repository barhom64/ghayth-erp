import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "./rawdb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

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

    const migrationsDir = resolve(__dirname, "../migrations");

    let files: string[] = [];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      console.log("No migrations directory found, skipping migrations.");
      return;
    }

    const { rows: applied } = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations ORDER BY filename`
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let firstError: unknown = null;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`Migration already applied: ${file}`);
        continue;
      }

      const filePath = resolve(migrationsDir, file);
      const sql = readFileSync(filePath, "utf-8");

      console.log(`Applying migration: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [file]
        );
        await client.query("COMMIT");
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Migration failed: ${file}`, err);
        if (isDev) {
          // In dev mode: record the first error but continue remaining migrations
          if (!firstError) firstError = err;
          console.warn(`Skipping failed migration in dev mode, continuing with remaining migrations`);
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
