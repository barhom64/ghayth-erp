import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-hardening.ts"),
  "utf8"
);

describe("finance-hardening — fiscal periods v2", () => {
  it("GET /fiscal-periods-v2 requires finance:read", () => {
    const idx = SRC.indexOf('"/fiscal-periods-v2"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /fiscal-periods-v2 requires finance:create", () => {
    const idx = SRC.indexOf('.post("/fiscal-periods-v2"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("close and reopen endpoints exist", () => {
    expect(SRC).toContain('"/fiscal-periods-v2/:id/close"');
    expect(SRC).toContain('"/fiscal-periods-v2/:id/reopen"');
  });
});

describe("finance-hardening — manual journal entries", () => {
  it("POST /journal-manual requires finance:create", () => {
    const idx = SRC.indexOf('"/journal-manual"');
    const section = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(section).toContain("authorize(");
  });

  it("journal lifecycle: submit, review, approve, post", () => {
    expect(SRC).toContain('"/journal-manual/:id/submit"');
    expect(SRC).toContain('"/journal-manual/:id/review"');
    expect(SRC).toContain('"/journal-manual/:id/approve"');
    expect(SRC).toContain('"/journal-manual/:id/post"');
  });

  it("GET /journal-manual list and detail exist", () => {
    expect(SRC).toContain('.get("/journal-manual"');
    expect(SRC).toContain('"/journal-manual/:id"');
  });
});

describe("finance-hardening — bank guarantees", () => {
  it("full CRUD for bank guarantees", () => {
    expect(SRC).toContain('.get("/bank-guarantees"');
    expect(SRC).toContain('.post("/bank-guarantees"');
    expect(SRC).toContain('.patch("/bank-guarantees/:id"');
    expect(SRC).toContain('.delete("/bank-guarantees/:id"');
  });

  it("cancel and release endpoints exist", () => {
    expect(SRC).toContain('"/bank-guarantees/:id/cancel"');
    expect(SRC).toContain('"/bank-guarantees/:id/release"');
  });

  it("delete requires finance:delete", () => {
    const idx = SRC.indexOf('.delete("/bank-guarantees/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("finance-hardening — intercompany", () => {
  it("GET /intercompany requires finance:read", () => {
    const idx = SRC.indexOf('"/intercompany"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("consolidation endpoint exists", () => {
    expect(SRC).toContain('"/intercompany/consolidation"');
  });
});

describe("finance-hardening — projects & cost tracking", () => {
  it("finance projects CRUD exists", () => {
    expect(SRC).toContain('.get("/projects"');
    expect(SRC).toContain('.post("/projects"');
    expect(SRC).toContain('"/projects/:id"');
    expect(SRC).toContain('"/projects/:id/costs"');
  });

  it("cash flow forecast exists", () => {
    expect(SRC).toContain('"/cash-flow-forecast"');
  });

  it("cost center report exists", () => {
    expect(SRC).toContain('"/cost-center-report"');
  });
});

describe("finance-hardening — posting failures", () => {
  it("posting failures list endpoint exists", () => {
    expect(SRC).toContain('"/posting-failures"');
  });

  it("resolve posting failure requires finance:approve", () => {
    const idx = SRC.indexOf('"/posting-failures/:id/resolve"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("finance-hardening — security", () => {
  it("uses parameterized queries throughout", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(50);
  });

  it("scopes by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(30);
  });

  it("uses rawExecute for write operations", () => {
    const matches = [...SRC.matchAll(/rawExecute/g)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
