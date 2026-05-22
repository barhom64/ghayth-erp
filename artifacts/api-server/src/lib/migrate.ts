import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "./rawdb.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = config.isDevelopment;

/**
 * Other PostgreSQL statements that cannot run inside a transaction block.
 * Same `25001 PreventInTransactionBlock` family as
 * `CREATE INDEX CONCURRENTLY`. Detected so the runner switches to its
 * unwrapped/per-statement path automatically — same fix as #635.
 */
const TXN_INCOMPATIBLE_PATTERNS: RegExp[] = [
  /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i,
  /\bDROP\s+INDEX\s+CONCURRENTLY\b/i,
  /\bREINDEX\s+(TABLE|INDEX|SCHEMA|DATABASE|SYSTEM)\s+CONCURRENTLY\b/i,
  /\bREFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b/i,
  /\bVACUUM\b/i,
  /\bCLUSTER\b(?!\s+ON\b)/i, // bare CLUSTER, not "CLUSTER ON" inside ALTER TABLE
  /\bCREATE\s+DATABASE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+TABLESPACE\b/i,
  /\bDROP\s+TABLESPACE\b/i,
  /\bALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/i, // enum value add — txn-block-ban on PG < 12 + still requires special handling
];

export function containsTxnIncompatibleStatement(sql: string): boolean {
  // Use the same parser-aware splitter that the runner uses, so that
  // pattern matches against literal/identifier/dollar-quoted/comment
  // bodies don't false-positive (e.g. the string `'VACUUM the warehouse'`
  // or a comment that mentions CREATE INDEX CONCURRENTLY would otherwise
  // wrongly mark an ordinary atomic migration as txn-incompatible and
  // strip its surrounding BEGIN/COMMIT).
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    const stripped = stripSqlLiteralsAndComments(stmt);
    if (TXN_INCOMPATIBLE_PATTERNS.some((re) => re.test(stripped))) return true;
  }
  return false;
}

/**
 * Returns a copy of `sql` where the *bodies* of comments, single-quoted
 * strings, double-quoted identifiers, and `$tag$` dollar-quoted strings
 * have been replaced with single spaces. The terminator characters and
 * surrounding tokens are preserved so keyword/whitespace boundaries used
 * by `TXN_INCOMPATIBLE_PATTERNS` still match correctly. This is the
 * literal-aware variant of `stripSqlComments` and is used solely by
 * `containsTxnIncompatibleStatement` to avoid false positives.
 */
export function stripSqlLiteralsAndComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    // line comment
    if (ch === "-" && next === "-") {
      out += "  ";
      i += 2;
      while (i < n && sql[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    // block comment
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    // single-quoted string ('...' with '' escape)
    if (ch === "'") {
      out += "'";
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += "  ";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out += "'";
          i++;
          break;
        }
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // double-quoted identifier
    if (ch === '"') {
      out += '"';
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          out += '"';
          i++;
          break;
        }
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // dollar-quoted string $tag$...$tag$
    if (ch === "$") {
      const tagMatch = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        out += " ".repeat(tag.length);
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx === -1) {
          while (i < n) {
            out += sql[i] === "\n" ? "\n" : " ";
            i++;
          }
        } else {
          while (i < closeIdx) {
            out += sql[i] === "\n" ? "\n" : " ";
            i++;
          }
          out += " ".repeat(tag.length);
          i += tag.length;
        }
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Strip SQL line- and block-comments. Conservative: does NOT try to
 * preserve comments inside string literals. Only used to make the
 * statement-splitter and the txn-incompatible detector resilient to
 * the `-- ...` and `/* ... *​/` cases.
 */
export function stripSqlComments(sql: string): string {
  // Block comments (non-greedy, supports newlines)
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments
  out = out.replace(/--[^\n\r]*/g, "");
  return out;
}

/**
 * Split a SQL string into top-level statements on `;`. Skips `;` inside
 * single-quoted strings, double-quoted identifiers, and `$tag$`
 * dollar-quoted strings. Used by the concurrent-migration code path so
 * each statement gets its own `client.query()` round-trip (PostgreSQL
 * otherwise wraps a multi-statement simple query in an *implicit*
 * transaction block, breaking CREATE INDEX CONCURRENTLY even when the
 * runner never calls BEGIN itself — root cause of issue #635).
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") {
        buf += sql[i];
        i++;
      }
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      buf += "/*";
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) {
        buf += sql[i];
        i++;
      }
      if (i < n) {
        buf += "*/";
        i += 2;
      }
      continue;
    }
    // Single-quoted string (handle '' escape)
    if (ch === "'") {
      buf += "'";
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        buf += sql[i];
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Double-quoted identifier ("companyId")
    if (ch === '"') {
      buf += '"';
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Dollar-quoted string: $tag$ ... $tag$
    if (ch === "$") {
      const tagMatch = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0]; // includes both dollars + optional name
        buf += tag;
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx === -1) {
          // unterminated — flush rest and bail
          buf += sql.slice(i);
          i = n;
        } else {
          buf += sql.slice(i, closeIdx) + tag;
          i = closeIdx + tag.length;
        }
        continue;
      }
    }
    // Statement terminator
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }

  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

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

  // Partial-DB safety gate: schema_migrations is empty AND companies is
  // absent, but `public` may still hold leftover tables from a previous
  // half-run. The pg_dump --clean halves below contain
  // `DROP TABLE ... CASCADE`, so blindly applying them would silently
  // destroy that data. Refuse and force manual investigation.
  const otherTablesResult = await client.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
       ORDER BY table_name`
  );
  const otherTables = (otherTablesResult.rows as Array<{ table_name: string }>).map(
    (r) => r.table_name
  );
  if (otherTables.length > 0) {
    const sample = otherTables.slice(0, 3).join(", ");
    throw new Error(
      `refusing to load baseline: schema_migrations is empty AND companies is absent, ` +
        `but ${otherTables.length} other public tables exist (e.g. ${sample}); ` +
        `this looks like a semi-bootstrapped DB; investigate manually`
    );
  }

  // Resolve the two halves relative to the same repo root used for
  // db/schema.sql above. The wrapper db/schema.sql is intentionally
  // NOT opened here — its body is two `\ir` psql meta-commands that
  // the `pg` driver cannot parse.
  const baselineDir = dirname(baselinePath);
  const prePath = resolve(baselineDir, "schema_pre.sql");
  const postPath = resolve(baselineDir, "schema_post.sql");
  for (const p of [prePath, postPath]) {
    if (!existsSync(p)) {
      throw new Error(`baseline half missing: ${p}`);
    }
  }

  const metaStripRe = /^\\(?:restrict|unrestrict)\s+\S+\s*$/;
  const unknownMetaRe = /^\s*\\/;
  const loadHalf = async (filePath: string): Promise<void> => {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n");
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (metaStripRe.test(line)) continue;
      if (unknownMetaRe.test(line)) {
        throw new Error(
          `refusing baseline: unknown psql meta-command at ${filePath}:${i + 1}: ${line.trim()}`
        );
      }
      kept.push(line);
    }
    const stripped = kept.join("\n");
    await client.query(stripped);
  };

  await loadHalf(prePath);
  await loadHalf(postPath);

  // Pre-mark every committed migration as applied so the runner's
  // delta loop walks zero new files on top of the freshly-loaded
  // baseline. Mirrors db/bootstrap.sh step 8. MUST run only after
  // both halves apply successfully — if schema_post.sql throws, the
  // exception propagates and this block is skipped, so the next boot
  // sees an empty schema_migrations and the partial-DB gate above
  // refuses to retry on the partly-loaded schema.
  const migrationsDir = resolve(__dirname, "./migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
      [file]
    );
  }

  logger.info(
    { migrations: migrationFiles.length },
    `baseline loaded from schema_pre + schema_post; ${migrationFiles.length} migrations pre-marked`
  );
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

      // CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
      // so migrations that use it must run unwrapped. We treat the entire
      // file as txn-less in that case — the index statements are themselves
      // idempotent via IF NOT EXISTS, and the migration is recorded in
      // schema_migrations in a separate INSERT below.
      //
      // CRITICAL: even though we are NOT calling BEGIN/COMMIT ourselves,
      // PostgreSQL treats any multi-statement "simple query" (a single
      // string with N statements separated by `;`) as an *implicit
      // transaction block*. CREATE INDEX CONCURRENTLY then fails with
      // 25001 PreventInTransactionBlock. So we must additionally split
      // the file on top-level `;` and execute each statement in its own
      // separate query round-trip. The same applies to any other
      // statement that's banned inside a transaction (VACUUM, REINDEX
      // CONCURRENTLY, CREATE/DROP DATABASE, ALTER SYSTEM, ...).
      const isConcurrentMigration =
        /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i.test(sql) ||
        containsTxnIncompatibleStatement(sql);

      logger.info({ file, isConcurrentMigration }, "Applying migration");
      try {
        if (isConcurrentMigration) {
          const statements = splitSqlStatements(sql);
          for (const stmt of statements) {
            await client.query(stmt);
          }
          await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1)`,
            [file]
          );
        } else {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1)`,
            [file]
          );
          await client.query("COMMIT");
        }
        logger.info({ file }, "Migration applied");
      } catch (err) {
        if (!isConcurrentMigration) {
          try { await client.query("ROLLBACK"); } catch { /* connection may be wedged */ }
        }
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
