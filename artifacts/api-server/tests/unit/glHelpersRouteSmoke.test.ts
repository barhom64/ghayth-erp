import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(
    import.meta.dirname!,
    "../../../../artifacts/api-server/src/routes/finance-gl-helpers.ts",
  ),
  "utf8",
);
const INDEX = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/index.ts"),
  "utf8",
);

describe("finance-gl-helpers — operator-facing GL posting endpoints", () => {
  const ENDPOINTS = [
    "/gl-helpers/fx-revaluation/:revaluationLogId",
    "/gl-helpers/realized-fx/:invoiceId",
    "/gl-helpers/cycle-count/:cycleCountId",
    "/gl-helpers/lot-writeoff/:lotId",
    "/gl-helpers/mudad-salary/:settlementId",
  ];

  it.each(ENDPOINTS)("registers POST %s", (path) => {
    expect(SRC).toContain(`glHelpersRouter.post(\n  "${path}"`);
  });

  it.each(ENDPOINTS)("guards %s with authorize() finance.journal", (path) => {
    const idx = SRC.indexOf(`"${path}"`);
    const section = SRC.slice(idx, idx + 400);
    expect(section).toMatch(/authorize\(\s*\{\s*feature:\s*"finance\.journal"/);
  });

  it("router is mounted on /finance with module + financial guards", () => {
    expect(INDEX).toContain(
      'router.use("/finance", requireModule("finance"), requireGuards("financial"), glHelpersRouter);',
    );
  });

  it("imports each of the 5 GL helpers", () => {
    expect(SRC).toContain("postFxRevaluationJournal");
    expect(SRC).toContain("postRealizedFxJournal");
    expect(SRC).toContain("postCycleCountVarianceJournal");
    expect(SRC).toContain("postLotWriteoffJournal");
    expect(SRC).toContain("postMudadSalaryJournal");
  });

  it("reads companyId from req.scope (cross-tenant safe)", () => {
    expect(SRC).toContain("companyId: scope.companyId");
  });

  it("forwards postedBy from scope.userId for audit-trail attribution", () => {
    expect(SRC).toContain("postedBy: scope.userId");
  });

  it("realized-fx accepts settlementRate + paymentDate (helper requires both)", () => {
    expect(SRC).toContain("settlementRate: z.number().positive().finite()");
    expect(SRC).toMatch(/paymentDate:\s*z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  });

  it("supports asDraft body flag on every endpoint (operator review path)", () => {
    // baseBody schema = { asDraft?: boolean, description?: string }
    expect(SRC).toContain("asDraft: z.boolean().optional()");
    expect(SRC).toContain("description: z.string().max(500).optional()");
    // Every endpoint forwards body.asDraft into the helper.
    const asDraftMatches = SRC.match(/asDraft:\s*body\.asDraft/g) ?? [];
    expect(asDraftMatches.length).toBeGreaterThanOrEqual(5);
  });

  it("records audit log + emits event after each posting (observability)", () => {
    expect(SRC).toContain("createAuditLog(");
    expect(SRC).toContain("emitEvent(");
    // The 5 distinct action names.
    expect(SRC).toContain("fx.revaluation.posted");
    expect(SRC).toContain("fx.realized.posted");
    expect(SRC).toContain("inventory.cycle_count.posted");
    expect(SRC).toContain("inventory.lot_writeoff.posted");
    expect(SRC).toContain("mudad.salary.posted");
  });

  it("never trusts companyId from the body (must come from scope)", () => {
    // Anti-pattern guard — operators shouldn't be able to post to a
    // company they don't have a session for.
    expect(SRC).not.toMatch(/companyId:\s*req\.body/);
    expect(SRC).not.toMatch(/companyId:\s*body\.companyId/);
  });

  it("wraps async work in handleRouteError for uniform error responses", () => {
    const matches = SRC.match(/handleRouteError\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  // ── pending-queue listing endpoints (added for the dashboard) ──
  it("registers GET /gl-helpers/mudad-salary/pending", () => {
    expect(SRC).toContain('glHelpersRouter.get(\n  "/gl-helpers/mudad-salary/pending"');
  });

  it("registers GET /gl-helpers/lot-writeoff/pending", () => {
    expect(SRC).toContain('glHelpersRouter.get(\n  "/gl-helpers/lot-writeoff/pending"');
  });

  it("registers GET /gl-helpers/fx-revaluation/pending", () => {
    expect(SRC).toContain('glHelpersRouter.get(\n  "/gl-helpers/fx-revaluation/pending"');
  });

  it("registers GET /gl-helpers/cycle-count/pending", () => {
    expect(SRC).toContain('glHelpersRouter.get(\n  "/gl-helpers/cycle-count/pending"');
  });

  it("listing endpoints filter by companyId from scope (cross-tenant safe)", () => {
    // Both listing queries pull `"companyId" = $1` with scope.companyId
    // as the bound param; never reads from query/body.
    const mudadIdx = SRC.indexOf("/gl-helpers/mudad-salary/pending");
    const mudadSection = SRC.slice(mudadIdx, mudadIdx + 1400);
    expect(mudadSection).toContain('"companyId" = $1');
    expect(mudadSection).toContain("scope.companyId");

    const lotIdx = SRC.indexOf("/gl-helpers/lot-writeoff/pending");
    const lotSection = SRC.slice(lotIdx, lotIdx + 1400);
    expect(lotSection).toContain('"companyId" = $1');
    expect(lotSection).toContain("scope.companyId");
  });

  it("listing endpoints exclude already-posted rows", () => {
    // mudad: only `journalEntryId IS NULL`
    expect(SRC).toMatch(/AND\s+"journalEntryId"\s+IS\s+NULL/);
    // lot:   only `writeoffJournalEntryId IS NULL`
    expect(SRC).toMatch(/AND\s+"writeoffJournalEntryId"\s+IS\s+NULL/);
  });

  it("mudad listing requires status='acknowledged' (helper refuses otherwise)", () => {
    const idx = SRC.indexOf("/gl-helpers/mudad-salary/pending");
    const section = SRC.slice(idx, idx + 800);
    expect(section).toContain("status = 'acknowledged'");
    expect(section).toContain("type = 'salary'");
  });

  it("lot listing restricts to writeoff-triggering statuses", () => {
    const idx = SRC.indexOf("/gl-helpers/lot-writeoff/pending");
    const section = SRC.slice(idx, idx + 1400);
    expect(section).toContain("status IN ('recalled', 'expired', 'disposed')");
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("fx-revaluation listing returns only unposted rows", () => {
    const idx = SRC.indexOf("/gl-helpers/fx-revaluation/pending");
    const section = SRC.slice(idx, idx + 1400);
    expect(section).toContain('"journalEntryId" IS NULL');
    expect(section).toContain("FROM fx_revaluation_log");
  });

  it("cycle-count listing returns only approved runs with no posted lines (anti-double-post)", () => {
    const idx = SRC.indexOf("/gl-helpers/cycle-count/pending");
    const section = SRC.slice(idx, idx + 1400);
    expect(section).toContain("cc.status = 'approved'");
    // The NOT EXISTS subquery is what guarantees we never list a
    // run that's already been (even partially) posted.
    expect(section).toMatch(/NOT EXISTS[\s\S]*adjustmentJournalEntryId/);
  });

  it("registers GET /gl-helpers/realized-fx/history (audit-table view)", () => {
    expect(SRC).toContain('glHelpersRouter.get(\n  "/gl-helpers/realized-fx/history"');
  });

  it("realized-fx history reads from fx_realized_postings filtered by companyId", () => {
    const idx = SRC.indexOf("/gl-helpers/realized-fx/history");
    const section = SRC.slice(idx, idx + 1400);
    expect(section).toContain("FROM fx_realized_postings");
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
    // Newest events first.
    expect(section).toMatch(/ORDER BY\s+"postedAt"\s+DESC/);
  });
});
