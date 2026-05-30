import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the pilgrim-detail page's enrichment:
 *
 *   - GET /umrah/pilgrims/:id JOINs umrah_groups + umrah_sub_agents
 *     so the response carries `groupName` + `subAgentName` next to the
 *     already-present agentName / packageName / seasonTitle.
 *
 *   - Every JOIN matches BOTH id AND companyId (defence-in-depth)
 *     so a mistyped FK can't lift another tenant's name into the
 *     response — the same hardening pattern PR #1390 added to the
 *     groups list.
 *
 *   - The frontend Personal-Data card now shows nuskNumber FIRST
 *     (operator-primary identifier), plus visaExpiry, mofaNumber,
 *     borderNumber.
 *
 *   - The frontend Trip-Data card shows groupName + subAgentName so
 *     the operator sees the full 3-tier organisational chain
 *     (pilgrim → sub-agent → primary agent → company group).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("/umrah/pilgrims/:id — backend enrichment", () => {
  it("JOINs umrah_groups and surfaces groupName", () => {
    expect(ROUTE).toMatch(/g\.name\s+as\s+"groupName"/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_groups\s+g\s+ON p\."groupId"=g\.id/);
  });

  it("JOINs umrah_sub_agents and surfaces subAgentName", () => {
    expect(ROUTE).toMatch(/sa\.name\s+as\s+"subAgentName"/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_sub_agents\s+sa\s+ON p\."subAgentId"=sa\.id/);
  });

  it("every JOIN in the /pilgrims/:id query matches companyId (defence-in-depth)", () => {
    // Scope to JUST the GET /pilgrims/:id handler so unrelated JOINs
    // elsewhere in the file don't pollute the assertion. The handler
    // runs from `router.get("/pilgrims/:id"` to the next `router.`
    // declaration.
    const m = ROUTE.match(/router\.get\("\/pilgrims\/:id"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    const joins = handler.match(/LEFT JOIN umrah_\w+\s+\w+\s+ON[^\n]+/g) ?? [];
    expect(joins.length).toBe(5);
    for (const j of joins) {
      expect(j).toMatch(/"companyId"/);
    }
  });

  it("every JOIN in /pilgrims/:id filters out soft-deleted rows", () => {
    const m = ROUTE.match(/router\.get\("\/pilgrims\/:id"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    const joins = handler.match(/LEFT JOIN umrah_\w+\s+\w+\s+ON[^\n]+/g) ?? [];
    expect(joins.length).toBe(5);
    for (const j of joins) {
      expect(j).toMatch(/"deletedAt" IS NULL/);
    }
  });
});

describe("pilgrim-detail page — Personal-Data card", () => {
  it("nuskNumber is shown FIRST so it's the eye's landing point", () => {
    // Capture the personalFields literal and ensure NUSK is the first
    // ACTUAL entry (ahead of fullName). Strip comments and blank lines
    // so the assertion isn't fooled by the explanatory block above the
    // entry.
    const block = PAGE.match(/personalFields\s*=\s*\[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const entries = block![1]!
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{ label:"));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatch(/nuskNumber/);
    // Sanity: fullName comes AFTER nusk, proving the re-ordering.
    const nuskIdx = entries.findIndex((e) => /nuskNumber/.test(e));
    const fullNameIdx = entries.findIndex((e) => /fullName/.test(e));
    expect(nuskIdx).toBeLessThan(fullNameIdx);
  });

  it("surfaces visaExpiry / mofaNumber / borderNumber", () => {
    expect(PAGE).toContain("صلاحية التأشيرة");
    expect(PAGE).toContain("data.visaExpiry");
    expect(PAGE).toContain("رقم الموفا");
    expect(PAGE).toContain("data?.mofaNumber");
    expect(PAGE).toContain("رقم الحدود");
    expect(PAGE).toContain("data?.borderNumber");
  });
});

describe("pilgrim-detail page — Trip-Data card", () => {
  it("surfaces groupName + subAgentName so the 3-tier chain is visible", () => {
    expect(PAGE).toContain("المجموعة");
    expect(PAGE).toContain("data?.groupName");
    expect(PAGE).toContain("الوكيل الفرعي");
    expect(PAGE).toContain("data?.subAgentName");
  });

  it("renames 'الوكيل' to 'الوكيل الرئيسي' so the distinction from sub-agent is explicit", () => {
    expect(PAGE).toContain("الوكيل الرئيسي");
    expect(PAGE).toContain("data?.agentName");
  });
});
