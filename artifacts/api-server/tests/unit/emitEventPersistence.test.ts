import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(
    import.meta.dirname!,
    "../../../../artifacts/api-server/src/lib/businessHelpers.ts",
  ),
  "utf8",
);
const ENV_EXAMPLE = readFileSync(
  join(import.meta.dirname!, "../../../../.env.example"),
  "utf8",
);

/**
 * Closes the audit finding that "event_logs is empty" — non-critical
 * events were previously emitted in-memory only and never persisted,
 * so the audit log was missing 90%+ of activity. Adds an opt-in env
 * flag (`PERSIST_ALL_EVENTS`) so operators who need a full audit
 * trail can flip it on without forcing the bloat on every deployment.
 */
describe("emitEvent — opt-in full persistence via PERSIST_ALL_EVENTS", () => {
  it("reads PERSIST_ALL_EVENTS via the central config", () => {
    expect(SRC).toContain("config.persistAllEvents");
  });

  it("falls through to INSERT when isCritical OR persistAll is true", () => {
    // Anchor the test on the disjunction so swapping it to `isCritical && persistAll`
    // (which would NEVER persist non-critical events) trips the assertion.
    expect(SRC).toMatch(/if\s*\(\s*isCritical\s*\|\|\s*persistAll\s*\)/);
  });

  it("still INSERTs into event_logs (the column list hasn't drifted)", () => {
    // The critical-path INSERT is the audit-trail backbone; if the
    // column list ever drops 'entityId' or 'details' the join in the
    // BI dashboards silently nulls out.
    expect(SRC).toContain(
      'INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details)',
    );
  });

  it("documents the new flag in .env.example with the OFF default", () => {
    expect(ENV_EXAMPLE).toContain("PERSIST_ALL_EVENTS=false");
    expect(ENV_EXAMPLE).toMatch(/full audit trail/i);
  });

  it("default behaviour (no env flag set) is still critical-only — no behaviour change", () => {
    // persistAll is sourced from config.persistAllEvents, which lib/config.ts
    // parses with boolEnv(false): an absent flag (or any value other than a
    // recognised truthy literal) yields false, so the critical-only default
    // is preserved and businessHelpers no longer probes process.env directly.
    expect(SRC).toContain("config.persistAllEvents");
    expect(SRC).not.toMatch(/process\.env\.PERSIST_ALL_EVENTS/);
  });
});
