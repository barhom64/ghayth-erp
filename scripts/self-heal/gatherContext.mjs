// Builds the context payload sent to Claude for a schema-drift finding.

import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const SCHEMA_FILE = path.join(REPO_ROOT, "lib/db/src/schema/index.ts");

async function readSafe(rel) {
  try { return await fs.readFile(path.join(REPO_ROOT, rel), "utf8"); }
  catch { return null; }
}

async function tableColumns(table) {
  if (!process.env.DATABASE_URL) return null;
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    const r = await c.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`,
      [table],
    );
    return r.rows;
  } catch { return null; }
  finally { try { await c.end(); } catch {} }
}

async function listMigrations() {
  const dir = path.join(REPO_ROOT, "artifacts/api-server/src/migrations");
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".sql")).sort().slice(-5);
  } catch { return []; }
}

export async function gather(finding) {
  const routeFile = await readSafe(finding.file);
  const schemaFile = await readSafe("lib/db/src/schema/index.ts");
  const liveColumns = finding.table ? await tableColumns(finding.table) : null;
  const recentMigrations = await listMigrations();
  return {
    finding,
    files: {
      route: { path: finding.file, content: routeFile?.slice(0, 30_000) || "(unreadable)" },
      drizzleSchema: schemaFile
        ? { path: "lib/db/src/schema/index.ts", content: maybeTrimSchema(schemaFile, finding.table) }
        : null,
    },
    liveDb: finding.table
      ? { table: finding.table, columns: liveColumns || "(unable to read)" }
      : null,
    migrationsDir: "artifacts/api-server/src/migrations/",
    recentMigrations,
  };
}

function maybeTrimSchema(content, table) {
  if (!table || content.length < 30_000) return content.slice(0, 30_000);
  // Try to grab only the section relevant to this table to keep tokens down.
  const idx = content.indexOf(`pgTable("${table}"`) >= 0
    ? content.indexOf(`pgTable("${table}"`)
    : content.indexOf(table);
  if (idx === -1) return content.slice(0, 30_000);
  const start = Math.max(0, idx - 2000);
  const end = Math.min(content.length, idx + 8000);
  return `// ...trimmed...\n${content.slice(start, end)}\n// ...trimmed...`;
}
