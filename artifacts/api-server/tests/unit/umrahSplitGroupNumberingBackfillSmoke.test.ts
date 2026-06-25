import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mint-based numbering backfill for historical umrah split-off groups.
 *
 * Split groups created before #2956 carry internalRef = NULL. The register-based
 * numberingBackfill (backfillScheme) only inventories rows that ALREADY have a
 * ref (`refCol IS NOT NULL`) — it skips NULL-ref rows by design — so these need
 * a number MINTED through the centre. This pins the umrah-owned backfill's
 * contract so the boundary and idempotency guarantees can't silently regress.
 *
 * (Real behaviour is proven against Postgres in
 *  tests/integration/umrahSplitGroupNumberingBackfill.dynamic.test.ts.)
 */

const LIB = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahGroupNumberingBackfill.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-groups.ts"),
  "utf8",
);

describe("umrah split-group numbering backfill — lib contract", () => {
  it("mints through the numbering centre (issueNumber), never writes counters/assignments directly", () => {
    expect(LIB).toMatch(/import \{ issueNumber \} from "\.\/numberingService\.js"/);
    expect(LIB).toMatch(/await issueNumber\(\{/);
    // Boundary: the backfill must NOT hand-write the numbering tables.
    expect(LIB).not.toMatch(/INSERT INTO numbering_assignments/);
    expect(LIB).not.toMatch(/INSERT INTO numbering_counters/);
    expect(LIB).not.toMatch(/UPDATE numbering_counters/);
  });

  it("issues with the umrah_group scheme, the source season, and links the entity atomically", () => {
    expect(LIB).toMatch(/entityKey:\s*ENTITY_KEY/);
    expect(LIB).toMatch(/ENTITY_KEY = "umrah_group"/);
    expect(LIB).toMatch(/entityTable:\s*ENTITY_TABLE/);
    expect(LIB).toMatch(/seasonId:\s*g\.seasonId/);
    // entityId passed so issueNumber links numbering_assignments.entityId itself.
    expect(LIB).toMatch(/entityId:\s*g\.id/);
  });

  it("targets ONLY historical split groups with a NULL internalRef", () => {
    // Precise status match (regex, '_' is literal) — not a loose LIKE.
    expect(LIB).toMatch(/\^split_from_\[0-9\]\+\$/);
    expect(LIB).toMatch(/"internalRef" IS NULL/);
    expect(LIB).toMatch(/"deletedAt" IS NULL/);
  });

  it("is idempotent and season-safe: eligible needs a season, the UPDATE is guarded", () => {
    // Eligible scan requires a season (season-scoped scheme).
    expect(LIB).toMatch(/"seasonId" IS NOT NULL/);
    // Season-blocked rows are counted, not silently dropped.
    expect(LIB).toMatch(/skippedNoSeason/);
    // The write is guarded with internalRef IS NULL so re-runs / races don't double-write.
    expect(LIB).toMatch(/SET "internalRef" = \$1[\s\S]*?WHERE id = \$2[\s\S]*?"internalRef" IS NULL/);
  });

  it("preview is read-only (no INSERT/UPDATE/DELETE in the preview fn)", () => {
    const start = LIB.indexOf("export async function previewSplitGroupNumberingBackfill");
    const end = LIB.indexOf("export interface SplitBackfillResult");
    expect(start).toBeGreaterThan(-1);
    const previewBody = LIB.slice(start, end);
    expect(previewBody).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(previewBody).toMatch(/COUNT\(\*\)/);
  });
});

describe("umrah split-group numbering backfill — route wiring", () => {
  it("exposes a read-only preview endpoint behind umrah view", () => {
    expect(ROUTES).toMatch(/router\.get\(\s*[\s\S]*?"\/groups\/numbering-backfill\/preview"/);
    expect(ROUTES).toMatch(/previewSplitGroupNumberingBackfill\(\{ companyId: scope\.companyId \}\)/);
  });

  it("exposes an execute endpoint behind umrah update, delegating to the lib", () => {
    expect(ROUTES).toMatch(/router\.post\(\s*[\s\S]*?"\/groups\/numbering-backfill"/);
    expect(ROUTES).toMatch(/backfillSplitGroupNumbering\(\{/);
    expect(ROUTES).toMatch(/feature: "umrah", action: "update"/);
  });
});
