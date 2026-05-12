import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// UMRAH route-layer smoke — locks the new operational endpoints from
// PRs #305 / #312 / #318 against the CONTRIBUTING.md merge gate:
//   §3.1  every endpoint scopes by companyId
//   §3.2  financial operations route through createGuardedJournalEntry,
//         audit, and idempotency
//   §3.3  every route has `authorize({ feature: "umrah", action: ... })`
//   §3.5  zod schemas + transactional integrity
//
// Static-source-scan style, matching `finalRoutesSmoke.test.ts` and
// `umrahEnginesSmoke.test.ts`. Runtime behaviour rides on the dynamic
// tenant-isolation harness which spins a real Postgres in CI.
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const UMRAH_ENTITIES = read("umrah-entities.ts");
const UMRAH = read("umrah.ts");

// ──────────────────────────────────────────────────────────────────────────
// Group split / merge (PR #312)
// ──────────────────────────────────────────────────────────────────────────

describe("umrah-entities — group split (#312)", () => {
  it("mounts POST /groups/:id/split", () => {
    expect(UMRAH_ENTITIES).toMatch(/router\.post\(["']\/groups\/:id\/split["']/);
  });

  it("requires authorize({ feature: 'umrah', action: 'update' })", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/:id/split"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 300);
    expect(section).toMatch(/authorize\(\{\s*feature:\s*["']umrah["']\s*,\s*action:\s*["']update["']/);
  });

  it("validates body via zod (splitGroupSchema)", () => {
    expect(UMRAH_ENTITIES).toContain("splitGroupSchema");
    expect(UMRAH_ENTITIES).toMatch(/pilgrimIds:\s*z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)/);
  });

  it("rejects invoiced source group with ConflictError (no silent merge)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/:id/split"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 2500);
    expect(section).toContain("salesInvoiceId");
    expect(section).toContain("ConflictError");
  });

  it("scopes source lookup + child pilgrim verification by companyId", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/:id/split"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 2500);
    // Source select
    expect(section).toMatch(/FROM\s+umrah_groups[\s\S]*?"companyId"\s*=/);
    // Pilgrim verification join
    expect(section).toMatch(/FROM\s+umrah_pilgrims[\s\S]*?"companyId"\s*=/);
  });

  it("transactional + audit + event emission", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/:id/split"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 5000);
    expect(section).toContain("withTransaction");
    expect(section).toContain("createAuditLog");
    // emitEvent target string at file scope so we don't fight slice
    // boundaries — every group split path emits this event.
    expect(UMRAH_ENTITIES).toContain('action: "umrah.group.split"');
  });
});

describe("umrah-entities — group merge (#312)", () => {
  it("mounts POST /groups/merge", () => {
    expect(UMRAH_ENTITIES).toMatch(/router\.post\(["']\/groups\/merge["']/);
  });

  it("requires authorize({ feature: 'umrah', action: 'update' })", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/merge"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 300);
    expect(section).toMatch(/authorize\(\{\s*feature:\s*["']umrah["']\s*,\s*action:\s*["']update["']/);
  });

  it("validates body via zod (mergeGroupsSchema)", () => {
    expect(UMRAH_ENTITIES).toContain("mergeGroupsSchema");
    expect(UMRAH_ENTITIES).toMatch(/sourceGroupIds:\s*z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)/);
  });

  it("rejects self-merge (target cannot be a source)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/merge"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 1500);
    expect(section).toMatch(/sourceGroupIds\.includes\(.*targetGroupId/);
  });

  it("rejects merging when any source is invoiced (409 ConflictError)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/merge"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 3000);
    expect(section).toContain("salesInvoiceId");
    expect(section).toContain("ConflictError");
  });

  it("soft-deletes source groups (no hard delete)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/merge"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 3500);
    expect(section).toMatch(/UPDATE\s+umrah_groups[\s\S]*?"deletedAt"\s*=\s*NOW\(\)/);
  });

  it("transactional + audit + event emission", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/groups/merge"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 6000);
    expect(section).toContain("withTransaction");
    expect(section).toContain("createAuditLog");
    expect(UMRAH_ENTITIES).toContain('action: "umrah.group.merged"');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Bulk waive penalties (PR #312)
// ──────────────────────────────────────────────────────────────────────────

describe("umrah.ts — bulk waive penalties (#312)", () => {
  it("mounts POST /penalties/waive-bulk", () => {
    expect(UMRAH).toMatch(/router\.post\(["']\/penalties\/waive-bulk["']/);
  });

  it("requires authorize({ feature: 'umrah', action: 'update' })", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 300);
    expect(section).toMatch(/authorize\(\{\s*feature:\s*["']umrah["']\s*,\s*action:\s*["']update["']/);
  });

  it("validates body via bulkWaivePenaltiesSchema", () => {
    expect(UMRAH).toContain("bulkWaivePenaltiesSchema");
    expect(UMRAH).toMatch(/penaltyIds:\s*z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)/);
    expect(UMRAH).toMatch(/reason:\s*z\.string\(\)\.min\(1/);
  });

  it("uses applyTransition (no direct UPDATE for waived status)", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    expect(section).toContain("applyTransition");
    expect(section).toContain('toState: "waived"');
  });

  it("posts a reversal journal via the central umrahEngine.postPenaltyWaiverGL", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    expect(section).toContain("postPenaltyWaiverGL");
  });

  it("scopes penalty lookup by companyId", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    expect(section).toMatch(/FROM\s+umrah_penalties[\s\S]*?"companyId"\s*=/);
  });

  it("per-row try/catch so a single bad penalty doesn't break the batch", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    // The loop wraps each penalty in its own try { ... } catch (rowErr)
    expect(section).toMatch(/for\s*\(\s*const\s+id\s+of\s+body\.penaltyIds/);
    expect(section).toMatch(/catch\s*\(\s*rowErr/);
  });

  it("returns structured batch summary (successIds, skipped, errors)", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    expect(section).toContain("successCount");
    expect(section).toContain("successIds");
    expect(section).toContain("skipped");
    expect(section).toContain("errors");
  });

  it("emits umrah.penalty.waived_bulk event with summary details", () => {
    expect(UMRAH).toContain('action: "umrah.penalty.waived_bulk"');
  });

  it("skips rows already in 'waived' or 'paid' state (no double-reversal)", () => {
    const idx = UMRAH.indexOf('"/penalties/waive-bulk"');
    const section = UMRAH.slice(idx, idx + 3500);
    expect(section).toContain("already_waived");
    expect(section).toContain("already_paid");
  });
});
