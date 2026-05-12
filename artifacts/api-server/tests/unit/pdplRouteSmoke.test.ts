import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/pdpl.ts"),
  "utf8",
);

/**
 * Closes the audit-report finding that "4 من 5 endpoints PDPL بدون permission
 * guard" — each non-public endpoint now passes through the standard
 * `authorize({ feature: "admin.pdpl", ... })` gate (in addition to whatever
 * legacy guard it carried before, kept for backwards-compatibility).
 */
describe("pdpl — every endpoint except the public privacy notice is guarded", () => {
  it("public GET /privacy-notice has IP rate limit but no auth (intentional)", () => {
    const idx = SRC.indexOf('"/privacy-notice"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain("privacyNoticeIpLimiter");
    // No auth middleware on this endpoint — it's the privacy notice
    // itself, which a prospective data subject must be able to read.
    expect(section).not.toContain("authMiddleware");
  });

  it("GET /retention-policies requires admin.pdpl:list", () => {
    const idx = SRC.indexOf('"/retention-policies"');
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain("authMiddleware");
    expect(section).toContain('authorize({ feature: "admin.pdpl", action: "list" })');
  });

  it("GET /employee-data-export/:employeeId allows self OR admin.pdpl:export OR hr:read", () => {
    const idx = SRC.indexOf('"/employee-data-export/:employeeId"');
    const section = SRC.slice(idx, idx + 1200);
    expect(section).toContain("authMiddleware");
    expect(section).toContain("scope.employeeId === employeeId");
    // New permission layered in alongside the legacy hr:read.
    expect(section).toContain('userHasPermission(scope, "admin.pdpl:export")');
    expect(section).toContain('userHasPermission(scope, "hr:read")');
  });

  it("POST /data-request requires admin.pdpl:create (was misrouted to admin module)", () => {
    const idx = SRC.indexOf('"/data-request"');
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('authorize({ feature: "admin.pdpl", action: "create" })');
    // Make sure the old too-broad gate is gone.
    expect(section).not.toContain('authorize({ feature: "admin", action: "update" })');
  });

  it("GET /processing-log requires admin.pdpl:view (keeps the legacy minLevel as defence-in-depth)", () => {
    const idx = SRC.indexOf('"/processing-log"');
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('authorize({ feature: "admin.pdpl", action: "view" })');
    expect(section).toContain("requireMinLevel(90)");
  });
});
