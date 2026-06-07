import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stop-ship audit (#1139 §8) flagged two routes as write-without-
 * audit warnings:
 *
 *   - parties.ts:    POST /backfill  (bulk-inserts party_links rows)
 *   - assistant.ts:  POST /ask       (user question → matched intent)
 *
 * Both endpoints now emit createAuditLog() + emitEvent() so the
 * trail is no longer silent:
 *
 *   - parties.backfill ⇒ totals + perTable breakdown in `after`
 *   - assistant.ask    ⇒ user's question + matched intent (or null)
 *                        in `after`. Records EVERY question, matched
 *                        or not, so we get analytics on misses too.
 */

const PARTIES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/parties.ts"),
  "utf8",
);
const ASSISTANT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/assistant.ts"),
  "utf8",
);

describe("parties.ts — POST /backfill emits audit + event", () => {
  it("imports createAuditLog and emitEvent from businessHelpers", () => {
    expect(PARTIES).toMatch(/import \{ createAuditLog, emitEvent \} from "\.\.\/lib\/businessHelpers\.js"/);
  });

  it("calls createAuditLog with action='parties.backfill' and totals in after", () => {
    expect(PARTIES).toMatch(/createAuditLog\(\{[\s\S]{0,400}action: "parties\.backfill"[\s\S]{0,400}after: \{ totals,/);
  });

  it("emits parties.backfill event with companyId-scoped entityId + serialized totals", () => {
    expect(PARTIES).toMatch(/emitEvent\(\{[\s\S]{0,500}action: "parties\.backfill"[\s\S]{0,300}entityId: scope\.companyId/);
    expect(PARTIES).toMatch(/details: JSON\.stringify\(totals\)/);
  });

  it("event emit error is caught (background failure doesn't break the response)", () => {
    expect(PARTIES).toMatch(/\.catch\(\(e\) => logger\.error\(e, "parties backfill event emit failed"\)\)/);
  });
});

describe("assistant.ts — POST /ask emits a usage audit per question", () => {
  it("imports createAuditLog and emitEvent (alongside currentPeriod) from businessHelpers", () => {
    expect(ASSISTANT).toMatch(/import \{ currentPeriod, createAuditLog, emitEvent \} from "\.\.\/lib\/businessHelpers\.js"/);
  });

  it("audits BOTH matched and unmatched questions (analytics on misses)", () => {
    // Drift alarm: the matched flag is derived BEFORE the early-return,
    // and the audit log fires UNCONDITIONALLY. If anyone moves the
    // audit inside the `if (intent)` branch, miss analytics disappear.
    const auditIdx = ASSISTANT.indexOf('action: "assistant.ask"');
    const earlyReturnIdx = ASSISTANT.indexOf("matched: false");
    expect(auditIdx).toBeGreaterThan(0);
    expect(earlyReturnIdx).toBeGreaterThan(auditIdx); // audit fires BEFORE the unmatched-return branch
  });

  it("captures the user's question and matched intent in after", () => {
    expect(ASSISTANT).toMatch(/after: \{ question: q, matched, intent: intent\?\.key \?\? null \}/);
  });

  it("event details serialize the matched-flag + intent (no raw question in details)", () => {
    // Question text stays in the audit (RBAC-gated) — events broadcast
    // is intentionally smaller (matched/intent only) so wider consumers
    // don't see free-text.
    expect(ASSISTANT).toMatch(/details: JSON\.stringify\(\{ matched, intent: intent\?\.key \?\? null \}\)/);
  });

  it("event emit error is caught (background failure doesn't break the response)", () => {
    expect(ASSISTANT).toMatch(/\.catch\(\(e\) => logger\.error\(e, "assistant\.ask event emit failed"\)\)/);
  });
});
