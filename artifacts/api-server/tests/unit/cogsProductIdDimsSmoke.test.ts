import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const COGS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/inventory/cogsPosting.ts"),
  "utf8"
);
const WAREHOUSE_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/warehouseEngine.ts"),
  "utf8"
);
const WAREHOUSE_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"),
  "utf8"
);

// ─── COGS bucket / Warehouse movement — productId carried through ──────
// Pre-fix: per-product COGS / margin / variance reports were dead at the
// GL because the bucket key + value omitted productId. The warehouse
// engine accepted productName as a string but never persisted productId.
// productId was already in scope on both paths — it just wasn't passed.

describe("CogsJournalLine interface", () => {
  it("declares productId on the line shape", () => {
    expect(COGS).toMatch(/productId\?:\s*number;/);
  });
});

describe("planCogsForInvoice — forward COGS bucket carries productId", () => {
  it("bucket dim key includes productId", () => {
    expect(COGS).toContain("|${productId}");
  });

  it("DR bucket value carries productId", () => {
    // Match the DR bucket initialiser ("بيع — تكلفة بضاعة مباعة")
    const drIdx = COGS.indexOf("description: `تكلفة بضاعة مباعة");
    expect(drIdx).toBeGreaterThan(-1);
    const drBlock = COGS.slice(drIdx, drIdx + 600);
    expect(drBlock).toContain("productId,");
  });

  it("CR bucket value carries productId", () => {
    const crIdx = COGS.indexOf("description: `مخزون — فاتورة");
    expect(crIdx).toBeGreaterThan(-1);
    const crBlock = COGS.slice(crIdx, crIdx + 600);
    expect(crBlock).toContain("productId,");
  });
});

describe("planCogsReversal — reversal bucket carries productId", () => {
  it("bucket dim key includes ln.productId", () => {
    expect(COGS).toContain("|${ln.productId}");
  });

  it("DR (restock) bucket value carries ln.productId", () => {
    const drIdx = COGS.indexOf("description: `استرجاع مخزون");
    expect(drIdx).toBeGreaterThan(-1);
    const drBlock = COGS.slice(drIdx, drIdx + 600);
    expect(drBlock).toContain("productId: ln.productId");
  });

  it("CR (reverse-COGS) bucket value carries ln.productId", () => {
    const crIdx = COGS.indexOf("description: `عكس تكلفة بضاعة");
    expect(crIdx).toBeGreaterThan(-1);
    const crBlock = COGS.slice(crIdx, crIdx + 600);
    expect(crBlock).toContain("productId: ln.productId");
  });
});

describe("warehouseEngine.postMovementGL", () => {
  it("accepts productId on movement param", () => {
    expect(WAREHOUSE_ENGINE).toMatch(/productId\?:\s*number;/);
  });

  it("both JE lines carry movement.productId", () => {
    const linesIdx = WAREHOUSE_ENGINE.indexOf("lines: [");
    expect(linesIdx).toBeGreaterThan(-1);
    const block = WAREHOUSE_ENGINE.slice(linesIdx, linesIdx + 800);
    const matches = block.match(/productId: movement\.productId/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("warehouse.ts caller — passes productId to engine", () => {
  it("invokes postMovementGL with productId from params", () => {
    expect(WAREHOUSE_ROUTE).toContain("productId: params.productId");
  });
});
