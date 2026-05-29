import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/umrahEngine.ts"),
  "utf8"
);
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8"
);

// ─── umrahEngine.postPenaltyGL + postPenaltyWaiverGL ─────────────────────
// Pre-fix: penalty lines had ZERO dim fields. Per-agent + per-season
// penalty income reports were dead at the GL even though the route had
// p.agentId + p.seasonId in scope. Now the engine accepts both, the
// callers pass them, and the lines carry umrahAgentId + umrahSeasonId.

describe("postPenaltyGL", () => {
  const fnStart = ENGINE.indexOf("async postPenaltyGL");
  const fnBlock = fnStart >= 0
    ? ENGINE.slice(fnStart, fnStart + 2500)
    : "";

  it("accepts agentId + seasonId on the penalty param", () => {
    expect(fnBlock).toMatch(/agentId\?:\s*number;/);
    expect(fnBlock).toMatch(/seasonId\?:\s*number;/);
  });

  it("AR receivable line carries umrahAgentId + umrahSeasonId", () => {
    const arIdx = fnBlock.indexOf("accountCode: receivableCode,");
    expect(arIdx).toBeGreaterThan(-1);
    const arBlock = fnBlock.slice(arIdx, arIdx + 400);
    expect(arBlock).toContain("umrahAgentId: penalty.agentId");
    expect(arBlock).toContain("umrahSeasonId: penalty.seasonId");
  });

  it("revenue credit line carries umrahAgentId + umrahSeasonId", () => {
    const revIdx = fnBlock.indexOf("accountCode: revenueCode,");
    expect(revIdx).toBeGreaterThan(-1);
    const revBlock = fnBlock.slice(revIdx, revIdx + 400);
    expect(revBlock).toContain("umrahAgentId: penalty.agentId");
    expect(revBlock).toContain("umrahSeasonId: penalty.seasonId");
  });
});

describe("postPenaltyWaiverGL", () => {
  const fnStart = ENGINE.indexOf("async postPenaltyWaiverGL");
  const fnBlock = fnStart >= 0
    ? ENGINE.slice(fnStart, fnStart + 2500)
    : "";

  it("accepts agentId + seasonId on the penalty param", () => {
    expect(fnBlock).toMatch(/agentId\?:\s*number;/);
    expect(fnBlock).toMatch(/seasonId\?:\s*number;/);
  });

  it("both reversal lines carry umrahAgentId + umrahSeasonId", () => {
    const linesIdx = fnBlock.indexOf("lines: [");
    expect(linesIdx).toBeGreaterThan(-1);
    const block = fnBlock.slice(linesIdx, linesIdx + 1000);
    const agentMatches = block.match(/umrahAgentId: penalty\.agentId/g) ?? [];
    const seasonMatches = block.match(/umrahSeasonId: penalty\.seasonId/g) ?? [];
    expect(agentMatches.length).toBeGreaterThanOrEqual(2);
    expect(seasonMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("umrah.ts callers pass agentId + seasonId", () => {
  it("overstay penalty caller passes agentId + seasonId", () => {
    // Match the overstay block specifically by its type literal.
    expect(ROUTE).toMatch(/type: "overstay"[\s\S]{0,400}agentId:[\s\S]{0,200}seasonId:/);
  });

  it("manual penalty caller passes agentId + seasonId from req body", () => {
    // The manual penalty path computes `b.agentId` from the request body.
    expect(ROUTE).toContain("agentId: b.agentId ? Number(b.agentId) : undefined");
    expect(ROUTE).toContain("seasonId: b.seasonId ? Number(b.seasonId) : undefined");
  });

  it("waiver callers pass agentId + seasonId from penalty row", () => {
    expect(ROUTE).toContain("agentId: penalty.agentId ? Number(penalty.agentId) : undefined");
    expect(ROUTE).toContain("seasonId: penalty.seasonId ? Number(penalty.seasonId) : undefined");
  });
});
