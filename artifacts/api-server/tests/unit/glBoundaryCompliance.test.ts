import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// GL Boundary Compliance — pinned at the test level so a regression that
// re-introduces a direct journal INSERT, a back-door call to
// createJournalEntry from outside the engine, or a Date.now-style volatile
// sourceKey is caught in CI even if no one runs `pnpm lint:gl-boundary`
// locally.

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..", "..");
const SRC_DIR = join(API_ROOT, "src");

const ALLOWED_PATHS = new Set([
  "src/lib/engines/financialEngine.ts",
  "src/lib/businessHelpers.ts",
  "src/lib/gl/posting.ts",
  "src/lib/gl/index.ts",
  "src/lib/gl/journal-poster.ts",
  "src/lib/recurringJournalProcessor.ts",
  "src/lib/umrahImportEngine.ts",
  "src/lib/umrahInvoicingEngine.ts",
  "src/lib/umrahCommissionEngine.ts",
  "src/lib/eventListeners.ts",
  "src/lib/saudi-compliance/mudad/post-salary-journal.ts",
  "src/lib/inventory/post-lot-writeoff-journal.ts",
  "src/lib/inventory/post-cycle-count-journal.ts",
  "src/lib/fx/post-realized-journal.ts",
  "src/lib/fx/post-revaluation-journal.ts",
]);

const DIRECT_INSERT_RE = /INSERT\s+INTO\s+(?:journal_entries|journal_lines)\b/i;
const DIRECT_HELPER_RE = /\b(createJournalEntry|createGuardedJournalEntry)\s*\(/;
const VOLATILE_DATENOW_RE =
  /sourceKey\s*:\s*[`"'][^`"']*\$\{[^}]*Date\.now\(\)[^}]*\}[^`"']*[`"']/;
const VOLATILE_TIMESTAMP_RE =
  /sourceKey\s*:\s*[`"'][^`"']*\b1\d{12}\b[^`"']*[`"']/;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(full)));
    else if (ent.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(ent.name)) out.push(full);
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  kind: string;
  text: string;
}

function scan(src: string, regex: RegExp): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\/\/.*$/, "");
    if (regex.test(stripped)) out.push({ line: i + 1, text: lines[i].trim() });
  }
  return out;
}

describe("GL boundary compliance", () => {
  it("rejects direct INSERT INTO journal_entries / journal_lines outside the engine", async () => {
    const files = await walk(SRC_DIR);
    const violations: Violation[] = [];
    for (const f of files) {
      const rel = relative(API_ROOT, f);
      if (ALLOWED_PATHS.has(rel)) continue;
      const src = await readFile(f, "utf8");
      for (const hit of scan(src, DIRECT_INSERT_RE)) {
        violations.push({ file: rel, kind: "direct-insert", ...hit });
      }
    }
    if (violations.length) {
      throw new Error(
        "Direct journal inserts found outside financialEngine:\n" +
          violations.map((v) => `  ${v.file}:${v.line} → ${v.text}`).join("\n") +
          "\n\nRoute these through financialEngine.postJournalEntry (or, for line-level\n" +
          "appends, financialEngine.appendRoundingAdjustment)."
      );
    }
    expect(violations).toEqual([]);
  });

  it("rejects createJournalEntry / createGuardedJournalEntry calls outside the engine", async () => {
    const files = await walk(SRC_DIR);
    const violations: Violation[] = [];
    for (const f of files) {
      const rel = relative(API_ROOT, f);
      if (ALLOWED_PATHS.has(rel)) continue;
      const src = await readFile(f, "utf8");
      for (const hit of scan(src, DIRECT_HELPER_RE)) {
        violations.push({ file: rel, kind: "direct-helper-call", ...hit });
      }
    }
    if (violations.length) {
      throw new Error(
        "Direct calls to createJournalEntry/createGuardedJournalEntry outside the engine:\n" +
          violations.map((v) => `  ${v.file}:${v.line} → ${v.text}`).join("\n") +
          "\n\nUse financialEngine.postJournalEntry instead."
      );
    }
    expect(violations).toEqual([]);
  });

  it("rejects volatile sourceKey values (Date.now / 13-digit timestamps)", async () => {
    const files = await walk(SRC_DIR);
    const violations: Violation[] = [];
    for (const f of files) {
      const rel = relative(API_ROOT, f);
      const src = await readFile(f, "utf8");
      for (const hit of scan(src, VOLATILE_DATENOW_RE)) {
        violations.push({ file: rel, kind: "sourcekey-datenow", ...hit });
      }
      for (const hit of scan(src, VOLATILE_TIMESTAMP_RE)) {
        violations.push({ file: rel, kind: "sourcekey-timestamp", ...hit });
      }
    }
    if (violations.length) {
      throw new Error(
        "Volatile sourceKey values break GL idempotency:\n" +
          violations.map((v) => `  ${v.file}:${v.line} → ${v.text}`).join("\n") +
          "\n\nDerive sourceKey from a stable identifier (row id, business ref, or\n" +
          "the Idempotency-Key header — see lib/requestIdempotency.ts)."
      );
    }
    expect(violations).toEqual([]);
  });
});
